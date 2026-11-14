// Sending email over SMTP. This is the only file that knows nodemailer: everything else gets a
// MailSender, so the tests pass a fake one and a server without mail settings passes none.
//
// TLS: port 465 speaks TLS from the first byte; any other port (587) must upgrade with STARTTLS,
// and the send fails when the server does not offer it, so a password never crosses in clear text.
// Nothing connects at start: a wrong setting shows at the first send, as mail_failed and a log line.

import nodemailer from "nodemailer";

export interface OutgoingMail {
  readonly to: string;
  readonly subject: string;
  /** Plain text only. */
  readonly text: string;
}

export interface MailSender {
  /** Resolves when the SMTP server accepted the mail; rejects with the SMTP error otherwise. */
  sendMail(mail: OutgoingMail): Promise<void>;
}

/** The SMTP_* and MAIL_FROM settings (config.ts). */
export interface MailSettings {
  readonly host: string;
  readonly port: number;
  /** null for a relay that takes mail without a login. */
  readonly login: { readonly user: string; readonly pass: string } | null;
  /** The From address, for example "AlgoTank <game@example.org>". */
  readonly from: string;
}

export const DEFAULT_SMTP_PORT = 465;
/** A send that takes longer fails, so a request never hangs on a dead mail server. */
const SMTP_TIMEOUT_MS = 20_000;

export function smtpSender(settings: MailSettings): MailSender {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: settings.port !== 465,
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
    ...(settings.login === null ? {} : { auth: { user: settings.login.user, pass: settings.login.pass } }),
  });
  return {
    async sendMail(mail) {
      await transport.sendMail({ from: settings.from, to: mail.to, subject: mail.subject, text: mail.text });
    },
  };
}
