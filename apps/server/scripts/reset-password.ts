// Sets a new password for an account and ends its sessions. Stop the server first.
//
//   read -rs PASSWORD && printf '%s\n' "$PASSWORD" | DATA_DIR=./data bun apps/server/scripts/reset-password.ts ada@example.org
//
// The new password is the first line of standard input. DATA_DIR defaults to the
// server's default. The output holds no password and no hash.

import { DEFAULT_DATA_DIR } from "../src/config.ts";
import { resetPassword } from "../src/auth/reset-password.ts";

const email = process.argv[2];
if (email === undefined || process.argv.length !== 3) {
  console.error("Usage: bun apps/server/scripts/reset-password.ts <email>   (the new password comes from standard input)");
  process.exit(2);
}

if (process.stdin.isTTY) console.error("Type the new password, press Enter, then Ctrl-D:");
const firstLine = (await Bun.stdin.text()).split("\n")[0]?.replace(/\r$/, "") ?? "";
const dataDir = process.env["DATA_DIR"] === undefined || process.env["DATA_DIR"] === "" ? DEFAULT_DATA_DIR : process.env["DATA_DIR"];

try {
  const result = await resetPassword({ dataDir, email, password: firstLine });
  console.log(`The password of ${result.email} is changed, and ${result.sessionsEnded} session(s) ended.`);
} catch (error) {
  // A PersistenceError names a file and a ResetError names the problem; neither holds a secret.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
