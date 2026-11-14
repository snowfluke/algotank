// The text of the code emails, in the language of the page that asked. Plain text and short:
// what the code is for, the code, how long it works, and that nothing happens when the reader
// did not ask for it.

import type { MailLanguage } from "@game/arena";
import type { OutgoingMail } from "../mail.ts";
import type { CodePurpose } from "./codes.ts";

const TEXT: Readonly<Record<MailLanguage, { readonly subject: string; readonly body: (purpose: CodePurpose, code: string) => string }>> = {
  en: {
    subject: "Your AlgoTank code",
    body: (purpose, code) =>
      [
        "Hello,",
        "",
        purpose === "verify" ? "This is your code to verify your email address in AlgoTank:" : "This is your code to set a new password in AlgoTank:",
        "",
        code,
        "",
        "The code works for 15 minutes.",
        "",
        purpose === "verify"
          ? "If you did not create an AlgoTank account, you can ignore this email, and nothing happens."
          : "If you did not ask for a new password, you can ignore this email, and your password stays the same.",
      ].join("\n"),
  },
  id: {
    subject: "Kode AlgoTank kamu",
    body: (purpose, code) =>
      [
        "Halo,",
        "",
        purpose === "verify" ? "Ini kode untuk memverifikasi alamat emailmu di AlgoTank:" : "Ini kode untuk membuat kata sandi baru di AlgoTank:",
        "",
        code,
        "",
        "Kode ini berlaku selama 15 menit.",
        "",
        purpose === "verify"
          ? "Kalau kamu tidak membuat akun AlgoTank, abaikan saja email ini, dan tidak ada yang berubah."
          : "Kalau kamu tidak meminta kata sandi baru, abaikan saja email ini, dan kata sandimu tetap sama.",
      ].join("\n"),
  },
};

export function codeMail(to: string, purpose: CodePurpose, code: string, language: MailLanguage): OutgoingMail {
  const text = TEXT[language];
  return { to, subject: text.subject, text: text.body(purpose, code) };
}
