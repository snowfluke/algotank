// The errors of a damaged row, so every store names the table and the key the same way.

import { PersistenceError } from "./errors.ts";

export function invalidRow(table: string, key: string, reason: string): PersistenceError {
  return new PersistenceError(`The row ${key} of the table ${table} is not valid: ${reason}`);
}

/** Parses a JSON text column. The caller checks the shape; this only names a text that is not JSON. */
export function jsonColumn(table: string, key: string, column: string, text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw invalidRow(table, key, `${column} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
