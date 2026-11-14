# Tools for balance and load

## Balance

```sh
bun run simulate                                          # 1000 finals of 8: how often each play style wins, which beats which, and the top play style per rule set
bun packages/engine/scripts/simulate.ts --rules=dry-spell # the first four tables under another rule set
bun packages/engine/scripts/probes.ts                     # bots that do not play, the build, and one document with a branch per rule set
```

To add a rule set, add one row to `RULE_SETS` in `packages/engine/src/combat/rule-sets.ts`, then run `bun run simulate` and the probes. The rows are tuned together.

## Large rounds

`bun packages/engine/scripts/large-round.ts bench 512 90` times one turn of a round with 512 tanks.

`bun packages/engine/scripts/large-round.ts record` rewrites the 20 recorded 64-player rounds that `packages/engine/src/round/large-round.test.ts` compares against. Run it only for a deliberate change of game behaviour.

## Load test

`apps/server/scripts/load-test.ts` plays one cut round of a presenter arena against a running server. It registers an owner, creates the arena, joins N players over HTTP from one address and opens each player's event stream, starts the round, and during the break sends one strategy save per player, spread over 10 seconds. Then it closes the arena. It prints the time to join, the turn interval the clients saw (mean and worst), bytes per second per client, the server's CPU and memory during the round (from `ps`), whether every stream got every turn, and the answers to the saves.

1. Make an empty data folder, for example `mkdir -p /tmp/load-data`.
2. Start a server on a free port, and write down its process ID:

   ```sh
   PORT=8971 TRUST_PROXY=1 DATA_DIR=/tmp/load-data bun apps/server/src/index.ts &
   ```

3. Run the test against that server:

   ```sh
   bun apps/server/scripts/load-test.ts \
     --url=http://localhost:8971 --players=512 --pid=<server PID> [--ticks=40] [--tick-ms=600] [--edit-seconds=10]
   ```

4. Stop the server with `kill <server PID>`.

`TRUST_PROXY=1` is necessary because the script sends its own `X-Forwarded-For`, and registration allows 5 accounts per hour per address. Each stream is read on its own TCP connection with a strict HTTP reader, which names a framing error when it finds one. A run with 512 players and the defaults takes about one minute. The script and the server share the machine, so run nothing heavy beside it. Half the strategy saves answer 409, because after a cut round an eliminated player may not edit until the final.
