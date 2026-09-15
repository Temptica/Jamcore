import { z } from "zod";

import db from "../../infra/db.js";
import logger from "../../infra/logger.js";
import { enqueueJob } from "../../infra/jobQueue.js";
import { publishLiveEvent, streamerAlertChannelForUser } from "../../infra/liveEvents.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../lib/errors.js";
import { getLiveStreamForTwitchUser } from "../twitch-connect/index.js";

export const createStreamerAlertSchema = z.object({
  gameId: z.coerce.number().int().positive(),
});

export const streamerAlertStatusQuerySchema = z.object({
  gameId: z.coerce.number().int().positive(),
});

type StreamerActor = {
  id: number;
  twitch: string | null;
  twitchUserId: string | null;
};

async function loadGameWithDevs(gameId: number) {
  const devSelect = { id: true, name: true, email: true } as const;

  const game = await db.game.findUnique({
    where: { id: gameId },
    include: {
      team: {
        include: {
          owner: { select: devSelect },
          users: { select: devSelect },
        },
      },
      pages: {
        where: { version: "JAM" },
        select: { name: true },
        take: 1,
      },
    },
  });

  if (!game) {
    throw new NotFoundError("Game not found.");
  }

  return game;
}

export async function getStreamerAlertStatus({
  gameId,
  actor,
}: {
  gameId: number;
  actor: StreamerActor;
}) {
  const existing = await db.streamerGameAlert.findUnique({
    where: { streamerId_gameId: { streamerId: actor.id, gameId } },
    select: {
      id: true,
      startedAt: true,
      vodUrl: true,
      vodTimestampSeconds: true,
    },
  });

  return {
    eligible: Boolean(actor.twitchUserId),
    alreadyNotified: Boolean(existing),
    alert: existing,
  };
}

export async function createStreamerAlert({
  gameId,
  actor,
}: {
  gameId: number;
  actor: StreamerActor;
}) {
  if (!actor.twitchUserId || !actor.twitch) {
    throw new BadRequestError("Connect your Twitch account before notifying devs.");
  }

  const existing = await db.streamerGameAlert.findUnique({
    where: { streamerId_gameId: { streamerId: actor.id, gameId } },
  });
  if (existing) {
    throw new ConflictError("You've already let the devs know you're streaming this game.");
  }

  const game = await loadGameWithDevs(gameId);

  const liveStream = await getLiveStreamForTwitchUser(actor.twitchUserId);
  if (!liveStream) {
    throw new BadRequestError("You need to be live on Twitch to notify the devs.");
  }

  const alert = await db.streamerGameAlert.create({
    data: {
      gameId: game.id,
      streamerId: actor.id,
      twitchUserId: actor.twitchUserId,
      twitchLogin: actor.twitch,
      twitchStreamId: liveStream.id,
      startedAt: new Date(liveStream.startedAt),
    },
  });

  await notifyDevsOfStreamer({ game, streamerTwitchLogin: actor.twitch, streamerId: actor.id });

  await db.streamerGameAlert.update({
    where: { id: alert.id },
    data: { notifiedAt: new Date() },
  });

  return alert;
}

type GameWithDevs = Awaited<ReturnType<typeof loadGameWithDevs>>;

async function notifyDevsOfStreamer({
  game,
  streamerTwitchLogin,
  streamerId,
}: {
  game: GameWithDevs;
  streamerTwitchLogin: string;
  streamerId: number;
}) {
  const gameName = game.pages[0]?.name ?? game.slug;
  const twitchUrl = `https://twitch.tv/${streamerTwitchLogin}`;

  const recipients = new Map<number, { id: number; name: string; email: string | null }>();
  recipients.set(game.team.owner.id, game.team.owner);
  for (const member of game.team.users) {
    recipients.set(member.id, member);
  }
  recipients.delete(streamerId);

  if (recipients.size === 0) return;

  const preferences = await db.notificationPreference.findMany({
    where: { userId: { in: [...recipients.keys()] } },
  });
  const preferenceByUserId = new Map(preferences.map((pref) => [pref.userId, pref]));

  await db.notification.createMany({
    data: [...recipients.values()].map((recipient) => ({
      type: "STREAMER_LIVE" as const,
      recipientId: recipient.id,
      title: "A streamer is live playing your game!",
      body: `${streamerTwitchLogin} is live on Twitch playing ${gameName}.`,
      link: twitchUrl,
      gameId: game.id,
    })),
  });

  for (const recipient of recipients.values()) {
    const preference = preferenceByUserId.get(recipient.id);

    if (!(preference?.streamerAlertSoundOptOut ?? false)) {
      await publishLiveEvent(streamerAlertChannelForUser(recipient.id), {
        type: "STREAMER_LIVE",
        gameId: game.id,
        gameName,
        gameSlug: game.slug,
        streamerTwitchLogin,
        twitchUrl,
        soundUrl: preference?.streamerAlertSoundUrl ?? null,
      });
    }

    if ((preference?.streamerAlertEmailOptOut ?? false) || !recipient.email) continue;

    await enqueueJob({
      type: "streamer-alert.email",
      payload: {
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        gameName,
        streamerTwitchLogin,
        twitchUrl,
      },
    });
  }

  logger.info("Notified devs of live streamer", {
    gameId: game.id,
    streamerTwitchLogin,
    recipientCount: recipients.size,
  });
}
