// Interface text for the `prep` slot of the catalog (src/i18n/catalog.ts): the
// screen where a player prepares a tank. The words for conditions, actions and
// play styles are in vocabulary/messages.ts.

import type { RoundRules, StrategyIssueCode, StrategyIssueParams } from "@game/engine";
import type { TraitId } from "./playStyles.ts";
import type { UpgradeEffectText } from "./upgrades.ts";

type IssueText = { readonly [C in StrategyIssueCode]: (params: StrategyIssueParams[C]) => string };

export interface PrepText {
  readonly tabsLabel: string;
  readonly tabs: { readonly style: string; readonly rules: string; readonly upgrades: string; readonly try: string };
  readonly loading: string;
  readonly loadFailed: string;
  readonly tryAgain: string;
  readonly save: {
    readonly invalid: string;
    readonly roundRunning: string;
    readonly offline: string;
    readonly retry: string;
  };
  readonly nextRules: {
    known(name: string): string;
    readonly hidden: string;
  };
  readonly style: {
    readonly legend: string;
    readonly ownRules: string;
    readonly traitsLabel: string;
    changed(name: string): string;
    readonly traits: Readonly<Record<TraitId, string>>;
    readonly sourceLegend: string;
    readonly builtIn: string;
    readonly mine: string;
    readonly use: string;
    readonly useShort: string;
    readonly chosen: string;
    fromMine(name: string): string;
    readonly mineLabel: string;
    readonly noneYet: string;
    readonly cannotLoad: string;
  };
  /** "Save as my play style" (SaveAsStep.tsx), reached from Rules and Upgrades in an arena. */
  readonly saveAs: {
    readonly open: string;
    readonly intro: string;
    readonly name: string;
    nameHint(max: number): string;
    readonly save: string;
    saved(name: string): string;
    readonly invalid: string;
    readonly nameProblem: string;
    readonly nameTaken: string;
    full(max: number): string;
  };
  readonly upgrades: {
    /** The live sentence beside the tray. */
    free(points: number): string;
    allPlaced(total: number): string;
    blocked(need: number, have: number): string;
    readonly trayLabel: string;
    readonly takeAllOut: string;
    readonly putBack: string;
    readonly secret: string;
    levelOf(level: number, max: number): string;
    fillSocket(name: string, level: number): string;
    emptySocket(name: string, level: number): string;
    readonly effects: UpgradeEffectText;
    readonly help: string;
    readonly helpTitle: string;
    readonly helpTokens: string;
    readonly helpCost: string;
    helpDistance(squares: number): string;
    readonly helpDistanceSecret: string;
  };
  readonly rules: {
    readonly intro: string;
    readonly modesIntro: string;
    readonly addMode: string;
    /** The word on the first mode's chip, beside its flag. */
    readonly startWord: string;
    readonly editModes: string;
    startsIn(modeName: string): string;
    /** The chip of a rule that switches mode. */
    toMode(modeName: string): string;
    /** The strip's chip for the modes that do not fit beside the chosen one; it opens the modes step. */
    moreModes(n: number): string;
    newModeName(n: number): string;
    modesFull(max: number): string;
    modeOptions(name: string): string;
    readonly modeName: string;
    readonly startsHere: string;
    readonly makeStart: string;
    readonly deleteMode: string;
    modeDeleted(name: string): string;
    readonly empty: string;
    readonly addRule: string;
    rulesFull(max: number): string;
    water(rules: RoundRules | null): string;
    ruleNumber(n: number): string;
    readonly when: string;
    readonly do: string;
    readonly matchLegend: string;
    readonly matchAll: string;
    readonly matchAny: string;
    condition(n: number): string;
    readonly action: string;
    readonly addCondition: string;
    conditionsFull(max: number): string;
    removeCondition(n: number): string;
    /** The rule's "Do" part: one action, or steps in order (S3). */
    readonly doKindLegend: string;
    readonly oneAction: string;
    readonly stepsInOrder: string;
    /** The name of one step, as the label of its choices. */
    step(n: number): string;
    /** The accessible name of a step block in the editor. */
    stepBlock(n: number, name: string): string;
    stepEarlier(n: number): string;
    stepLater(n: number): string;
    removeStep(n: number): string;
    readonly addStep: string;
    stepTitle(step: number, rule: number): string;
    stepsFull(max: number): string;
    readonly chance: string;
    readonly chanceHelp: string;
    readonly switchTo: string;
    readonly stay: string;
    readonly switchHelp: string;
    negate(n: number): string;
    readonly negateHelp: string;
    moveUp(n: number): string;
    moveDown(n: number): string;
    duplicate(n: number): string;
    remove(n: number): string;
    ruleDeleted(n: number): string;
    readonly done: string;
    readonly paramNames: Readonly<Record<"number" | "distance" | "target" | "comparison" | "direction" | "choice" | "upgrade" | "level" | "percent", string>>;
    /** The title of a sentence picker's open list: a plain question about the part being picked. */
    readonly paramQuestions: Readonly<Record<"number" | "distance" | "target" | "comparison" | "direction" | "choice" | "upgrade" | "level" | "percent", string>>;
    readonly needsFix: string;
    elsewhere(modeName: string): string;
    readonly modesTitle: string;
    readonly pickMode: string;
    readonly sectionLegend: string;
    readonly more: string;
    conditionTitle(n: number, rule: number): string;
    readonly fallbackTitle: string;
    readonly listLabel: string;
  };
  readonly issues: IssueText;
  readonly tryIt: { readonly invalid: string };
  readonly roundRules: { readonly title: string; readonly open: string };
  /** The kit page that shows this screen without a server ("/kit?show=prep"). */
  readonly harness: {
    readonly heading: string;
    readonly intro: string;
    readonly firstVisit: string;
    readonly server: string;
    readonly serverOk: string;
    readonly serverOffline: string;
    readonly serverRound: string;
    readonly rules: string;
    readonly rulesStandard: string;
    readonly rulesKnown: string;
    readonly rulesHidden: string;
    readonly playerName: string;
    readonly options: string;
    readonly statusLine: string;
    readonly column: string;
    readonly columnFull: string;
    readonly columnNarrow: string;
  };
}

export const en: PrepText = {
  tabsLabel: "Prepare your tank",
  tabs: { style: "Play style", rules: "Rules", upgrades: "Upgrades", try: "Try it" },
  loading: "Your tank is loading.",
  loadFailed: "Your tank did not load.",
  tryAgain: "Try again",
  save: {
    invalid: "Fix the part marked in red, and your tank saves itself.",
    roundRunning: "A round is running, so your change saves when it ends.",
    offline: "There is no connection, so your change waits here.",
    retry: "Try again",
  },
  nextRules: {
    known: (name) => `The next round uses the ${name} rules.`,
    hidden: "The rules of the next round stay secret until the round starts.",
  },
  style: {
    legend: "Play style",
    ownRules: "Your tank plays by your own rules.",
    traitsLabel: "What it does",
    changed: (name) => `Your tank now plays as ${name}.`,
    traits: {
      huntsLeader: "hunts the leader",
      huntsDryTanks: "hunts tanks with less water",
      sneaksBehind: "sneaks up from behind",
      refillsFirst: "refills before it attacks",
      shootsUpClose: "shoots up close",
      dodgesAim: "dodges tanks that aim at it",
      keepsDistance: "keeps its distance",
      wanders: "moves at random",
      chasesNearest: "drives at the nearest tank",
      shootsInRange: "shoots when a tank is in range",
    },
    sourceLegend: "Which play styles",
    builtIn: "Built-in",
    mine: "Mine",
    use: "Use this play style",
    useShort: "Use",
    chosen: "Chosen",
    fromMine: (name) => `Your tank plays as “${name}”, one of your own play styles.`,
    mineLabel: "My play styles",
    noneYet: "Build your own in the workshop",
    cannotLoad: "This play style has a problem, so fix it in the tank workshop first.",
  },
  saveAs: {
    open: "Save as my play style",
    intro: "Give this play style a name, and you find it under Mine and in the tank workshop.",
    name: "Name of the play style",
    nameHint: (max) => `Use 1 to ${max} characters.`,
    save: "Save",
    saved: (name) => `Your play style is saved as “${name}”.`,
    invalid: "Fix the part marked in red first, and then you can save your tank.",
    nameProblem: "Give it a name of 1 to 24 characters.",
    nameTaken: "You already have a play style with this name, so pick another one.",
    full: (max) => `You can keep at most ${max} play styles, so delete one in the tank workshop first.`,
  },
  upgrades: {
    free: (points) => (points === 1 ? "You have 1 point to place." : `You have ${points} points to place.`),
    allPlaced: (total) => `All ${total} points are placed, so take one out to move it.`,
    blocked: (need, have) =>
      `You need ${need} ${need === 1 ? "point" : "points"} and have ${have}, so take a point out of another upgrade first.`,
    trayLabel: "Upgrade points",
    takeAllOut: "Take all out",
    putBack: "Put them back",
    secret: "The numbers stay secret until the round rules are known.",
    levelOf: (level, max) => `Level ${level} of ${max}`,
    fillSocket: (name, level) => `Fill ${name} up to level ${level}`,
    emptySocket: (name, level) => `Take ${name} back to level ${level}`,
    effects: {
      range: (squares) => (squares === 1 ? "Your shot reaches 1 square." : `Your shot reaches ${squares} squares.`),
      rangeEmpty: (squares) => `Range is still empty, so your shot reaches ${squares} ${squares === 1 ? "square" : "squares"}.`,
      rangeSecret: (extra) => `Your shot reaches ${extra} ${extra === 1 ? "square" : "squares"} farther than usual.`,
      rangeEmptySecret: "Range is still empty, so your shot reaches as far as usual.",
      aim: (percent) => `Your shots hit ${percent}% more often.`,
      aimEmpty: "Aim is still empty, so your shots hit as often as usual.",
      aimSecret: "Your shots hit more often.",
      dodge: (percent) => `Shots at you hit ${percent}% less often.`,
      dodgeEmpty: "Dodge is still empty, so shots at you hit as usual.",
      dodgeSecret: "Shots at you hit less often.",
    },
    help: "How upgrade points work",
    helpTitle: "Upgrade points",
    helpTokens: "Tap an empty socket to put points in, and tap a full one to take them out.",
    helpCost: "One level of Range takes 2 points, and one level of Aim or Dodge takes 1 point.",
    helpDistance: (squares) => `Aim and Dodge count only when the two tanks are ${squares} or more squares apart.`,
    helpDistanceSecret: "Aim and Dodge count from a distance that the round rules set.",
  },
  rules: {
    intro: "Each turn, your tank does the first rule from the top that fits.",
    modesIntro: "A mode is one more list of rules, and a rule can switch your tank to another mode.",
    addMode: "Add a mode",
    startWord: "start",
    editModes: "Edit modes",
    startsIn: (modeName) => `Your tank starts in ${modeName}.`,
    toMode: (modeName) => `to mode ${modeName}`,
    moreModes: (n) => (n === 1 ? "1 more mode" : `${n} more modes`),
    newModeName: (n) => `Mode ${n}`,
    modesFull: (max) => `Your tank has ${max} modes, which is the most it can have.`,
    modeOptions: (name) => `Change the “${name}” mode`,
    modeName: "Mode name",
    startsHere: "Your tank starts each round in this mode.",
    makeStart: "Start rounds in this mode",
    deleteMode: "Delete this mode",
    modeDeleted: (name) => `The “${name}” mode was deleted.`,
    empty: "This mode has no rules yet, so your tank always does what “If no rule fits” says.",
    addRule: "Add a rule",
    rulesFull: (max) => `This mode has ${max} rules, which is the most it can have.`,
    water: (rules) =>
      rules === null
        ? "How much water a shot uses depends on the next round's rules, which stay secret until it starts."
        : `A shot uses ${rules.waterPerThrow} of the ${rules.waterCapacity} water in your tank. Your tank gets ${rules.waterRefillPerTick} water back on each turn it does not shoot.`,
    ruleNumber: (n) => `Rule ${n}`,
    when: "When",
    do: "Do",
    matchLegend: "The rule fits when",
    matchAll: "all of these are true",
    matchAny: "any of these is true",
    condition: (n) => `Condition ${n}`,
    action: "Action",
    addCondition: "Add a condition",
    conditionsFull: (max) => `A rule can have up to ${max} conditions.`,
    removeCondition: (n) => `Remove condition ${n}`,
    doKindLegend: "What the tank does",
    oneAction: "One action",
    stepsInOrder: "Steps in order",
    step: (n) => `Step ${n}`,
    stepBlock: (n, name) => `Step ${n}: ${name}`,
    stepEarlier: (n) => `Move step ${n} earlier`,
    stepLater: (n) => `Move step ${n} later`,
    removeStep: (n) => `Remove step ${n}`,
    addStep: "Add a step",
    stepTitle: (step, rule) => `Step ${step} of rule ${rule}`,
    stepsFull: (max) => `A rule can have up to ${max} steps.`,
    chance: "Chance in percent",
    chanceHelp: "When the rule fits, your tank does it this often, and otherwise it reads the next rule.",
    switchTo: "Then switch to",
    stay: "Stay in this mode",
    switchHelp: "After doing this, your tank uses the rules of the mode you pick from the next turn on.",
    negate: (n) => `Use the opposite of condition ${n}`,
    negateHelp: "The rule then fits when this condition is false.",
    moveUp: (n) => `Move rule ${n} up`,
    moveDown: (n) => `Move rule ${n} down`,
    duplicate: (n) => `Copy rule ${n}`,
    remove: (n) => `Delete rule ${n}`,
    ruleDeleted: (n) => `Rule ${n} was deleted.`,
    done: "Done",
    paramNames: {
      number: "number",
      distance: "distance",
      target: "tank",
      comparison: "comparison",
      direction: "direction",
      choice: "choice",
      upgrade: "upgrade",
      level: "level",
      percent: "percent",
    },
    paramQuestions: {
      number: "Which number?",
      distance: "How far?",
      target: "Which tank?",
      comparison: "More or less?",
      direction: "Which way?",
      choice: "Which one?",
      upgrade: "Which upgrade?",
      level: "Which level?",
      percent: "How much?",
    },
    needsFix: "Something in your rules needs a fix before your tank can save.",
    elsewhere: (modeName) => `In the “${modeName}” mode:`,
    modesTitle: "Modes",
    pickMode: "Pick a mode",
    sectionLegend: "Part of the rule",
    more: "More options",
    conditionTitle: (n, rule) => `Condition ${n} of rule ${rule}`,
    fallbackTitle: "If no rule fits",
    listLabel: "Rules of this mode",
  },
  issues: {
    notAnObject: () => "This part is damaged, so delete it and add it again.",
    paramsMissing: () => "A choice here is empty, so pick one from the list.",
    paramMissing: () => "A choice here is empty, so pick one from the list.",
    paramOutOfRange: ({ min, max }) => `A number here is outside ${min} to ${max}, so change it.`,
    paramNotAnOption: () => "A choice here is not on the list any more, so pick another one.",
    unknownCondition: () => "This condition is not in the game any more, so pick another one.",
    unknownAction: () => "This action is not in the game any more, so pick another one.",
    stepCount: ({ min, max }) => `Steps in order need ${min} to ${max} steps, so add or remove a step.`,
    notAStep: () => "This action decides on its own each turn, so pick a step from the list instead.",
    negateNotSwitch: () => "The “opposite” switch is damaged, so turn it on or off again.",
    badId: ({ part }) =>
      part === "rule" ? "This rule is damaged, so copy it and delete the original." : "This mode is damaged, so delete it and add it again.",
    conditionCount: ({ max, actual }) =>
      actual !== null && actual > max ? `This rule has more than ${max} conditions, so remove some.` : "This rule has no condition, so add one.",
    duplicateRuleId: () => "This rule is damaged, so copy it and delete the original.",
    matchInvalid: () => "Choose whether all or any of the conditions must be true.",
    chanceOutOfRange: ({ min, max }) => `Set the chance to a number from ${min} to ${max}.`,
    switchTargetMissing: () => "The mode this rule switches to is gone, so pick another mode or stay in this one.",
    nameLength: ({ max }) => `Give this mode a name of 1 to ${max} characters.`,
    rulesNotList: () => "The rules of this mode are damaged, so pick a play style to start again.",
    tooManyRules: ({ max }) => `This mode has more than ${max} rules, so delete some.`,
    duplicateModeId: () => "This mode is damaged, so delete it and add it again.",
    modeCount: ({ max, actual }) =>
      actual !== null && actual > max ? `Your tank has more than ${max} modes, so delete some.` : "Your tank has no mode, so pick a play style.",
    buildMissing: () => "The upgrades are damaged, so set them again.",
    unknownAttribute: () => "The upgrades are damaged, so set them again.",
    levelOutOfRange: ({ max }) => `An upgrade is outside level 0 to ${max}, so set it again.`,
    overBudget: ({ cost, budget }) => `Your upgrades cost ${cost} points and you have ${budget}, so lower one of them.`,
  },
  tryIt: { invalid: "Fix the part marked in red on the Rules or Upgrades tab, and then you can try your tank here." },
  roundRules: { title: "All round rules", open: "See all round rules" },
  harness: {
    heading: "Tank preparation without a server",
    intro: "This page keeps the tank itself, and the controls below set how the pretend server answers a save.",
    firstVisit: "Start a first visit",
    server: "Server answer",
    serverOk: "Saves",
    serverOffline: "No connection",
    serverRound: "Round in progress",
    rules: "Round rules",
    rulesStandard: "Always standard",
    rulesKnown: "Announced",
    rulesHidden: "Secret",
    playerName: "Ana",
    options: "Pretend server",
    statusLine: "You are in, and your tank waits for the first round.",
    column: "Width of the pane",
    columnFull: "Whole width",
    columnNarrow: "Middle column",
  },
};

export const id: PrepText = {
  tabsLabel: "Siapkan tank kamu",
  tabs: { style: "Gaya main", rules: "Aturan", upgrades: "Peningkatan", try: "Coba" },
  loading: "Tank kamu sedang dimuat.",
  loadFailed: "Tank kamu belum bisa dimuat.",
  tryAgain: "Coba lagi",
  save: {
    invalid: "Perbaiki bagian yang ditandai merah, lalu tank kamu tersimpan sendiri.",
    roundRunning: "Ronde sedang berjalan, jadi perubahanmu tersimpan saat ronde selesai.",
    offline: "Koneksi terputus, jadi perubahanmu disimpan di sini dulu.",
    retry: "Coba lagi",
  },
  nextRules: {
    known: (name) => `Ronde berikutnya memakai aturan ${name}.`,
    hidden: "Aturan ronde berikutnya dirahasiakan sampai ronde mulai.",
  },
  style: {
    legend: "Gaya main",
    ownRules: "Tank kamu memakai aturan buatanmu sendiri.",
    traitsLabel: "Yang dilakukannya",
    changed: (name) => `Tank kamu sekarang bermain sebagai ${name}.`,
    traits: {
      huntsLeader: "memburu pemimpin",
      huntsDryTanks: "memburu tank yang airnya sedikit",
      sneaksBehind: "menyelinap dari belakang",
      refillsFirst: "mengisi air sebelum menyerang",
      shootsUpClose: "menembak dari dekat",
      dodgesAim: "menghindari bidikan",
      keepsDistance: "menjaga jarak",
      wanders: "bergerak acak",
      chasesNearest: "mendekati tank terdekat",
      shootsInRange: "menembak tank dalam jangkauan",
    },
    sourceLegend: "Gaya main yang ditampilkan",
    builtIn: "Bawaan",
    mine: "Buatanku",
    use: "Pakai gaya main ini",
    useShort: "Pakai",
    chosen: "Dipilih",
    fromMine: (name) => `Tank kamu memakai “${name}”, gaya main buatanmu.`,
    mineLabel: "Gaya main buatanku",
    noneYet: "Susun sendiri di bengkel tank",
    cannotLoad: "Gaya main ini masih ada masalah, jadi perbaiki dulu di bengkel tank.",
  },
  saveAs: {
    open: "Simpan sebagai gaya main buatanku",
    intro: "Beri nama gaya main ini, lalu kamu bisa menemukannya di Buatanku dan di bengkel tank.",
    name: "Nama gaya main",
    nameHint: (max) => `Pakai 1 sampai ${max} karakter.`,
    save: "Simpan",
    saved: (name) => `Gaya main kamu tersimpan sebagai “${name}”.`,
    invalid: "Perbaiki dulu bagian yang ditandai merah, lalu kamu bisa menyimpan tank kamu.",
    nameProblem: "Beri nama sepanjang 1 sampai 24 karakter.",
    nameTaken: "Kamu sudah punya gaya main dengan nama ini, jadi pilih nama lain.",
    full: (max) => `Kamu bisa menyimpan paling banyak ${max} gaya main, jadi hapus satu dulu di bengkel tank.`,
  },
  upgrades: {
    free: (points) => `Kamu punya ${points} poin untuk dipasang.`,
    allPlaced: (total) => `Semua ${total} poin sudah terpasang, jadi lepas satu untuk memindahkannya.`,
    blocked: (need, have) => `Kamu butuh ${need} poin dan punya ${have}, jadi lepas dulu satu poin dari peningkatan lain.`,
    trayLabel: "Poin peningkatan",
    takeAllOut: "Lepas semua",
    putBack: "Pasang lagi",
    secret: "Angkanya dirahasiakan sampai aturan ronde diketahui.",
    levelOf: (level, max) => `Level ${level} dari ${max}`,
    fillSocket: (name, level) => `Isi ${name} sampai level ${level}`,
    emptySocket: (name, level) => `Turunkan ${name} ke level ${level}`,
    effects: {
      range: (squares) => `Tembakanmu menjangkau ${squares} petak.`,
      rangeEmpty: (squares) => `Jangkauan masih kosong, jadi tembakanmu menjangkau ${squares} petak.`,
      rangeSecret: (extra) => `Tembakanmu menjangkau ${extra} petak lebih jauh dari biasanya.`,
      rangeEmptySecret: "Jangkauan masih kosong, jadi tembakanmu menjangkau sejauh biasanya.",
      aim: (percent) => `Tembakanmu kena ${percent}% lebih sering.`,
      aimEmpty: "Bidikan masih kosong, jadi tembakanmu kena seperti biasa.",
      aimSecret: "Tembakanmu lebih sering kena.",
      dodge: (percent) => `Tembakan ke arahmu kena ${percent}% lebih jarang.`,
      dodgeEmpty: "Hindaran masih kosong, jadi tembakan ke arahmu kena seperti biasa.",
      dodgeSecret: "Tembakan ke arahmu lebih jarang kena.",
    },
    help: "Cara kerja poin peningkatan",
    helpTitle: "Poin peningkatan",
    helpTokens: "Ketuk lubang yang kosong untuk memasang poin, dan ketuk yang terisi untuk melepasnya.",
    helpCost: "Satu level Jangkauan butuh 2 poin, dan satu level Bidikan atau Hindaran butuh 1 poin.",
    helpDistance: (squares) => `Bidikan dan Hindaran baru berlaku kalau kedua tank berjarak ${squares} petak atau lebih.`,
    helpDistanceSecret: "Bidikan dan Hindaran berlaku mulai jarak yang ditentukan aturan ronde.",
  },
  rules: {
    intro: "Di setiap giliran, tank kamu menjalankan aturan pertama dari atas yang cocok.",
    modesIntro: "Mode adalah satu daftar aturan lagi, dan sebuah aturan bisa memindahkan tank kamu ke mode lain.",
    addMode: "Tambah mode",
    startWord: "mulai",
    editModes: "Ubah mode",
    startsIn: (modeName) => `Tank kamu mulai di mode ${modeName}.`,
    toMode: (modeName) => `ke mode ${modeName}`,
    moreModes: (n) => `${n} mode lagi`,
    newModeName: (n) => `Mode ${n}`,
    modesFull: (max) => `Tank kamu sudah punya ${max} mode, dan itu jumlah terbanyak.`,
    modeOptions: (name) => `Ubah mode “${name}”`,
    modeName: "Nama mode",
    startsHere: "Tank kamu memulai setiap ronde di mode ini.",
    makeStart: "Mulai ronde di mode ini",
    deleteMode: "Hapus mode ini",
    modeDeleted: (name) => `Mode “${name}” sudah dihapus.`,
    empty: "Mode ini belum punya aturan, jadi tank kamu selalu menjalankan bagian “Kalau tidak ada aturan yang cocok”.",
    addRule: "Tambah aturan",
    rulesFull: (max) => `Mode ini sudah punya ${max} aturan, dan itu jumlah terbanyak.`,
    water: (rules) =>
      rules === null
        ? "Banyak air untuk satu tembakan bergantung pada aturan ronde berikutnya, yang dirahasiakan sampai ronde mulai."
        : `Satu tembakan memakai ${rules.waterPerThrow} dari ${rules.waterCapacity} air di tank kamu. Tank kamu mendapat ${rules.waterRefillPerTick} air lagi di setiap giliran tanpa menembak.`,
    ruleNumber: (n) => `Aturan ${n}`,
    when: "Kalau",
    do: "Lakukan",
    matchLegend: "Aturan ini cocok kalau",
    matchAll: "semua syarat ini benar",
    matchAny: "salah satu syarat ini benar",
    condition: (n) => `Syarat ${n}`,
    action: "Tindakan",
    addCondition: "Tambah syarat",
    conditionsFull: (max) => `Satu aturan boleh punya maksimal ${max} syarat.`,
    removeCondition: (n) => `Hapus syarat ${n}`,
    doKindLegend: "Yang dilakukan tank",
    oneAction: "Satu tindakan",
    stepsInOrder: "Langkah berurutan",
    step: (n) => `Langkah ${n}`,
    stepBlock: (n, name) => `Langkah ${n}: ${name}`,
    stepEarlier: (n) => `Pindahkan langkah ${n} ke depan`,
    stepLater: (n) => `Pindahkan langkah ${n} ke belakang`,
    removeStep: (n) => `Hapus langkah ${n}`,
    addStep: "Tambah langkah",
    stepTitle: (step, rule) => `Langkah ${step} di aturan ${rule}`,
    stepsFull: (max) => `Satu aturan boleh punya maksimal ${max} langkah.`,
    chance: "Peluang dalam persen",
    chanceHelp: "Kalau aturan ini cocok, tank kamu menjalankannya sesering ini. Di giliran lainnya, tank membaca aturan berikutnya.",
    switchTo: "Lalu pindah ke",
    stay: "Tetap di mode ini",
    switchHelp: "Setelah itu, mulai giliran berikutnya tank kamu memakai aturan dari mode yang kamu pilih.",
    negate: (n) => `Pakai kebalikan syarat ${n}`,
    negateHelp: "Aturan ini jadi cocok saat syarat ini salah.",
    moveUp: (n) => `Naikkan aturan ${n}`,
    moveDown: (n) => `Turunkan aturan ${n}`,
    duplicate: (n) => `Salin aturan ${n}`,
    remove: (n) => `Hapus aturan ${n}`,
    ruleDeleted: (n) => `Aturan ${n} sudah dihapus.`,
    done: "Selesai",
    paramNames: {
      number: "angka",
      distance: "jarak",
      target: "tank",
      comparison: "perbandingan",
      direction: "arah",
      choice: "pilihan",
      upgrade: "peningkatan",
      level: "level",
      percent: "persen",
    },
    paramQuestions: {
      number: "Angka berapa?",
      distance: "Seberapa jauh?",
      target: "Tank yang mana?",
      comparison: "Lebih atau kurang?",
      direction: "Ke arah mana?",
      choice: "Yang mana?",
      upgrade: "Peningkatan yang mana?",
      level: "Level berapa?",
      percent: "Berapa banyak?",
    },
    needsFix: "Ada bagian aturan yang perlu diperbaiki sebelum tank kamu bisa tersimpan.",
    elsewhere: (modeName) => `Di mode “${modeName}”:`,
    modesTitle: "Mode",
    pickMode: "Pilih mode",
    sectionLegend: "Bagian aturan",
    more: "Opsi lainnya",
    conditionTitle: (n, rule) => `Syarat ${n} di aturan ${rule}`,
    fallbackTitle: "Kalau tidak ada aturan yang cocok",
    listLabel: "Aturan di mode ini",
  },
  issues: {
    notAnObject: () => "Bagian ini rusak, jadi hapus lalu buat lagi.",
    paramsMissing: () => "Ada pilihan yang masih kosong, jadi pilih salah satu dari daftar.",
    paramMissing: () => "Ada pilihan yang masih kosong, jadi pilih salah satu dari daftar.",
    paramOutOfRange: ({ min, max }) => `Ada angka di luar ${min} sampai ${max}, jadi ubah angkanya.`,
    paramNotAnOption: () => "Ada pilihan yang sudah tidak ada di daftar, jadi pilih yang lain.",
    unknownCondition: () => "Syarat ini sudah tidak ada di permainan, jadi pilih syarat lain.",
    unknownAction: () => "Tindakan ini sudah tidak ada di permainan, jadi pilih tindakan lain.",
    stepCount: ({ min, max }) => `Langkah berurutan butuh ${min} sampai ${max} langkah, jadi tambah atau hapus langkah.`,
    notAStep: () => "Tindakan ini memutuskan sendiri tiap giliran, jadi pilih langkah dari daftar.",
    negateNotSwitch: () => "Tombol “kebalikan” rusak, jadi nyalakan atau matikan lagi.",
    badId: ({ part }) =>
      part === "rule" ? "Aturan ini rusak, jadi salin aturannya, lalu hapus yang lama." : "Mode ini rusak, jadi hapus lalu buat lagi.",
    conditionCount: ({ max, actual }) =>
      actual !== null && actual > max ? `Aturan ini punya lebih dari ${max} syarat, jadi hapus sebagian.` : "Aturan ini belum punya syarat, jadi tambahkan satu.",
    duplicateRuleId: () => "Aturan ini rusak, jadi salin aturannya, lalu hapus yang lama.",
    matchInvalid: () => "Pilih apakah semua syarat atau salah satunya harus benar.",
    chanceOutOfRange: ({ min, max }) => `Isi peluang dengan angka ${min} sampai ${max}.`,
    switchTargetMissing: () => "Mode tujuan aturan ini sudah tidak ada, jadi pilih mode lain atau tetap di mode ini.",
    nameLength: ({ max }) => `Beri mode ini nama sepanjang 1 sampai ${max} karakter.`,
    rulesNotList: () => "Aturan di mode ini rusak, jadi pilih gaya main untuk mulai lagi.",
    tooManyRules: ({ max }) => `Mode ini punya lebih dari ${max} aturan, jadi hapus sebagian.`,
    duplicateModeId: () => "Mode ini rusak, jadi hapus lalu buat lagi.",
    modeCount: ({ max, actual }) =>
      actual !== null && actual > max ? `Tank kamu punya lebih dari ${max} mode, jadi hapus sebagian.` : "Tank kamu belum punya mode, jadi pilih gaya main.",
    buildMissing: () => "Peningkatan tank kamu rusak, jadi atur lagi.",
    unknownAttribute: () => "Peningkatan tank kamu rusak, jadi atur lagi.",
    levelOutOfRange: ({ max }) => `Ada peningkatan di luar level 0 sampai ${max}, jadi atur lagi.`,
    overBudget: ({ cost, budget }) => `Peningkatanmu butuh ${cost} poin dan poinmu ${budget}, jadi turunkan salah satunya.`,
  },
  tryIt: { invalid: "Perbaiki bagian yang ditandai merah di tab Aturan atau Peningkatan, lalu kamu bisa mencoba tank kamu di sini." },
  roundRules: { title: "Semua aturan ronde", open: "Lihat semua aturan ronde" },
  harness: {
    heading: "Persiapan tank tanpa server",
    intro: "Halaman ini menyimpan tank itu sendiri, dan pilihan di bawah mengatur jawaban server pura-pura saat menyimpan.",
    firstVisit: "Mulai kunjungan pertama",
    server: "Jawaban server",
    serverOk: "Tersimpan",
    serverOffline: "Tanpa koneksi",
    serverRound: "Ronde berjalan",
    rules: "Aturan ronde",
    rulesStandard: "Selalu standar",
    rulesKnown: "Diumumkan",
    rulesHidden: "Rahasia",
    playerName: "Ana",
    options: "Server pura-pura",
    statusLine: "Kamu sudah masuk, dan tank kamu menunggu ronde pertama.",
    column: "Lebar panel",
    columnFull: "Selebar layar",
    columnNarrow: "Kolom tengah",
  },
};

/** The sentence for one issue. The cast is safe: the code picks the function and its params together. */
export function issueSentence(text: PrepText, issue: { readonly code: StrategyIssueCode; readonly params: unknown }): string {
  return (text.issues[issue.code] as (params: unknown) => string)(issue.params);
}
