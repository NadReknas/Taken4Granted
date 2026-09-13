import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { fetchWithRetry } from "../lib/retry.js";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<{ id: string | null }>;
}

export class ConsoleEmailProvider implements EmailProvider {
  public readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
    logger.info({ to: msg.to, subject: msg.subject, text: msg.text }, "email (console provider)");
    return { id: `console-${Date.now()}` };
  }
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(msg: EmailMessage) {
    const res = await fetchWithRetry(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: this.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      },
      { retries: 3, onRetry: (err, attempt) => logger.warn({ err, attempt }, "resend retry") },
    );
    const body = (await res.json()) as { id?: string };
    return { id: body.id ?? null };
  }
}

let provider: EmailProvider | undefined;

export function emailProvider(): EmailProvider {
  if (provider) return provider;
  const cfg = config();
  if (cfg.EMAIL_PROVIDER === "resend") {
    if (!cfg.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
    provider = new ResendEmailProvider(cfg.RESEND_API_KEY, cfg.EMAIL_FROM);
  } else {
    provider = new ConsoleEmailProvider();
  }
  return provider;
}

export function setEmailProvider(p: EmailProvider | undefined): void {
  provider = p;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:600px;margin:0 auto;padding:24px">
  <div style="font-weight:700;font-size:18px;margin-bottom:16px">Grant &amp; Incentive Radar</div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px">
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
    ${bodyHtml}
  </div>
  <p style="color:#6b7280;font-size:12px;margin-top:16px">You receive this because you have an account at Grant &amp; Incentive Radar. Manage alerts or unsubscribe from your dashboard.</p>
</div></body></html>`;
}
