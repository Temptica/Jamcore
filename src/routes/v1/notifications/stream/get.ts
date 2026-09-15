import express from "express";

import { verifySessionToken } from "../../../../auth/session.js";
import { loadRequestUserIdentityBySlug } from "@features/users";
import {
  streamerAlertChannelForUser,
  subscribeLiveEvent,
} from "../../../../infra/liveEvents.js";
import logger from "../../../../infra/logger.js";

const router = express.Router();

// EventSource cannot set an Authorization header, so this route accepts the
// access token as a query param instead of going through authUser/getUser.
router.get("/", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  if (!token) {
    res.status(401).end();
    return;
  }

  let userSlug: string;
  try {
    userSlug = verifySessionToken(token).user;
  } catch {
    res.status(401).end();
    return;
  }

  const user = await loadRequestUserIdentityBySlug(userSlug);
  if (!user) {
    res.status(401).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 25_000);

  const unsubscribe = await subscribeLiveEvent(
    streamerAlertChannelForUser(user.id),
    (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    },
  );

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

export default router;
