# Work packages E1 (email verification) and S3 (sequence action)

Read `00-overview.md` first. Both start after O1 (`75-organiser-tournament.md`) has finished. They own different folders and can run side by side.

## E1: email verification and password reset by email

Owner, 2026-11-13: "For email, I think we need verifying mechanism, I will sign in to my email and get the app password." An arena's join policy "verified" (O1) depends on this.

You own `apps/server/src/auth/**`, a new `apps/server/src/mail.ts`, the server's config, `apps/web/src/auth/**` and the sign-in pages, the README (settings), `deploy/env.example`, `docs/deployment/` (a short section on mail), and a decision-log section.

| Topic | Decision |
|-------|----------|
| Sending | SMTP over TLS with the settings `SMTP_HOST`, `SMTP_PORT` (default 465), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. New dependency: `nodemailer` (the one allowed). `mail.ts` is the only file that knows it; everything else calls `sendMail({ to, subject, text })` through an injected sender, so tests use a fake. |
| No mail settings | The server starts and works as today; sign-up says that this server cannot verify email addresses, accounts stay unverified, and the reset page says to ask the server's operator (the manual way of today stays). The create form disables the "verified" join policy with a sentence that says why. `GET /api/auth/capabilities` tells the page. |
| Verification | After sign-up the account is unverified and gets a 6-digit code by email, valid for 15 minutes, 5 wrong tries, then a new code is needed. "Send a new code" at most once per minute and 5 per hour per account. Entering the code marks the account verified (O1's function). A signed-in unverified account sees one line with the action "Verify my email" in the account menu and on the pages that need it. |
| What needs a verified email | Joining an arena whose policy is "verified". Creating an arena stays possible for any account (owner's choice of 2026-11-13 names only the join policy). |
| Reset | "Forgot password" takes the email, always answers the same sentence (it never tells whether the address has an account), and sends a 6-digit code valid for 15 minutes; the code plus a new password sets it and ends every other session of the account. Same limits as above, plus per address of the requester. |
| Text of the emails | Plain text, in the language the page was in, short: what the code is for, the code, how long it is valid, and that nothing happens when the reader did not ask for it. |
| Stored | Codes are stored hashed with their expiry and try count in the auth store; never logged. |
| Limits to state | A Gmail account sends about 500 emails a day. A verified email proves control of a mailbox, not one person: one person with two mailboxes can still hold two accounts. |

State machine of an account's email (table in the file's header before the code): unverified → code sent → verified; code expired or tries used up → unverified with no live code. Tests through the routes with the fake sender and the injected clock for every transition and every limit. Web: the code step fits the sign-in pages' layout without scroll, the six digits are one input with `inputmode="numeric"` and `autocomplete="one-time-code"`, errors say what to do. Audit states for each new step in both languages; the whole audit at the end.

### E1 also: link previews need an absolute image address

`apps/web/index.html` has `<meta property="og:image" content="/og-image.png">` (added 2026-11-13 with a favicon and icons in `apps/web/public/`). WhatsApp and most sites need an absolute address. When the server serves `index.html` (`static.ts`), it writes the request's own origin (the existing host helper with `TRUST_PROXY`, `https` when `COOKIE_SECURE` is on) in front of that one path, and adds `og:url`. A test covers a proxied and a direct request. Check that the icons and the image are served with a cache lifetime and the right content type.

### E1 also: three follow-ups from O1 (as built 2026-11-13)

O1 exported `Auth.markEmailVerified` and `Auth.accountById`; the accounts file is version 2 with `emailVerified`; the join route answers 403 `email_not_verified`. For these follow-ups you may also edit `apps/server/src/routes.ts`, `packages/arena/**` and `apps/web/src/player/**`, only as far as each row needs.

| Follow-up | Decision |
|-----------|----------|
| Seat on a second device | In an arena that needs an account, an account that already has a seat and joins from a browser without that seat's token gets the same seat back with a new token, and the old token stops working. Today it gets 409 `account_seat_taken` and cannot return. Arenas for anyone do not change. Tests through the routes: second device takes the seat, first device's token is refused, a banned account still gets 403. |
| Final ranking after a removal | A player removed in a break leaves no gap: places are consecutive (7, 8, not 7, 9) in the finished view and in the stored result. |
| "Verified" without mail | Until the server has mail settings, the create form's "verified email" choice is disabled with a sentence that says why (the decision in the table above). |

## S3: a rule can run a short sequence of steps

Owner, 2026-11-13: "like if I get shot, I move forward, turn left, move forward. Is something like that possible?" Today a rule picks one action for one turn, so a fixed order of steps needs one mode per step.

You own `packages/engine/**`, `apps/web/src/{prep,vocabulary,editor,practice,live,guide}/**`, the audit's states for the rule editor, and a decision-log section. You do not change what an existing strategy does: the stored shape of a rule with one action stays valid and plays as before.

| Topic | Decision |
|-------|----------|
| Shape | A rule's action is one action (as today) or a sequence of 2 to 4 steps. A step is one of the atomic actions only: step forward, turn left, turn right, turn around when the engine has it, shoot, wait. Shortcuts such as "move toward" are not steps, because they already decide per turn. |
| Play | When a rule with a sequence fires, the tank does step 1 on that turn and the next steps on the following turns without reading its rules, then reads the rules again. A step that cannot happen (the square ahead is taken, no water for a shot) is skipped as that atomic action is skipped today, and the sequence goes on. A sequence ends early when the round ends. The tank's place in a sequence is part of the round's state, so a replay is identical (the engine stays deterministic). |
| With modes | A rule's "switch to mode" happens when its sequence has finished. |
| Limits | 4 steps per sequence, validated by `parseStrategy` with a clear issue sentence; the existing limits on rules and modes stay. |
| Editor | In the rule's "Do" part, a choice between "One action" and "Steps in order" ("Langkah berurutan"). Steps show as a row of blocks joined by arrows in the action colour, each with its icon; the same row shows in the rule card. Add, remove and reorder steps with large buttons; no drag needed. |
| Seeing it | The Try it replay and the live "My tank" feed say which step of which rule the tank is doing ("rule 2, step 2 of 3"), and the rule card of a running sequence is marked in the replay. |
| Built-in play styles | Unchanged. One new line in the workshop tour is not needed. |

Tests: engine tests for the order of steps, the skip, the end of round, the mode switch after the last step, determinism of a replay, and `parseStrategy` (valid, too long, a shortcut as a step). Web tests for the sentence and blocks of a sequence in both languages. The whole no-scroll audit at the end, with new states for a rule with 4 steps at 360 x 640 in both languages.

## Both

Never `bun run build`; never port 8787; build to your own folder; E1 serves on port 9001 and S3 on port 9002. Keep only your final audit folder. Report briefly.

E1 and S3 run at the same time, and a video builder uses port 8998 and its own headless browsers. So: edit shared files (the message catalogs, the audit's state list, the decision log) with small targeted edits after re-reading them, never a whole-file rewrite; when a test fails in a file the other builder owns, report it and do not fix it. This is a work laptop: one headless browser at a time, and audit only your own new and changed states (pass them as the states argument). The lead runs the whole audit once after both packages.

## Status 2026-11-14

E1 and S3 are built. `bun test` 1,994 pass; type-check clean; whole no-scroll audit 4,950 of 4,950. S3 added a `wait` action (move `W`) and offers forward, turn left/right, slight left/right, shoot and wait as steps; the tank's place in a sequence lives in the round's private state, which the server's round runner keeps between turns. Open: no real email was ever sent (the owner's first sign-up is the test); the Gmail steps in `docs/deployment/10-mail.md` are unverified; send limits reset on a restart; the home tour's highlight draws over the open account menu.
