// The vocabulary a player builds a strategy from. The editor renders its
// controls from these three tables and parseStrategy validates against them.
//
// To add or change an entry, edit the file that holds its table:
//   conditions.ts  CONDITIONS
//   targets.ts     TARGET_SELECTORS
//   actions.ts     ACTIONS
// Nothing else needs to change. A table test fails when an entry's label and
// parameters disagree.
//
// Debt: the English `label` of each entry (and of its parameters and levels) is no
// longer read by the interface, which takes its words from apps/web/src/vocabulary in
// both languages since the developer mode and its reference were removed (2026-11-12).
// The labels stay because parseStrategy's error messages, the tests and the simulation
// scripts use them. Clearing it means giving those their own wording and dropping the
// field from the table types.

export { CONDITIONS, CONDITION_IDS, type ConditionId } from "./conditions.ts";
export { TARGET_SELECTORS, TARGET_IDS, type TargetId } from "./targets.ts";
export { ACTIONS, ACTION_IDS, type ActionId } from "./actions.ts";
