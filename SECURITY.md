# Security

## Report a vulnerability

Do not open a public issue for a vulnerability. A public issue shows the problem to everyone before a fix exists.

1. Open the repository on GitHub.
2. Open the "Security" tab.
3. Click "Report a vulnerability". This opens a private report that only the maintainer sees.
4. Write the report and send it.

## What to include

- What an attacker can do, and to whom: players, the owner of an arena, or the person who hosts the server.
- The steps to reproduce, from a fresh server with an empty `DATA_DIR`.
- The routes, files or settings that are involved, for example `TRUST_PROXY` or `COOKIE_SECURE`.
- The version or the date of the code you tested.

Do not test against a server that other people use, and do not read or change other people's data.

## What happens next

The maintainer answers in the private report, works on a fix there, and publishes the fix and an advisory. The maintainer names you in the advisory when you agree.

## Supported versions

Only the newest code on the default branch gets security fixes.
