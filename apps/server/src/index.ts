// Entry point: bun apps/server/src/index.ts
// Reads the settings in config.ts once and starts the server.

import { PersistenceError } from "./arena-files.ts";
import { ConfigError, loadConfig } from "./config.ts";
import { smtpSender } from "./mail.ts";
import { startServer } from "./server.ts";

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(error.message);
  process.exit(1);
}

let running;
try {
  running = startServer({
    port: config.port,
    ...(config.host === undefined ? {} : { hostname: config.host }),
    dataDir: config.dataDir,
    secureCookies: config.secureCookies,
    trustProxy: config.trustProxy,
    arenaTtlHours: config.arenaTtlHours,
    publicArenaMax: config.publicArenaMax,
    leagueTimeZone: config.leagueTimeZone,
    ...(config.leagueShortDays === null ? {} : { leagueShortDays: config.leagueShortDays }),
    publicTimeDivisor: config.publicTimeDivisor,
    ...(config.staticDir === undefined ? {} : { staticDir: config.staticDir }),
    ...(config.mail === null ? {} : { mail: smtpSender(config.mail) }),
    adminEmails: config.adminEmails,
    ...(config.metricsToken === null ? {} : { metricsToken: config.metricsToken }),
  });
} catch (error) {
  // A damaged arena file or database stops the start on purpose: serving without it would hide an event or lose accounts.
  if (!(error instanceof PersistenceError)) throw error;
  console.error(error.message);
  process.exit(1);
}
console.log(`Server listening on ${running.url}, data saved in ${config.dataDir}`);
console.log(config.mail === null ? "No SMTP_HOST: the server sends no email, so accounts stay unverified." : `Email codes go out through ${config.mail.host}:${config.mail.port}.`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void running.stop().then(() => process.exit(0));
  });
}
