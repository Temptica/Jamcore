import express from "express";

import authUser from "../../../../middleware/authUser";
import getUser from "../../../../loaders/getUser.js";
import rateLimit from "@middleware/rateLimit";
import { asyncHandler } from "../../../../middleware/asyncHandler.js";
import { buildTwitchAuthorizeUrl } from "@features/twitch-connect";
import { requireRequestUser } from "@lib/locals";

const router = express.Router();

router.get(
  "/",
  rateLimit(),
  authUser,
  getUser,
  asyncHandler(async (_req, res) => {
    const user = requireRequestUser(res);
    res.json({ url: buildTwitchAuthorizeUrl(user.id) });
  }),
);

export default router;
