import express from "express";
import { z } from "zod";

import rateLimit from "@middleware/rateLimit";
import { linkTwitchAccount } from "@features/twitch-connect";
import { env } from "../../../../config/env.js";
import logger from "../../../../infra/logger.js";
import jwt from "jsonwebtoken";

const router = express.Router();

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

router.get(
  "/",
  rateLimit(20, 60_000),
  async (req, res) => {
    const settingsUrl = `${env.clientOrigin}/settings`;
    const input = callbackQuerySchema.safeParse(req.query);

    if (!input.success || input.data.error) {
      res.redirect(`${settingsUrl}?twitch=error`);
      return;
    }

    const { code, state } = input.data;
    if (!code || !state) {
      res.redirect(`${settingsUrl}?twitch=error`);
      return;
    }

    try {
      const decoded = jwt.decode(state) as { userId?: number } | null;
      if (!decoded?.userId) {
        res.redirect(`${settingsUrl}?twitch=error`);
        return;
      }

      await linkTwitchAccount({ userId: decoded.userId, code, state });
      res.redirect(`${settingsUrl}?twitch=linked`);
    } catch (error) {
      logger.warn("Twitch account link failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      res.redirect(`${settingsUrl}?twitch=error`);
    }
  },
);

export default router;
