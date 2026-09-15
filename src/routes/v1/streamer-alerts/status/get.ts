import express from "express";

import authUser from "../../../../middleware/authUser";
import getUser from "../../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { getStreamerAlertStatus, streamerAlertStatusQuerySchema } from "@features/streamer-alerts";
import { requireRequestUser } from "@lib/locals";
import { parseQuery } from "../../../../lib/request.js";

const router = express.Router();

router.get(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (req, res) => {
    const { gameId } = parseQuery(req, streamerAlertStatusQuerySchema);
    const actor = requireRequestUser(res);

    res.json(
      await getStreamerAlertStatus({
        gameId,
        actor: { id: actor.id, twitch: actor.twitch, twitchUserId: actor.twitchUserId },
      }),
    );
  }),
);

export default router;
