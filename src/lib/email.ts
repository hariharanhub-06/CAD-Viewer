import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM || "CAD Review <noreply@example.com>";

/**
 * Send an email via Resend. In dev (no RESEND_API_KEY) it logs to the console
 * instead, so the invite/notification flow is fully testable offline.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!apiKey) {
    console.log("\n[email:dev] (no RESEND_API_KEY — logging instead of sending)");
    console.log(`  to:      ${opts.to}`);
    console.log(`  subject: ${opts.subject}`);
    console.log(`  html:    ${opts.html.replace(/\s+/g, " ").slice(0, 300)}\n`);
    return;
  }
  const resend = new Resend(apiKey);
  await resend.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html });
}

export function inviteEmailHtml(opts: {
  inviterName: string;
  projectName: string;
  url: string;
}): string {
  return `
    <div style="font-family:sans-serif;line-height:1.5">
      <h2>${escapeHtml(opts.inviterName)} shared a CAD model with you</h2>
      <p>You've been invited to review <strong>${escapeHtml(opts.projectName)}</strong>.</p>
      <p><a href="${opts.url}" style="background:#3b82f6;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open the model</a></p>
      <p style="color:#666;font-size:13px">If you don't have an account yet, sign up with this email address to get access.</p>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
