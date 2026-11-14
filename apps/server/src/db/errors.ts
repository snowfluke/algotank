// The error of stored data: a database that cannot be opened, a migration that fails, or a row
// that fails its check. The start stops on it (index.ts), because serving without the data would
// hide an event or lose accounts. The message names the table and the key, or the file.

export class PersistenceError extends Error {}
