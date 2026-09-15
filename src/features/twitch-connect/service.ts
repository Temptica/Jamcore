import axios from "axios";
import jwt from "jsonwebtoken";

import db from "../../infra/db.js";
import { env } from "../../config/env.js";
import logger from "../../infra/logger.js";
import { TTLCache } from "../../lib/cache.js";
import {
  BadRequestError,
  ConfigurationError,
  ConflictError,
} from "../../lib/errors.js";

const LINK_STATE_PURPOSE = "twitch-link";
const LINK_STATE_EXPIRES_IN = "10m";

type TwitchTokenResponse = {
  access_token: string;
  expires_in?: number;
};

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
};

type TwitchUsersResponse = {
  data: TwitchUser[];
};

function requireTwitchCredentials() {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const redirectUri = env.twitchOAuthRedirectUri;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new ConfigurationError(
      "Twitch integration is not configured on this server.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

function getTokenSecret() {
  if (!env.tokenSecret) {
    throw new ConfigurationError("Token secret not set up");
  }

  return env.tokenSecret;
}

export function signTwitchLinkState(userId: number) {
  return jwt.sign(
    { purpose: LINK_STATE_PURPOSE, userId },
    getTokenSecret(),
    { expiresIn: LINK_STATE_EXPIRES_IN },
  );
}

function verifyTwitchLinkState(state: string): number {
  let decoded: unknown;
  try {
    decoded = jwt.verify(state, getTokenSecret());
  } catch {
    throw new BadRequestError("This Twitch link request expired. Please try again.");
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    (decoded as { purpose?: string }).purpose !== LINK_STATE_PURPOSE ||
    typeof (decoded as { userId?: unknown }).userId !== "number"
  ) {
    throw new BadRequestError("Invalid Twitch link request.");
  }

  return (decoded as { userId: number }).userId;
}

export function buildTwitchAuthorizeUrl(userId: number) {
  const { clientId, redirectUri } = requireTwitchCredentials();
  const state = signTwitchLinkState(userId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "",
    state,
  });

  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForUserToken(code: string) {
  const { clientId, clientSecret, redirectUri } = requireTwitchCredentials();

  const response = await axios.post<TwitchTokenResponse>(
    "https://id.twitch.tv/oauth2/token",
    null,
    {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      },
    },
  );

  return response.data.access_token;
}

async function fetchAuthorizedTwitchUser(userAccessToken: string) {
  const { clientId } = requireTwitchCredentials();

  const response = await axios.get<TwitchUsersResponse>(
    "https://api.twitch.tv/helix/users",
    {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${userAccessToken}`,
      },
    },
  );

  const user = response.data.data[0];
  if (!user) {
    throw new BadRequestError("Could not read your Twitch account.");
  }

  return user;
}

export async function linkTwitchAccount({
  userId,
  code,
  state,
}: {
  userId: number;
  code: string;
  state: string;
}) {
  const stateUserId = verifyTwitchLinkState(state);
  if (stateUserId !== userId) {
    throw new BadRequestError("This Twitch link request does not match your account.");
  }

  const userAccessToken = await exchangeCodeForUserToken(code);
  const twitchUser = await fetchAuthorizedTwitchUser(userAccessToken);

  const existingOwner = await db.user.findUnique({
    where: { twitchUserId: twitchUser.id },
    select: { id: true },
  });
  if (existingOwner && existingOwner.id !== userId) {
    throw new ConflictError("That Twitch account is already connected to another user.");
  }

  return db.user.update({
    where: { id: userId },
    data: {
      twitch: twitchUser.login,
      twitchUserId: twitchUser.id,
      twitchLinkedAt: new Date(),
    },
    select: { id: true, slug: true, twitch: true, twitchUserId: true, twitchLinkedAt: true },
  });
}

export async function unlinkTwitchAccount(userId: number) {
  return db.user.update({
    where: { id: userId },
    data: {
      twitch: null,
      twitchUserId: null,
      twitchLinkedAt: null,
    },
    select: { id: true, slug: true, twitch: true, twitchUserId: true, twitchLinkedAt: true },
  });
}

// --- App-only Helix access, used for live/VOD lookups that don't need a
// user's own token (the OAuth link above only proves identity once). ---

type AppTokenCacheEntry = { accessToken: string };
const appTokenCache = new TTLCache<AppTokenCacheEntry>(50 * 60_000, "twitch-app-token");

async function getAppAccessToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  const cached = await appTokenCache.getOrSet("app-token", async () => {
    const response = await axios.post<TwitchTokenResponse>(
      "https://id.twitch.tv/oauth2/token",
      null,
      {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        },
      },
    );
    return { accessToken: response.data.access_token };
  });

  return cached.accessToken;
}

export type TwitchLiveStream = {
  id: string;
  gameName: string;
  title: string;
  startedAt: string;
};

export async function getLiveStreamForTwitchUser(
  twitchUserId: string,
): Promise<TwitchLiveStream | null> {
  const { clientId } = requireTwitchCredentials();
  const accessToken = await getAppAccessToken();
  if (!accessToken) return null;

  try {
    const response = await axios.get<{
      data: Array<{
        id: string;
        game_name: string;
        title: string;
        started_at: string;
        type: string;
      }>;
    }>("https://api.twitch.tv/helix/streams", {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${accessToken}`,
      },
      params: { user_id: twitchUserId },
    });

    const stream = response.data.data.find((entry) => entry.type === "live");
    if (!stream) return null;

    return {
      id: stream.id,
      gameName: stream.game_name,
      title: stream.title,
      startedAt: stream.started_at,
    };
  } catch (error) {
    logger.error("Failed to check Twitch live status", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export type TwitchVod = {
  id: string;
  url: string;
  createdAt: string;
  durationSeconds: number;
};

function parseTwitchDuration(duration: string): number {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(duration.trim());
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return (
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

export async function findVodContainingTimestamp({
  twitchUserId,
  timestamp,
}: {
  twitchUserId: string;
  timestamp: Date;
}): Promise<TwitchVod | null> {
  const { clientId } = requireTwitchCredentials();
  const accessToken = await getAppAccessToken();
  if (!accessToken) return null;

  try {
    const response = await axios.get<{
      data: Array<{
        id: string;
        url: string;
        created_at: string;
        duration: string;
        type: string;
      }>;
    }>("https://api.twitch.tv/helix/videos", {
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${accessToken}`,
      },
      params: { user_id: twitchUserId, type: "archive", first: 20 },
    });

    for (const video of response.data.data) {
      const createdAt = new Date(video.created_at);
      const durationSeconds = parseTwitchDuration(video.duration);
      const endsAt = new Date(createdAt.getTime() + durationSeconds * 1000);

      if (timestamp >= createdAt && timestamp <= endsAt) {
        return {
          id: video.id,
          url: video.url,
          createdAt: video.created_at,
          durationSeconds,
        };
      }
    }

    return null;
  } catch (error) {
    logger.error("Failed to look up Twitch VOD", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
