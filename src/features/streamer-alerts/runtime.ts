import cron from "node-cron";

import { env } from "../../config/env.js";
import { startJobWorker } from "../../infra/jobQueue.js";
import { sendMail } from "../../infra/mail.js";
import logger from "../../infra/logger.js";
import { buildStreamerAlertEmail } from "./email-template.js";
import { checkPendingStreamerVods } from "./vod-linking.service.js";

type StreamerAlertEmailPayload = {
  recipientEmail: string;
  recipientName: string;
  gameName: string;
  streamerTwitchLogin: string;
  twitchUrl: string;
};

function isStreamerAlertEmailPayload(
  payload: Record<string, unknown>,
): payload is StreamerAlertEmailPayload {
  return (
    typeof payload.recipientEmail === "string" &&
    typeof payload.recipientName === "string" &&
    typeof payload.gameName === "string" &&
    typeof payload.streamerTwitchLogin === "string" &&
    typeof payload.twitchUrl === "string"
  );
}

export async function startStreamerAlertsRuntime() {
  const worker = startJobWorker({
    "streamer-alert.email": async (job) => {
      if (!isStreamerAlertEmailPayload(job.payload)) {
        logger.warn("Dropping malformed streamer-alert.email job", { jobId: job.id });
        return;
      }

      const email = buildStreamerAlertEmail(job.payload);
      await sendMail({
        to: job.payload.recipientEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
    },
  });

  const task = cron.schedule(env.streamerAlertVodCron, async () => {
    try {
      await checkPendingStreamerVods();
    } catch (error) {
      logger.error("Streamer alert VOD check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    name: "streamer-alerts",
    stop() {
      worker.stop?.();
      task.stop();
    },
  };
}
