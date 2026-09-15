import nodemailer, { type Transporter } from "nodemailer";

import { env } from "../config/env.js";
import logger from "./logger.js";

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) {
    return transporter;
  }

  if (!env.smtpHost || !env.mailFrom) {
    logger.warn("Skipping mail transport setup because SMTP is not configured.");
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: env.smtpUser
      ? {
          user: env.smtpUser,
          pass: env.smtpPassword,
        }
      : undefined,
  });

  return transporter;
}

export type SendMailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendMail(input: SendMailInput) {
  const client = getTransporter();
  if (!client) {
    logger.warn("Mail not sent because SMTP is not configured.", { to: input.to, subject: input.subject });
    return false;
  }

  await client.sendMail({
    from: env.mailFrom,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  return true;
}
