import { query, closePool } from "../src/db/pool.js";
import { setEmailProvider, type EmailMessage, type EmailProvider } from "../src/services/email.js";

export const hasDb = !!process.env.DATABASE_URL;

export class CapturingEmailProvider implements EmailProvider {
  sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<{ id: string | null }> {
    this.sent.push(msg);
    return { id: `msg_${this.sent.length}` };
  }
  last(): EmailMessage {
    const m = this.sent[this.sent.length - 1];
    if (!m) throw new Error("no email sent");
    return m;
  }
}

export function captureEmail(): CapturingEmailProvider {
  const p = new CapturingEmailProvider();
  setEmailProvider(p);
  return p;
}

export async function truncateAll(): Promise<void> {
  await query(`TRUNCATE users, magic_links, sessions, opportunities, alert_criteria, digests, stripe_events, job_runs CASCADE`);
}

export async function teardown(): Promise<void> {
  setEmailProvider(undefined);
  await closePool();
}

export function magicToken(msg: EmailMessage): string {
  const m = msg.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!m?.[1]) throw new Error("no token in email");
  return m[1];
}
