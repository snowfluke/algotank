# 10. Mail: email verification and password reset

The server sends two kinds of email: a 6-digit code that verifies the email address of a new account, and a 6-digit code that sets a new password ("Forgot password"). Each code works for 15 minutes and allows 5 wrong tries. An account can ask for a code at most once a minute and 5 times an hour. A reset request is also limited per client address.

Without mail settings, the server starts and works as before. Accounts stay unverified, the create form disables the join policy "Players with a verified email", and the sign-in page tells a person who forgot a password to ask the operator (`bun apps/server/scripts/reset-password.ts`, see `README.md`).

## Settings

Put these lines in `/etc/algotank/env` (`deploy/env.example` has them commented out). Restart the service after a change.

| Variable | Meaning | Default |
|----------|---------|---------|
| `SMTP_HOST` | The mail server. Without it the server sends no email. | not set |
| `SMTP_PORT` | `465` for TLS from the start, or a port that offers STARTTLS, such as `587`. The server refuses to send over a connection without TLS. | `465` |
| `SMTP_USER` | The login at the mail server. Set it together with `SMTP_PASS`, or neither. | not set |
| `SMTP_PASS` | The password of that login. | not set |
| `MAIL_FROM` | The sender of the emails, for example `AlgoTank <game@example.org>`. Required with `SMTP_HOST`. | not set |

The server checks the settings at start: a half-set group (for example `SMTP_USER` without `SMTP_PASS`) stops the start with a message that names the variable. The server does not connect to the mail server at start, so a wrong password shows at the first send: the page says that the email did not go out, and the log has a line "could not be sent" with the mail server's error. The log never holds a code.

## Example: a Gmail account with an app password

1. Sign in to the Gmail account that sends the emails. Use an account for the game, not a personal one.
2. Turn on 2-Step Verification for that account. Google offers app passwords only with it.
3. Make an app password for "AlgoTank" in the Google account's security settings (App passwords). Google shows 16 letters once. Copy them.
4. Write the settings:

   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=you@gmail.com
   SMTP_PASS=abcdefghijklmnop
   MAIL_FROM=AlgoTank <you@gmail.com>
   ```

5. Restart the service: `sudo systemctl restart algotank` (or `pm2 restart algotank`, see `08-pm2.md`).
6. Check: the log line at start says "Email codes go out through smtp.gmail.com:465". Create an account on the site with an address you can read, and type the code from the email.

Google's menus change from time to time. If a step above does not match, search Google's help for "Sign in with app passwords".

## Limits

- A Gmail account sends about 500 emails a day. Each sign-up sends one email, and each "Send a new code" or password reset sends one more. Above the limit the sends fail until the next day: new players see that the email did not go out. For a larger event, use a mail service with a higher limit and put its settings in the same five variables.
- A verified email proves that the player can read that mailbox. It does not prove one person: one person with two mailboxes can still hold two accounts.
- The send limits are kept in memory, so a restart lets an account ask for a code again at once. The codes themselves are kept in `DATA_DIR/auth/codes.json` (only as password hashes) and survive a restart.
- An email can land in the spam folder, mostly in the first days of a new sending account. Tell players to look there.
