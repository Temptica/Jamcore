import db from "../../infra/db.js";
import logger from "../../infra/logger.js";
import { findVodContainingTimestamp, getLiveStreamForTwitchUser } from "../twitch-connect/index.js";

// Twitch VODs typically publish within a few minutes of a stream ending, but
// give up eventually so we don't poll forever for a stream that never
// published a VOD (deleted, exported elsewhere, etc).
const MAX_VOD_CHECK_ATTEMPTS = 60;

export async function checkPendingStreamerVods() {
  const pending = await db.streamerGameAlert.findMany({
    where: {
      vodId: null,
      vodCheckAttempts: { lt: MAX_VOD_CHECK_ATTEMPTS },
    },
    take: 50,
    orderBy: { createdAt: "asc" },
  });

  for (const alert of pending) {
    try {
      await checkPendingStreamerVod(alert);
    } catch (error) {
      logger.error("Failed to check streamer VOD", {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function checkPendingStreamerVod(alert: { id: number; twitchUserId: string; startedAt: Date; vodCheckAttempts: number }) {
  const stillLive = await getLiveStreamForTwitchUser(alert.twitchUserId);
  if (stillLive) {
    // Wait for the stream to end before looking for its VOD.
    return;
  }

  const vod = await findVodContainingTimestamp({
    twitchUserId: alert.twitchUserId,
    timestamp: alert.startedAt,
  });

  if (!vod) {
    await db.streamerGameAlert.update({
      where: { id: alert.id },
      data: {
        vodCheckedAt: new Date(),
        vodCheckAttempts: { increment: 1 },
      },
    });
    return;
  }

  const offsetSeconds = Math.max(
    0,
    Math.floor((alert.startedAt.getTime() - new Date(vod.createdAt).getTime()) / 1000),
  );

  await db.streamerGameAlert.update({
    where: { id: alert.id },
    data: {
      vodId: vod.id,
      vodUrl: buildTimestampedVodUrl(vod.url, offsetSeconds),
      vodTimestampSeconds: offsetSeconds,
      vodCheckedAt: new Date(),
      vodCheckAttempts: { increment: 1 },
    },
  });
}

function buildTimestampedVodUrl(vodUrl: string, offsetSeconds: number) {
  const hours = Math.floor(offsetSeconds / 3600);
  const minutes = Math.floor((offsetSeconds % 3600) / 60);
  const seconds = offsetSeconds % 60;
  const timestamp = `${hours}h${minutes}m${seconds}s`;
  const separator = vodUrl.includes("?") ? "&" : "?";
  return `${vodUrl}${separator}t=${timestamp}`;
}
