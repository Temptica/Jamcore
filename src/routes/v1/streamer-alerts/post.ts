import express from "express";

import authUser from "../../../middleware/authUser";
import getUser from "../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../middleware/asyncHandler.js";
import { createStreamerAlert, createStreamerAlertSchema } from "@features/streamer-alerts";
import { requireRequestUser } from "@lib/locals";
import { parseBody } from "../../../lib/request.js";

const router = express.Router();

router.post(
  "/",
  rateLimit(5, 60_000),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { gameId } = parseBody(req, createStreamerAlertSchema);
    const actor = requireRequestUser(res);

    const alert = await createStreamerAlert({
      gameId,
      actor: { id: actor.id, twitch: actor.twitch, twitchUserId: actor.twitchUserId },
    });

    res.status(201).json(alert);
  }),
);

export default router;
