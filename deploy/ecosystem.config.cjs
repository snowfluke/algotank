// pm2 alternative to deploy/algotank.service. Use one of the two, never both: the
// arenas live in the memory of one process. See docs/deployment/08-pm2.md.

const { readFileSync } = require("node:fs");

/** systemd's EnvironmentFile, read here too, so the settings stay in one file. */
const ENV_FILE = "/etc/algotank/env";
const LINE = /^([A-Z_][A-Z0-9_]*)=(.*)$/;

/** Reads NAME=value lines. Blank lines and lines that start with # are skipped. */
function readEnvFile(path) {
  const env = {};
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((raw, index) => {
      const line = raw.trim();
      if (line === "" || line.startsWith("#")) return;
      const match = LINE.exec(line);
      if (match === null) throw new Error(`${path} line ${index + 1} is not NAME=value: ${line}`);
      env[match[1]] = match[2];
    });
  return env;
}

module.exports = {
  apps: [
    {
      name: "algotank",
      // pm2 starts the process in this folder; the symlink points at the current release.
      cwd: "/opt/algotank/current",
      script: "apps/server/src/index.ts",
      interpreter: "/usr/local/bin/bun",
      // Exactly one process: the arenas, the turn timers and the streams live in its memory.
      // pm2 picks cluster mode for bun when instances is set, unless exec_mode says fork.
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      restart_delay: 2000,
      // pm2 sends SIGINT and then SIGKILL after this time. The server needs it to write its last changes to the database.
      kill_timeout: 30000,
      env: {
        ...readEnvFile(ENV_FILE),
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        DO_NOT_TRACK: "1",
      },
    },
  ],
};
