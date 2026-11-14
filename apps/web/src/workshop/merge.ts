// The merge of the play styles on this device with the ones in the account, when a
// player signs in or opens the app signed in. Pure: library.ts runs the plan.
//
// Two lists alone cannot tell "deleted on one side" from "new on the other", so the
// device remembers, per account, what the account last held (`known`: id -> updatedAt)
// and what this device deleted from it (`deleted`: id -> the updatedAt it had then).
//
// | Device | Account | Memory                         | Result                                          |
// |--------|---------|--------------------------------|-------------------------------------------------|
// | D      | A       |                                | the newer updatedAt wins on both sides          |
// | D      | none    | known, D not changed since     | deleted in the account: removed from the device |
// | D      | none    | not known, or D changed since  | new or changed here: uploaded                   |
// | none   | A       | deleted, A not changed since   | deleted here: removed from the account          |
// | none   | A       | not deleted, or A changed since| new or changed there: downloaded                |
//
// A style deleted on one side while it changed on the other is kept, so no work is lost.
// A style with a problem (it fails parseStrategy) stays on the device and is not uploaded.
// The account keeps at most 20: new ids are uploaded newest first while there is room, the
// rest stay on the device, and `keptOnDevice` says how many, so the page can tell the player.
// Nothing is deleted from the account to make room, because another device would then
// read that as a delete and drop its copy.

import { ACCOUNT_STRATEGY_LIMITS, type AccountStrategy } from "@game/arena";

/** One play style as both sides keep it. */
export type MyPlayStyle = AccountStrategy;

export interface SyncMemory {
  readonly accountId: string;
  /** What the account held at the last successful exchange: id -> updatedAt. */
  readonly known: Readonly<Record<string, number>>;
  /** Styles deleted on this device that the account still had: id -> their updatedAt then. */
  readonly deleted: Readonly<Record<string, number>>;
}

export const emptyMemory = (accountId: string): SyncMemory => ({ accountId, known: {}, deleted: {} });

export interface MergePlan {
  /** The device's list after the merge. */
  readonly device: readonly MyPlayStyle[];
  readonly upload: readonly MyPlayStyle[];
  readonly removeFromAccount: readonly string[];
  /** The memory for what needs no request (downloads, equal copies, resolved deletes); requests add to it as they succeed. */
  readonly memory: SyncMemory;
  /** Styles that stay on the device only because the account is full. */
  readonly keptOnDevice: number;
}

export function mergePlan(device: readonly MyPlayStyle[], account: readonly MyPlayStyle[], memory: SyncMemory, isValid: (style: MyPlayStyle) => boolean): MergePlan {
  const onDevice = new Map(device.map((style) => [style.id, style]));
  const inAccount = new Map(account.map((style) => [style.id, style]));
  const known: Record<string, number> = {};
  const deleted: Record<string, number> = {};
  const result: MyPlayStyle[] = [];
  const replaceUploads: MyPlayStyle[] = [];
  const newUploads: MyPlayStyle[] = [];
  const removeFromAccount: string[] = [];

  for (const id of new Set([...onDevice.keys(), ...inAccount.keys(), ...Object.keys(memory.deleted)])) {
    const d = onDevice.get(id);
    const a = inAccount.get(id);
    const knownAt = memory.known[id];
    const deletedAt = memory.deleted[id];
    if (d !== undefined && a !== undefined) {
      const winner = d.updatedAt > a.updatedAt ? d : a;
      result.push(winner);
      if (winner === d && d.updatedAt !== a.updatedAt && isValid(d)) replaceUploads.push(d);
      // The account still has its own copy until an upload succeeds.
      known[id] = a.updatedAt;
    } else if (d !== undefined) {
      const deletedThere = knownAt !== undefined && d.updatedAt <= knownAt;
      if (deletedThere) continue;
      result.push(d);
      if (isValid(d)) newUploads.push(d);
    } else if (a !== undefined) {
      const deletedHere = deletedAt !== undefined && a.updatedAt <= deletedAt;
      if (deletedHere) {
        removeFromAccount.push(id);
        // Until the delete succeeds, the device still owes it.
        deleted[id] = deletedAt;
        known[id] = a.updatedAt;
      } else {
        result.push(a);
        known[id] = a.updatedAt;
      }
    }
  }

  // Newest first, so the newest work is the work that reaches the account.
  newUploads.sort((x, y) => y.updatedAt - x.updatedAt);
  const room = Math.max(0, ACCOUNT_STRATEGY_LIMITS.perAccount - (inAccount.size - removeFromAccount.length));
  const accepted = newUploads.slice(0, room);
  return {
    device: result.sort((x, y) => y.updatedAt - x.updatedAt),
    upload: [...replaceUploads, ...accepted],
    removeFromAccount,
    memory: { accountId: memory.accountId, known, deleted },
    keptOnDevice: newUploads.length - accepted.length,
  };
}
