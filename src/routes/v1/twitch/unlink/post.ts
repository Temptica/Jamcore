import express from "express";

import authUser from "../../../../middleware/authUser";
import getUser from "../../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { unlinkTwitchAccount } from "@features/twitch-connect";
import { requireRequestUser } from "@lib/locals";

const router = express.Router();

router.post(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (_req, res) => {
    const user = requireRequestUser(res);
    res.json(await unlinkTwitchAccount(user.id));
  }),
);

export default router;
