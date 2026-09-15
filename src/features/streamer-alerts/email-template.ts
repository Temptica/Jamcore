export function buildStreamerAlertEmail({
  recipientName,
  gameName,
  streamerTwitchLogin,
  twitchUrl,
}: {
  recipientName: string;
  gameName: string;
  streamerTwitchLogin: string;
  twitchUrl: string;
}) {
  const subject = `${streamerTwitchLogin} is live playing ${gameName}`;

  const text = `Hey ${recipientName},\n\n${streamerTwitchLogin} just went live on Twitch playing ${gameName}.\n\nWatch: ${twitchUrl}\n\nYou can turn these emails off in your notification settings.`;

  const html = `
    <p>Hey ${escapeHtml(recipientName)},</p>
    <p><strong>${escapeHtml(streamerTwitchLogin)}</strong> just went live on Twitch playing <strong>${escapeHtml(gameName)}</strong>.</p>
    <p><a href="${escapeHtml(twitchUrl)}">Watch the stream</a></p>
    <p style="color:#888;font-size:12px;">You can turn these emails off in your notification settings.</p>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
