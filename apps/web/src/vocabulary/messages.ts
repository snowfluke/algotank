// Interface text for the `vocabulary` slot of the catalog (src/i18n/catalog.ts):
// every condition, target, action, attribute, play style and round rule of the
// engine, in plain words. The interface never shows an engine label.
//
// Conditions and actions are sentence parts. `text` holds `{key}` where a
// parameter goes, so the plain sentence and the sentence with controls come from
// the same text (see sentence.ts). `units` names the word that follows a number
// parameter in this language; a number without a unit stands alone. Each
// language orders its own words, so `id` is written on its own terms.

import type { ActionId, AttributeId, ConditionId, PresetId, RuleSetId, TargetId } from "@game/engine";
import type { ActionGroupId, ChoiceKey, ChoiceValue, ConditionGroupId, PlayStyleModeId } from "./ids.ts";
import type { StepKind } from "./steps.ts";

export type UnitId = "squares" | "points" | "turns" | "percent" | "sides";

export interface UnitText {
  /** The word after the number, for this number. */
  word(n: number): string;
  /** The space between the number and the word: "" for a sign such as %. */
  readonly gap: string;
}

export interface PhraseText {
  /** A plain name for the list a player picks from. */
  readonly name: string;
  /** The sentence part, lower case, with `{key}` for each parameter. */
  readonly text: string;
  readonly units?: Readonly<Record<string, UnitId>>;
}

export interface ConditionText extends PhraseText {
  /**
   * The same condition with "opposite" (the negate switch) on, with the same `{key}` marks as `text`.
   * The engine counts a negated condition about a chosen tank as true when that tank is missing;
   * only `targetDistance` (and the Indonesian "tidak ada …" forms) say so, the others assume the tank exists.
   */
  readonly not: string;
  /**
   * True when `not` states the opposite comparison instead of "not": "my water is less than 3"
   * for "my water is at least 3" negated. The sentence then fills {compare} with the opposite
   * choice (sentence.ts). Only for a condition whose subject always exists, so the meaning is exact.
   */
  readonly notOpposite?: true;
}

export interface ActionText extends PhraseText {
  /** What the tank did, for a line about a turn that has passed: the same `{key}` marks as `text`. */
  readonly done: string;
}

export interface VocabularyText {
  readonly conditions: Readonly<Record<ConditionId, ConditionText>>;
  readonly conditionGroups: Readonly<Record<ConditionGroupId, string>>;
  readonly actions: Readonly<Record<ActionId, ActionText>>;
  readonly actionGroups: Readonly<Record<ActionGroupId, string>>;
  /** The steps of a sequence: `name` is the block's short label, `text` the sentence part ("turn left"). */
  readonly steps: Readonly<Record<StepKind, { readonly name: string; readonly text: string }>>;
  /** Noun phrases that fit after "move toward" and before "is aiming at me", seen from the tank itself: "… than me". */
  readonly targets: Readonly<Record<TargetId, string>>;
  /** The same phrases about the tank in the third person ("… than it"), for a sentence that starts with "Your tank". */
  readonly targetsThirdPerson: Readonly<Record<TargetId, string>>;
  readonly options: { readonly [K in ChoiceKey]: Readonly<Record<ChoiceValue<K>, string>> };
  readonly units: Readonly<Record<UnitId, UnitText>>;
  readonly attributes: Readonly<Record<AttributeId, { readonly name: string }>>;
  readonly playStyles: Readonly<Record<PresetId, { readonly name: string; readonly summary: string }>>;
  readonly modeNames: Readonly<Record<PlayStyleModeId, string>>;
  readonly roundRules: Readonly<Record<RuleSetId, { readonly name: string; readonly summary: string }>>;
  /** Stands in for an id or a value this version does not know, for example from an old saved draft. The problem list says how to fix it. */
  readonly unknown: string;
  readonly rule: {
    /** The first sentence of a rule. `conditions` are already in words. */
    sentence(conditions: readonly string[], match: "all" | "any", action: string): string;
    chance(percent: number): string;
    switchTo(modeName: string): string;
    fallback(action: string): string;
    /** Stands for the conditions after the first in a short form of a rule (the rules list): "3 more conditions". */
    moreConditions(n: number, match: "all" | "any"): string;
    /** The word before the condition blocks of a rule card. */
    readonly when: string;
    /** The word drawn between two condition blocks. */
    readonly joiners: Readonly<Record<"all" | "any", string>>;
    /** The lead-in of the "If no rule fits" card, before its action block. */
    readonly fallbackLead: string;
    /** Adds the next step of a sequence to the sentence part of the steps before it: "move one square forward, then turn left". */
    thenStep(before: string, step: string): string;
  };
}

const plural = (one: string, many: string) => (n: number) => (Math.abs(n) === 1 ? one : many);

export const en: VocabularyText = {
  conditions: {
    enemyAhead: {
      name: "A tank close in my line of fire",
      text: "the first tank in my line of fire is at most {n} away",
      not: "no tank in my line of fire is within {n}",
      units: { n: "squares" },
    },
    enemyInRange: {
      name: "A tank in my line of fire and in range",
      text: "a tank is in my line of fire and within my range",
      not: "no tank in my line of fire is within my range",
    },
    hitChance: {
      name: "My chance to hit right now",
      text: "my chance to hit with a shot right now is {compare} {percent}",
      not: "my chance to hit with a shot right now is {compare} {percent}",
      notOpposite: true,
      units: { percent: "percent" },
    },
    aimedAtMe: { name: "Tanks aiming at me", text: "{k} or more tanks are aiming at me", not: "fewer than {k} tanks are aiming at me" },
    enemiesWithin: {
      name: "Tanks close to me",
      text: "{n} or more tanks are within {r} of me",
      not: "fewer than {n} tanks are within {r} of me",
      units: { r: "squares" },
    },
    nearestEnemyAtMost: {
      name: "The nearest tank is close",
      text: "the nearest tank is at most {n} away",
      not: "the nearest tank is more than {n} away",
      units: { n: "squares" },
    },
    nearestEnemyAtLeast: {
      name: "The nearest tank is far",
      text: "the nearest tank is {n} away or farther",
      not: "the nearest tank is closer than {n}",
      units: { n: "squares" },
    },
    targetDistance: {
      name: "How far a chosen tank is",
      text: "{target} is {compare} {n} away",
      not: "{target} is missing or {compare} {n} away",
      notOpposite: true,
      units: { n: "squares" },
    },
    targetBearing: { name: "Where a chosen tank is", text: "{target} is {bearing} me", not: "{target} is not {bearing} me" },
    targetInRowOrColumn: {
      name: "A chosen tank in a straight line with me",
      text: "{target} is in a straight line with me",
      not: "{target} is not in a straight line with me",
    },
    targetAimed: { name: "A chosen tank aims at me", text: "{target} is aiming at me", not: "{target} is not aiming at me" },
    targetFacingAway: { name: "A chosen tank faces away", text: "{target} is facing away from me", not: "{target} is not facing away from me" },
    targetPoints: {
      name: "Points of a chosen tank",
      text: "the lead of {target} over me is {compare} {n}",
      not: "the lead of {target} over me is not {compare} {n}",
      units: { n: "points" },
    },
    targetJustHit: { name: "A chosen tank was just hit", text: "{target} was hit on the last turn", not: "{target} was not hit on the last turn" },
    targetBuild: {
      name: "Upgrades of a chosen tank",
      text: "{target} has {attribute} at level {level} or higher",
      not: "{target} has {attribute} below level {level}",
    },
    targetWater: { name: "Water of a chosen tank", text: "{target} has {compare} {n} water", not: "{target} does not have {compare} {n} water" },
    myWater: { name: "My water", text: "my water is {compare} {n}", not: "my water is {compare} {n}", notOpposite: true },
    hitWithin: { name: "I was hit a moment ago", text: "I was hit in the last {n}", not: "I was not hit in the last {n}", units: { n: "turns" } },
    landedWithin: {
      name: "My shot hit a moment ago",
      text: "my shot hit a tank in the last {n}",
      not: "my shots hit no tank in the last {n}",
      units: { n: "turns" },
    },
    modeTime: {
      name: "Time in this mode",
      text: "I have been in this mode for {compare} {n}",
      not: "I have been in this mode for {compare} {n}",
      notOpposite: true,
      units: { n: "turns" },
    },
    cutMargin: {
      name: "My lead over the cut line",
      text: "my lead over the cut line is {compare} {n}",
      not: "my lead over the cut line is {compare} {n}",
      notOpposite: true,
      units: { n: "points" },
    },
    scoreAtMost: { name: "My points are low", text: "I have {n} or fewer", not: "I have more than {n}", units: { n: "points" } },
    scoreAtLeast: { name: "My points are high", text: "I have {n} or more", not: "I have fewer than {n}", units: { n: "points" } },
    wallAhead: {
      name: "A wall in front of me",
      text: "a wall is at most {n} in front of me",
      not: "no wall is within {n} in front of me",
      units: { n: "squares" },
    },
    wallSides: { name: "Walls touching me", text: "walls touch me on {compare} {k}", not: "walls touch me on {compare} {k}", notOpposite: true, units: { k: "sides" } },
    borderDistance: {
      name: "Distance to the edge",
      text: "the nearest edge of the arena is {compare} {n} away",
      not: "the nearest edge of the arena is {compare} {n} away",
      notOpposite: true,
      units: { n: "squares" },
    },
    timeLeft: {
      name: "Time left in the round",
      text: "the time left in the round is {compare} {n}",
      not: "the time left in the round is {compare} {n}",
      notOpposite: true,
      units: { n: "percent" },
    },
    roundType: { name: "Kind of round", text: "this round is {round}", not: "this round is not {round}" },
    myArea: { name: "My area", text: "I stand in a {set} area", not: "I stand outside a {set} area" },
    targetArea: { name: "Target’s area", text: "the target ({target}) stands in a {set} area", not: "the target ({target}) does not stand in a {set} area" },
    ruleSet: { name: "Rules of this round", text: "this round uses the {set} rules", not: "this round does not use the {set} rules" },
    fieldTrait: {
      name: "Upgrades of the other tanks",
      text: "at least {percent} of the other tanks have {attribute} at level {level} or higher",
      not: "fewer than {percent} of the other tanks have {attribute} at level {level} or higher",
      units: { percent: "percent" },
    },
    itemNear: { name: "An item close to me", text: "{item} is at most {n} away", not: "{item} is not within {n} of me", units: { n: "squares" } },
    myItem: { name: "The item I hold", text: "I hold {item}", not: "I do not hold {item}" },
    ultimateReady: { name: "My ultimate is ready", text: "my ultimate is ready", not: "my ultimate is not ready" },
    ultimateCharged: { name: "My ultimate's charge", text: "my ultimate is at least {n} charged", not: "my ultimate is less than {n} charged", units: { n: "percent" } },
    ultimateCatches: { name: "How many tanks my ultimate can catch", text: "my ultimate would catch at least {n} tanks", not: "my ultimate would catch fewer than {n} tanks" },
    myEffect: { name: "An item's effect on me", text: "I am {effect}", not: "I am not {effect}" },
    targetItem: { name: "A chosen tank holds an item", text: "{target} holds {item}", not: "{target} does not hold {item}" },
  },
  conditionGroups: {
    otherTanks: "Other tanks",
    oneTank: "One chosen tank",
    me: "About me",
    walls: "Walls and space",
    round: "The round",
    items: "Items",
    ultimate: "Ultimate",
  },
  actions: {
    throw: { name: "Shoot", text: "shoot", done: "shot" },
    attack: { name: "Go after a tank and shoot it", text: "go after {target} and shoot it", done: "went after {target} and shot it" },
    faceTarget: { name: "Turn toward a tank", text: "turn to face {target}", done: "turned to face {target}" },
    moveToward: { name: "Move toward a tank", text: "move toward {target}", done: "moved toward {target}" },
    moveAway: { name: "Move away from a tank", text: "move away from {target}", done: "moved away from {target}" },
    stepOutOfLine: { name: "Step out of the line of fire", text: "step out of the line of fire", done: "stepped out of the line of fire" },
    awayFromCrowd: { name: "Move away from the crowd", text: "move away from the crowd", done: "moved away from the crowd" },
    goToPlace: { name: "Go to a place", text: "go to {place}", done: "went to {place}" },
    goToArea: { name: "Go to an area", text: "go to the nearest {set} area", done: "went to the nearest {set} area" },
    goForward: { name: "Drive forward", text: "drive forward, shoot any tank in the way, and turn at a wall", done: "drove forward, shot any tank in the way, and turned at a wall" },
    stepForward: { name: "Move one square forward", text: "move one square forward, or wait when that square is taken", done: "moved one square forward, or waited when that square was taken" },
    turn: { name: "Turn", text: "turn {way}", done: "turned {way}" },
    wander: { name: "Wander", text: "wander around at random", done: "wandered around at random" },
    wait: { name: "Wait", text: "wait", done: "waited" },
    useUltimate: { name: "Use my ultimate", text: "use my ultimate", done: "used its ultimate" },
    goToItem: { name: "Go get an item", text: "drive to the nearest square with {item}", done: "drove to the nearest square with {item}" },
  },
  actionGroups: {
    attack: "Attack",
    chase: "Chase and flee",
    position: "Go to a place",
    basic: "Basic moves",
    items: "Items",
    ultimate: "Ultimate",
  },
  steps: {
    forward: { name: "Forward", text: "move one square forward" },
    left: { name: "Turn left", text: "turn left" },
    right: { name: "Turn right", text: "turn right" },
    slightLeft: { name: "Slightly left", text: "turn slightly left" },
    slightRight: { name: "Slightly right", text: "turn slightly right" },
    shoot: { name: "Shoot", text: "shoot" },
    wait: { name: "Wait", text: "wait" },
  },
  targets: {
    nearest: "the nearest tank",
    inThrowLine: "the first tank in my line of fire",
    aimedAtMe: "the nearest tank aiming at me",
    lastHitMe: "the tank that hit me last",
    highestScore: "the other tank with the most points",
    nearestWithMorePoints: "the nearest tank with more points than me",
    nearestWithFewerPoints: "the nearest tank with fewer points than me",
    cutRival: "my closest rival across the cut line",
    nearestWithLessWater: "the nearest tank with less water than me",
    easiestHit: "the tank in my range that I can hit most easily",
    mostIsolated: "the tank with the fewest tanks near it",
    topReach: "the tank with the most Range",
    topAim: "the tank with the most Aim",
    topDodge: "the tank with the most Dodge",
    farthest: "the farthest tank",
    nearestFacingAway: "the nearest tank facing away from me",
  },
  targetsThirdPerson: {
    nearest: "the nearest tank",
    inThrowLine: "the first tank in its line of fire",
    aimedAtMe: "the nearest tank aiming at it",
    lastHitMe: "the tank that hit it last",
    highestScore: "the other tank with the most points",
    nearestWithMorePoints: "the nearest tank with more points than it",
    nearestWithFewerPoints: "the nearest tank with fewer points than it",
    cutRival: "its closest rival across the cut line",
    nearestWithLessWater: "the nearest tank with less water than it",
    easiestHit: "the tank in its range that it can hit most easily",
    mostIsolated: "the tank with the fewest tanks near it",
    topReach: "the tank with the most Range",
    topAim: "the tank with the most Aim",
    topDodge: "the tank with the most Dodge",
    farthest: "the farthest tank",
    nearestFacingAway: "the nearest tank facing away from it",
  },
  options: {
    compare: { atLeast: "at least", atMost: "at most", fewerThan: "less than", moreThan: "more than" },
    bearing: { ahead: "ahead of", left: "to the left of", right: "to the right of", behind: "behind" },
    round: { cut: "a knockout round", final: "the final" },
    place: { middle: "the middle of the arena", corner: "the nearest corner" },
    way: { left: "left", right: "right", slightLeft: "slightly left", slightRight: "slightly right" },
    item: { any: "an item", bucket: "a bucket", umbrella: "an umbrella", pinwheel: "a pinwheel", mudBall: "a mud ball" },
    effect: { dizzy: "dizzy", stuck: "stuck in mud" },
  },
  units: {
    squares: { word: plural("square", "squares"), gap: " " },
    points: { word: plural("point", "points"), gap: " " },
    turns: { word: plural("turn", "turns"), gap: " " },
    percent: { word: () => "%", gap: "" },
    sides: { word: plural("side", "sides"), gap: " " },
  },
  attributes: {
    reach: { name: "Range" },
    aim: { name: "Aim" },
    dodge: { name: "Dodge" },
  },
  playStyles: {
    evader: { name: "Evader", summary: "Dodges, grabs items, then shoots a careless tank." },
    "leader-chaser": { name: "Leader chaser", summary: "Refills, then rushes a tank with more points." },
    "dry-hunter": { name: "Dry hunter", summary: "Refills, then hunts tanks that cannot shoot back." },
    ambusher: { name: "Ambusher", summary: "Refills, then rushes the nearest tank." },
    picker: { name: "Picker", summary: "Refills, then rushes a drier tank." },
    backstabber: { name: "Sneak", summary: "Refills, then sneaks up from behind." },
    charger: { name: "Charger", summary: "Drives at the nearest tank, shooting ahead." },
    "random-walker": { name: "Wanderer", summary: "Wanders about and shoots what is in front." },
    "item-hunter": { name: "Item hunter", summary: "Grabs buckets when it can, then rushes a tank." },
  },
  modeNames: {
    evade: "Evade",
    rest: "Rest",
    strike: "Strike",
    charge: "Charge",
    wander: "Wander",
  },
  roundRules: {
    standard: { name: "Standard", summary: "A shot reaches 3 squares. Each shot uses 3 water, and a tank carries 9." },
    "arms-length": {
      name: "Up close",
      summary: "A shot reaches only 1 square, so tanks must stand side by side to hit. A tank with Range shoots farther.",
    },
    "dry-spell": { name: "Dry spell", summary: "A shot reaches 2 squares. Water is scarce: a tank carries 6, and each shot uses 5." },
    downpour: { name: "Downpour", summary: "A shot reaches only 1 square. Water is plentiful: a tank carries 12, and each shot uses 2." },
    "open-field": { name: "Open field", summary: "The arena is about twice as big, so tanks start farther apart." },
    "sharp-eyes": {
      name: "Sharp eyes",
      summary: "Aim and Dodge are twice as strong, and they work even when two tanks stand side by side.",
    },
  },
  unknown: "something this game does not know",
  rule: {
    sentence: (conditions, match, action) => `When ${conditions.join(match === "all" ? " and " : " or ")}, ${action}.`,
    chance: (percent) => `Do this ${percent}% of the time.`,
    switchTo: (modeName) => `Then switch to the “${modeName}” mode.`,
    fallback: (action) => `If no rule fits, ${action}.`,
    moreConditions: (n, match) => (match === "all" ? (n === 1 ? "1 more condition" : `${n} more conditions`) : n === 1 ? "1 other condition" : `one of ${n} other conditions`),
    when: "When",
    joiners: { all: "and", any: "or" },
    fallbackLead: "If no rule fits",
    thenStep: (before, step) => `${before}, then ${step}`,
  },
};

export const id: VocabularyText = {
  conditions: {
    enemyAhead: {
      name: "Tank dekat di garis tembakku",
      text: "ada tank di garis tembakku dalam jarak {n}",
      not: "tidak ada tank di garis tembakku dalam jarak {n}",
      units: { n: "squares" },
    },
    enemyInRange: {
      name: "Tank di garis tembakku dan dalam jangkauan",
      text: "ada tank di garis tembakku dalam jangkauanku",
      not: "tidak ada tank di garis tembakku dalam jangkauanku",
    },
    hitChance: {
      name: "Peluang tembakanku kena",
      text: "peluang tembakanku kena saat ini {compare} {percent}",
      not: "peluang tembakanku kena saat ini {compare} {percent}",
      notOpposite: true,
      units: { percent: "percent" },
    },
    aimedAtMe: { name: "Tank yang membidikku", text: "ada {k} tank atau lebih yang membidikku", not: "kurang dari {k} tank yang membidikku" },
    enemiesWithin: {
      name: "Tank di dekatku",
      text: "ada {n} tank atau lebih dalam jarak {r} dariku",
      not: "kurang dari {n} tank dalam jarak {r} dariku",
      units: { r: "squares" },
    },
    nearestEnemyAtMost: {
      name: "Tank terdekat sudah dekat",
      text: "tank terdekat ada dalam jarak {n}",
      not: "tank terdekat berjarak lebih dari {n}",
      units: { n: "squares" },
    },
    nearestEnemyAtLeast: {
      name: "Tank terdekat masih jauh",
      text: "tank terdekat berjarak {n} atau lebih",
      not: "tank terdekat berjarak kurang dari {n}",
      units: { n: "squares" },
    },
    targetDistance: {
      name: "Jarak ke tank pilihan",
      text: "{target} berjarak {compare} {n}",
      not: "{target} tidak ada atau berjarak {compare} {n}",
      notOpposite: true,
      units: { n: "squares" },
    },
    targetBearing: { name: "Arah tank pilihan", text: "{target} ada {bearing}", not: "{target} tidak ada {bearing}" },
    targetInRowOrColumn: {
      name: "Tank pilihan segaris denganku",
      text: "{target} ada segaris denganku",
      not: "{target} tidak segaris denganku",
    },
    targetAimed: { name: "Tank pilihan membidikku", text: "{target} sedang membidikku", not: "{target} tidak sedang membidikku" },
    targetFacingAway: { name: "Tank pilihan memunggungiku", text: "{target} sedang memunggungiku", not: "{target} tidak sedang memunggungiku" },
    targetPoints: {
      name: "Selisih poin tank pilihan denganku",
      text: "poin {target} dikurangi poinku hasilnya {compare} {n}",
      not: "poin {target} dikurangi poinku hasilnya tidak {compare} {n}",
      units: { n: "points" },
    },
    targetJustHit: {
      name: "Tank pilihan baru kena tembak",
      text: "{target} kena tembak di giliran sebelumnya",
      not: "{target} tidak kena tembak di giliran sebelumnya",
    },
    targetBuild: {
      name: "Peningkatan tank pilihan",
      text: "{target} punya {attribute} level {level} atau lebih",
      not: "{attribute} {target} di bawah level {level}",
    },
    targetWater: { name: "Air tank pilihan", text: "air {target} {compare} {n}", not: "air {target} tidak {compare} {n}" },
    myWater: { name: "Airku", text: "airku {compare} {n}", not: "airku {compare} {n}", notOpposite: true },
    hitWithin: {
      name: "Aku baru kena tembak",
      text: "aku kena tembak dalam {n} terakhir",
      not: "aku tidak kena tembak dalam {n} terakhir",
      units: { n: "turns" },
    },
    landedWithin: {
      name: "Tembakanku baru kena",
      text: "tembakanku mengenai tank lain dalam {n} terakhir",
      not: "tembakanku tidak mengenai tank mana pun dalam {n} terakhir",
      units: { n: "turns" },
    },
    modeTime: {
      name: "Lama di mode ini",
      text: "waktuku di mode ini {compare} {n}",
      not: "waktuku di mode ini {compare} {n}",
      notOpposite: true,
      units: { n: "turns" },
    },
    cutMargin: {
      name: "Selisih poinku dengan batas lolos",
      text: "poinku dikurangi poin sainganku di seberang batas lolos hasilnya {compare} {n}",
      not: "poinku dikurangi poin sainganku di seberang batas lolos hasilnya {compare} {n}",
      notOpposite: true,
      units: { n: "points" },
    },
    scoreAtMost: { name: "Poinku sedikit", text: "poinku {n} atau kurang", not: "poinku lebih dari {n}" },
    scoreAtLeast: { name: "Poinku banyak", text: "poinku {n} atau lebih", not: "poinku kurang dari {n}" },
    wallAhead: {
      name: "Dinding di depanku",
      text: "ada dinding di depanku dalam jarak {n}",
      not: "tidak ada dinding di depanku dalam jarak {n}",
      units: { n: "squares" },
    },
    wallSides: {
      name: "Dinding yang menempel padaku",
      text: "dinding menempel di {compare} {k}",
      not: "dinding menempel di {compare} {k}",
      notOpposite: true,
      units: { k: "sides" },
    },
    borderDistance: {
      name: "Jarak ke tepi arena",
      text: "tepi arena terdekat berjarak {compare} {n}",
      not: "tepi arena terdekat berjarak {compare} {n}",
      notOpposite: true,
      units: { n: "squares" },
    },
    timeLeft: { name: "Sisa waktu ronde", text: "sisa waktu ronde {compare} {n}", not: "sisa waktu ronde {compare} {n}", notOpposite: true, units: { n: "percent" } },
    roundType: { name: "Jenis ronde", text: "ini {round}", not: "ini bukan {round}" },
    myArea: { name: "Areaku", text: "aku berada di area {set}", not: "aku berada di luar area {set}" },
    targetArea: { name: "Area target", text: "target ({target}) berada di area {set}", not: "target ({target}) tidak berada di area {set}" },
    ruleSet: { name: "Aturan ronde ini", text: "ronde ini memakai aturan {set}", not: "ronde ini tidak memakai aturan {set}" },
    fieldTrait: {
      name: "Peningkatan tank lain",
      text: "minimal {percent} tank lain punya {attribute} level {level} atau lebih",
      not: "kurang dari {percent} tank lain punya {attribute} level {level} atau lebih",
      units: { percent: "percent" },
    },
    itemNear: { name: "Item di dekatku", text: "ada {item} dalam jarak {n}", not: "tidak ada {item} dalam jarak {n}", units: { n: "squares" } },
    myItem: { name: "Item yang kupegang", text: "aku memegang {item}", not: "aku tidak memegang {item}" },
    ultimateReady: { name: "Jurusku siap", text: "jurusku siap", not: "jurusku belum siap" },
    ultimateCharged: { name: "Isi jurusku", text: "jurusku terisi minimal {n}", not: "jurusku terisi kurang dari {n}", units: { n: "percent" } },
    ultimateCatches: { name: "Jumlah tank yang bisa kena jurusku", text: "jurusku bisa kena minimal {n} tank", not: "jurusku bisa kena kurang dari {n} tank" },
    myEffect: { name: "Efek item padaku", text: "aku sedang {effect}", not: "aku tidak sedang {effect}" },
    targetItem: { name: "Tank pilihan memegang item", text: "{target} memegang {item}", not: "{target} tidak memegang {item}" },
  },
  conditionGroups: {
    otherTanks: "Tank lain",
    oneTank: "Satu tank pilihan",
    me: "Tentang aku",
    walls: "Dinding dan ruang",
    round: "Ronde ini",
    items: "Item",
    ultimate: "Jurus pamungkas",
  },
  actions: {
    throw: { name: "Tembak", text: "tembak", done: "menembak" },
    attack: { name: "Kejar tank lalu tembak", text: "kejar {target} lalu tembak", done: "mengejar {target} lalu menembaknya" },
    faceTarget: { name: "Menghadap ke tank", text: "putar menghadap {target}", done: "berputar menghadap {target}" },
    moveToward: { name: "Dekati tank", text: "dekati {target}", done: "mendekati {target}" },
    moveAway: { name: "Jauhi tank", text: "jauhi {target}", done: "menjauhi {target}" },
    stepOutOfLine: { name: "Menyingkir dari garis tembak", text: "menyingkir dari garis tembak", done: "menyingkir dari garis tembak" },
    awayFromCrowd: { name: "Menjauh dari kerumunan", text: "menjauh dari kerumunan", done: "menjauh dari kerumunan" },
    goToPlace: { name: "Pergi ke suatu tempat", text: "pergi ke {place}", done: "pergi ke {place}" },
    goToArea: { name: "Pergi ke suatu area", text: "pergi ke area {set} terdekat", done: "pergi ke area {set} terdekat" },
    goForward: { name: "Maju terus", text: "maju terus, tembak tank yang menghalangi, dan belok di dinding", done: "maju terus, menembak tank yang menghalangi, dan berbelok di dinding" },
    stepForward: { name: "Maju satu petak", text: "maju satu petak, atau diam kalau petak itu terisi", done: "maju satu petak, atau diam kalau petak itu terisi" },
    turn: { name: "Belok", text: "belok {way}", done: "berbelok {way}" },
    wander: { name: "Jalan acak", text: "jalan-jalan ke arah acak", done: "jalan-jalan ke arah acak" },
    wait: { name: "Tunggu", text: "tunggu", done: "menunggu" },
    useUltimate: { name: "Pakai jurus pamungkas", text: "pakai jurus pamungkas", done: "memakai jurus pamungkas" },
    goToItem: { name: "Ambil item", text: "pergi ke {item} terdekat", done: "pergi ke {item} terdekat" },
  },
  actionGroups: {
    attack: "Serang",
    chase: "Kejar dan kabur",
    position: "Pergi ke suatu tempat",
    basic: "Gerakan dasar",
    items: "Item",
    ultimate: "Jurus pamungkas",
  },
  steps: {
    forward: { name: "Maju", text: "maju satu petak" },
    left: { name: "Belok kiri", text: "belok kiri" },
    right: { name: "Belok kanan", text: "belok kanan" },
    slightLeft: { name: "Serong kiri", text: "belok sedikit ke kiri" },
    slightRight: { name: "Serong kanan", text: "belok sedikit ke kanan" },
    shoot: { name: "Tembak", text: "tembak" },
    wait: { name: "Tunggu", text: "tunggu" },
  },
  targets: {
    nearest: "tank terdekat",
    inThrowLine: "tank pertama di garis tembakku",
    aimedAtMe: "tank terdekat yang membidikku",
    lastHitMe: "tank yang terakhir menembakku",
    highestScore: "tank lain dengan poin terbanyak",
    nearestWithMorePoints: "tank terdekat yang poinnya lebih banyak dariku",
    nearestWithFewerPoints: "tank terdekat yang poinnya lebih sedikit dariku",
    cutRival: "sainganku terdekat di seberang batas lolos",
    nearestWithLessWater: "tank terdekat yang airnya lebih sedikit dariku",
    easiestHit: "tank dalam jangkauanku yang paling mudah kukenai",
    mostIsolated: "tank yang paling sedikit punya tank lain di dekatnya",
    topReach: "tank dengan Jangkauan tertinggi",
    topAim: "tank dengan Bidikan tertinggi",
    topDodge: "tank dengan Hindaran tertinggi",
    farthest: "tank terjauh",
    nearestFacingAway: "tank terdekat yang memunggungiku",
  },
  targetsThirdPerson: {
    nearest: "tank terdekat",
    inThrowLine: "tank pertama di garis tembaknya",
    aimedAtMe: "tank terdekat yang membidiknya",
    lastHitMe: "tank yang terakhir menembaknya",
    highestScore: "tank lain dengan poin terbanyak",
    nearestWithMorePoints: "tank terdekat yang poinnya lebih banyak darinya",
    nearestWithFewerPoints: "tank terdekat yang poinnya lebih sedikit darinya",
    cutRival: "saingan terdekatnya di seberang batas lolos",
    nearestWithLessWater: "tank terdekat yang airnya lebih sedikit darinya",
    easiestHit: "tank dalam jangkauannya yang paling mudah dikenainya",
    mostIsolated: "tank yang paling sedikit punya tank lain di dekatnya",
    topReach: "tank dengan Jangkauan tertinggi",
    topAim: "tank dengan Bidikan tertinggi",
    topDodge: "tank dengan Hindaran tertinggi",
    farthest: "tank terjauh",
    nearestFacingAway: "tank terdekat yang memunggunginya",
  },
  options: {
    compare: { atLeast: "minimal", atMost: "maksimal", fewerThan: "kurang dari", moreThan: "lebih dari" },
    bearing: { ahead: "di depanku", left: "di kiriku", right: "di kananku", behind: "di belakangku" },
    round: { cut: "ronde penyisihan", final: "final" },
    place: { middle: "tengah arena", corner: "sudut terdekat" },
    way: { left: "kiri", right: "kanan", slightLeft: "sedikit ke kiri", slightRight: "sedikit ke kanan" },
    item: { any: "item", bucket: "ember", umbrella: "payung", pinwheel: "kincir", mudBall: "bola lumpur" },
    effect: { dizzy: "pusing", stuck: "terjebak lumpur" },
  },
  units: {
    squares: { word: () => "petak", gap: " " },
    points: { word: () => "poin", gap: " " },
    turns: { word: () => "giliran", gap: " " },
    percent: { word: () => "%", gap: "" },
    sides: { word: () => "sisiku", gap: " " },
  },
  attributes: {
    reach: { name: "Jangkauan" },
    aim: { name: "Bidikan" },
    dodge: { name: "Hindaran" },
  },
  playStyles: {
    evader: { name: "Pengelak", summary: "Mengelak, memungut item, lalu menembak tank lengah." },
    "leader-chaser": { name: "Pemburu pemimpin", summary: "Mengisi air, lalu menyerbu tank yang poinnya lebih banyak." },
    "dry-hunter": { name: "Pemburu tank kering", summary: "Mengisi air, lalu memburu tank yang tidak bisa membalas." },
    ambusher: { name: "Penyergap", summary: "Mengisi air, lalu menyerbu tank terdekat." },
    picker: { name: "Pemilih mangsa", summary: "Mengisi air, lalu menyerbu tank kering." },
    backstabber: { name: "Penyelinap", summary: "Mengisi air, lalu menyergap dari belakang." },
    charger: { name: "Penyeruduk", summary: "Menyeruduk tank terdekat sambil menembak." },
    "random-walker": { name: "Pengembara", summary: "Jalan acak dan menembak tank di depannya." },
    "item-hunter": { name: "Pemburu Item", summary: "Memungut ember bila bisa, lalu menyerbu tank terdekat." },
  },
  modeNames: {
    evade: "Menghindar",
    rest: "Istirahat",
    strike: "Menyerang",
    charge: "Menyeruduk",
    wander: "Berkeliling",
  },
  roundRules: {
    standard: { name: "Standar", summary: "Tembakan sampai 3 petak. Tiap tembakan memakai 3 air, dan tank bisa membawa 9 air." },
    "arms-length": {
      name: "Jarak dekat",
      summary: "Tembakan hanya sampai 1 petak, jadi tank harus bersebelahan untuk mengenai lawan. Tank dengan Jangkauan bisa menembak lebih jauh.",
    },
    "dry-spell": { name: "Musim kering", summary: "Tembakan sampai 2 petak. Airnya sedikit: tank bisa membawa 6 air, dan tiap tembakan memakai 5." },
    downpour: { name: "Hujan deras", summary: "Tembakan hanya sampai 1 petak. Airnya banyak: tank bisa membawa 12 air, dan tiap tembakan memakai 2." },
    "open-field": { name: "Lapangan luas", summary: "Arenanya sekitar dua kali lebih luas, jadi tank mulai lebih berjauhan." },
    "sharp-eyes": {
      name: "Mata tajam",
      summary: "Bidikan dan Hindaran dua kali lebih kuat, dan tetap berlaku saat dua tank bersebelahan.",
    },
  },
  unknown: "sesuatu yang tidak dikenal permainan ini",
  rule: {
    sentence: (conditions, match, action) => `Kalau ${conditions.join(match === "all" ? " dan " : " atau ")}, ${action}.`,
    chance: (percent) => `Lakukan ini kira-kira ${percent} dari 100 kali.`,
    switchTo: (modeName) => `Lalu pindah ke mode “${modeName}”.`,
    fallback: (action) => `Kalau tidak ada aturan yang cocok, ${action}.`,
    moreConditions: (n, match) => (match === "all" ? `${n} syarat lain` : `salah satu dari ${n} syarat lain`),
    when: "Kalau",
    joiners: { all: "dan", any: "atau" },
    fallbackLead: "Kalau tidak ada aturan yang cocok",
    thenStep: (before, step) => `${before}, lalu ${step}`,
  },
};
