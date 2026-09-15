import { EventEmitter } from "node:events";

import { getRedisClient } from "./redis.js";
import logger from "./logger.js";

const localEmitter = new EventEmitter();
localEmitter.setMaxListeners(0);

let redisSubscriberPromise: Promise<any | null> | null = null;

async function getRedisSubscriber() {
  const baseClient = await getRedisClient();
  if (!baseClient) return null;

  if (!redisSubscriberPromise) {
    redisSubscriberPromise = (async () => {
      const subscriber = baseClient.duplicate();
      subscriber.on("error", (error: unknown) => {
        logger.error("Live events Redis subscriber error", { error });
      });
      await subscriber.connect();
      return subscriber;
    })().catch((error) => {
      logger.error("Failed to start live events Redis subscriber", { error });
      redisSubscriberPromise = null;
      return null;
    });
  }

  return redisSubscriberPromise;
}

export async function publishLiveEvent(channel: string, payload: unknown) {
  const redis = await getRedisClient();
  const serialized = JSON.stringify(payload);

  if (redis) {
    await redis.publish(channel, serialized);
    return;
  }

  localEmitter.emit(channel, serialized);
}

export async function subscribeLiveEvent(
  channel: string,
  onMessage: (payload: unknown) => void,
): Promise<() => void> {
  const subscriber = await getRedisSubscriber();

  if (subscriber) {
    const listener = (message: string) => {
      try {
        onMessage(JSON.parse(message));
      } catch (error) {
        logger.error("Failed to parse live event payload", { error });
      }
    };

    await subscriber.subscribe(channel, listener);
    return () => {
      void subscriber.unsubscribe(channel, listener);
    };
  }

  const listener = (message: string) => {
    try {
      onMessage(JSON.parse(message));
    } catch (error) {
      logger.error("Failed to parse live event payload", { error });
    }
  };

  localEmitter.on(channel, listener);
  return () => {
    localEmitter.off(channel, listener);
  };
}

export function streamerAlertChannelForUser(userId: number) {
  return `streamer-alerts:user:${userId}`;
}
