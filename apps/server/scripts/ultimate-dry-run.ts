// Counts the assignments before rolling out the migration in 85-ultimates.md.
import { Database } from "bun:sqlite";
import { countStrategyUltimates } from "../src/db/strategy-ultimates.ts";

const [path, ...extra] = process.argv.slice(2);
if (path === undefined || extra.length > 0) {
  console.error("Usage: bun apps/server/scripts/ultimate-dry-run.ts <path-to-sqlite-copy>");
  process.exit(2);
}

using db = new Database(path, { readonly: true, strict: true });
console.log("Table\tExact\tBest overlap\tRandom");
for (const { table, exact, overlap, random } of countStrategyUltimates(db)) {
  console.log(`${table}\t${exact}\t${overlap}\t${random}`);
}
