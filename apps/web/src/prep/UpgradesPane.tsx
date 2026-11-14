// The upgrade bench (71-workshop-appeal.md, part B). The 6 upgrade points are cogs: a
// free cog lies in the tray on top, a placed one leaves its silhouette there and sits in
// a socket of Range, Aim or Dodge. The tray's sentence says how many lie free, or that
// all are placed and one must come out to move it. A tap that needs more cogs than lie
// free shakes the tray and says so. "Take all out" empties every socket and turns into
// "Put them back" in the same place, which is its Undo.
//
// Layout: three cards in one row on a pane from 56rem (the group at most 60rem), one
// card under another below that. Each card: its drawing on top, growing with the free
// height; then the name, the sockets and minus and plus; then the sentence. On a short
// pane the cards' sentences go first and the drawings last (ui/useFitDetail); the tray and
// the sockets always stay. The rule that Aim and Dodge count from a distance is in the
// help step behind "?", not on the cards.

import { CircleHelp, Minus, PackageOpen, Plus, Undo2 } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { AttributeId, RoundRules, StrategyInput } from "@game/engine";
import { ATTRIBUTES, BUILD_BUDGET } from "@game/engine";
import { emptyBuild, levelOf, pointsSpent, setBuildLevel } from "../editor/build.ts";
import { useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { playSound } from "../sound/player.ts";
import type { TankLook } from "../tank/look.ts";
import { Button } from "../ui/Button.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";
import { Problems } from "./RuleParts.tsx";
import { AimDrawing, DodgeDrawing, RangeDrawing } from "./UpgradeDrawings.tsx";
import { UpgradeToken } from "./UpgradeToken.tsx";
import { ATTRIBUTE_IDS, freePoints, socketsOf, tapMinus, tapPlus, tapSocket, upgradeNumbers, upgradeSentence, type BenchTap, type UpgradeNumbers } from "./upgrades.ts";

export interface UpgradesPaneProps {
  readonly strategy: StrategyInput;
  /** The rules whose numbers the bench shows, or null when they are secret. */
  readonly rules: RoundRules | null;
  readonly problems: readonly string[];
  /** The tank drawn on the cards. */
  readonly look: TankLook;
  onChange(next: StrategyInput): void;
  /** A control the host adds at the end of the tray row (the arena's "Save as my play style"). */
  readonly actions?: ReactNode;
}

/** The tray's sentence: free cogs, all placed, or why the last tap did nothing. */
type TrayNote = { readonly kind: "count" } | { readonly kind: "blocked"; readonly need: number; readonly have: number };

const TOKEN_MOVE_MS = 200;
const TOKEN_PX = 24;
/** From this pane height the sockets and cogs are drawn bigger. */
const BIG_BENCH_MIN_PX = 640;
/** From this pane width the three cards sit in one row. */
const THREE_CARDS_MIN_PX = 896;
/** From this pane width the cards are rows with the drawing at the left, until three fit side by side. */
const ROWS_MIN_PX = 520;
/** From this pane width the tray's sentence sits beside the tray and its cogs are drawn at full size. */
const ROOMY_TOP_MIN_PX = 672;
/** From this pane width "Take all out" shows its words beside its icon. */
const WORDY_TOP_MIN_PX = 380;
const TRAY_TOKEN_PX = 30;

/** Levels of a short pane, from the fullest (0). */
const BENCH_LEVELS = 6;
/** On a narrow pane, the level at which the cards become rows with a small drawing at the left. */
const ROWS_LEVEL = 4;
/** The level at which the drawings go. */
const DROP_DRAWINGS_LEVEL = 5;

function motionAllowed(): boolean {
  return typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The centre of an element, for moving a cog from where it was to where it is. */
function centreOf(element: Element): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * Moves the cogs that changed place: a cog put in a socket flies there from the tray place
 * it left, a cog taken out flies back from the socket it left. Free cogs fill the tray from
 * the left, so the places that changed are the ones between the old and the new free count.
 */
function useTokenFlight(root: HTMLElement | null, build: StrategyInput["build"]) {
  const before = useRef<{ free: number; levels: Record<string, number>; sockets: Map<string, { x: number; y: number }> } | null>(null);
  useLayoutEffect(() => {
    if (root === null) return;
    const free = freePoints(build);
    const levels = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, levelOf(build, id)]));
    const sockets = new Map([...root.querySelectorAll<HTMLElement>("[data-token-at]")].map((el) => [el.dataset["tokenAt"] ?? "", centreOf(el)]));
    const old = before.current;
    before.current = { free, levels, sockets };
    if (old === null || !motionAllowed()) return;
    const tray = (i: number) => root.querySelector(`[data-tray-place="${i}"]`);
    const fly = (element: Element | null, from: { x: number; y: number } | undefined) => {
      if (element === null || from === undefined) return;
      const to = centreOf(element);
      element.animate([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` }, { transform: "none" }], { duration: TOKEN_MOVE_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    };
    // Cogs placed: the tokens of the new sockets, in order, take off from the tray places that emptied.
    const placed = ATTRIBUTE_IDS.flatMap((id) => [...root.querySelectorAll(`[data-token-at^="${id}-"]`)].filter((el) => Number((el as HTMLElement).dataset["tokenLevel"]) > (old.levels[id] ?? 0)));
    placed.forEach((el, i) => fly(el, tray(free + i) === null ? undefined : centreOf(tray(free + i) as Element)));
    // Cogs taken out: the tray places that filled get their cogs from the sockets that emptied.
    const emptied = ATTRIBUTE_IDS.flatMap((id) => [...old.sockets].filter(([key]) => key.startsWith(`${id}-`) && Number(key.split("-")[1]) > (levels[id] ?? 0)).map(([, at]) => at));
    emptied.forEach((at, i) => fly(tray(old.free + i), at));
  });
}

/** The tray: a drawer with a body of its own, so it reads as the place the cogs come from. */
function Tray({ free, cog }: { readonly free: number; readonly cog: "small" | "medium" | "large" }) {
  return (
    // The cogs are smaller in a narrow row, so the tray and its buttons share one line on a 360 px phone.
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center rounded-[0.9rem] border-2 border-b-4 border-line-strong bg-line py-1 ${cog === "small" ? "gap-0.5 px-1.5 [&_svg]:size-[22px]" : cog === "medium" ? "gap-1 px-2 [&_svg]:size-[30px]" : "gap-1 px-2 [&_svg]:size-[36px]"}`}
    >
      {Array.from({ length: BUILD_BUDGET }, (_, i) => (
        <span key={i} data-tray-place={i}>
          <UpgradeToken look={i < free ? "token" : "empty"} size={TRAY_TOKEN_PX} />
        </span>
      ))}
    </span>
  );
}

function Drawing({ attribute, level, numbers, look }: { readonly attribute: AttributeId; readonly level: number; readonly numbers: UpgradeNumbers | null; readonly look: TankLook }) {
  switch (attribute) {
    case "reach":
      return <RangeDrawing look={look} level={level} range={numbers === null ? null : numbers.range} />;
    case "aim":
      return <AimDrawing look={look} level={level} />;
    case "dodge":
      return <DodgeDrawing look={look} level={level} />;
  }
}

/**
 * How the three cards are laid out (71-workshop-appeal.md, part B, and the lead's review):
 * - "columns": three cards side by side on shared rows (a subgrid), so the drawings, names, socket rows and sentences
 *   each line up across the cards; the drawing fills its card's width at its own 2:1 shape;
 * - "rows": one card under another, each read from left to right: the drawing at the left at the card's height, then
 *   the name, the sockets with minus and plus, and the sentence;
 * - "stacked": a phone with the height for it: the drawing on top, as wide as the card, growing with the free height;
 * - "plain": no drawing, when even the rows do not fit.
 */
export type BenchLayout = "columns" | "rows" | "stacked" | "plain";

/** The layout for a pane width and a short-pane level (the levels of ui/useFitDetail). Pure, for the test. */
export function benchLayout(width: number, level: number): BenchLayout {
  if (level >= DROP_DRAWINGS_LEVEL) return "plain";
  if (width >= THREE_CARDS_MIN_PX) return "columns";
  if (width >= ROWS_MIN_PX || level >= ROWS_LEVEL) return "rows";
  return "stacked";
}

function Card(props: {
  readonly attribute: AttributeId;
  readonly level: number;
  readonly numbers: UpgradeNumbers | null;
  readonly look: TankLook;
  readonly showSentence: boolean;
  readonly layout: BenchLayout;
  /** A tall pane: bigger sockets and cogs, so the bench fills the window like a workbench. */
  readonly big: boolean;
  tap(result: BenchTap): void;
  readonly build: StrategyInput["build"];
}) {
  const m = useMessages();
  const u = m.prep.upgrades;
  const { attribute, level, build, big, layout } = props;
  const name = m.vocabulary.attributes[attribute].name;
  const top = ATTRIBUTES[attribute].levels.length - 1;
  const sockets = socketsOf(attribute);
  const plus = tapPlus(build, attribute);
  const minus = tapMinus(build, attribute);
  // Without its drawing a card is one row, so its cogs are smaller and Range's double sockets fit beside the name on a 360 px phone.
  const tokenPx = big ? 32 : layout === "plain" ? 20 : TOKEN_PX;
  const drawing = (
    <span className="absolute inset-0 flex">
      <Drawing attribute={attribute} level={level} numbers={props.numbers} look={props.look} />
    </span>
  );
  const heading = (
    <h3 className={`min-w-0 leading-tight ${layout === "plain" ? "" : "text-lead"}`}>
      {name}
      <span className="sr-only">{`, ${u.levelOf(level, top)}`}</span>
    </h3>
  );
  // The sockets always sit in one row; minus and plus move under them when the row is too narrow.
  const controls = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="flex shrink-0 flex-nowrap items-center gap-1">
        {sockets.map((socket) => {
          const filled = socket.level <= level;
          const label = filled ? u.emptySocket(name, socket.level - 1) : u.fillSocket(name, socket.level);
          return (
            <button
              key={socket.level}
              type="button"
              aria-label={label}
              title={label}
              data-socket={`${attribute}-${socket.level}`}
              onClick={() => props.tap(tapSocket(build, attribute, socket.level))}
              className={`press flex min-w-11 items-center justify-center gap-0.5 rounded-[var(--radius-control)] border-2 px-0.5 ${big ? "min-h-14" : "min-h-11"} ${filled ? "border-water-deep bg-water-soft" : "border-dashed border-line-strong bg-ground [@media(hover:hover)]:hover:border-water"}`}
            >
              {Array.from({ length: socket.tokens }, (_, i) =>
                filled ? (
                  <span key={i} data-token-at={`${attribute}-${socket.level}-${i}`} data-token-level={socket.level}>
                    <UpgradeToken look="token" size={tokenPx} />
                  </span>
                ) : (
                  <UpgradeToken key={i} look="empty" size={tokenPx} />
                ),
              )}
            </button>
          );
        })}
      </span>
      <span className="flex shrink-0 flex-nowrap items-center gap-1">
        <IconButton label={m.common.decrease(name)} icon={<Minus aria-hidden size={20} strokeWidth={3} />} disabled={minus.kind === "none"} data-upgrade-minus={attribute} onClick={() => props.tap(minus)} />
        {/* Plus stays active when the cogs run out: its tap shakes the tray and says why. */}
        <IconButton label={m.common.increase(name)} icon={<Plus aria-hidden size={20} strokeWidth={3} />} disabled={plus.kind === "none"} data-upgrade-plus={attribute} onClick={() => props.tap(plus)} />
      </span>
    </span>
  );
  const sentence = props.showSentence ? (
    <p aria-live="polite" className="min-w-0 text-caption font-semibold text-muted [overflow-wrap:anywhere]">
      {upgradeSentence(u.effects, attribute, level, props.numbers)}
    </p>
  ) : (
    <span />
  );
  const card = "min-w-0 rounded-[var(--radius-card)] border-2 border-b-4 border-line bg-panel";

  switch (layout) {
    case "columns":
      return (
        // Four shared rows across the three cards: drawing, name, sockets, sentence.
        <li data-upgrade={attribute} className={`${card} row-span-4 grid grid-rows-subgrid gap-y-1.5 p-2`}>
          <span className="relative block aspect-[2/1] w-full">{drawing}</span>
          {heading}
          {controls}
          {sentence}
        </li>
      );
    case "rows":
      return (
        // The picture's column has its own width (a percentage of an auto column has nothing to resolve against).
        <li data-upgrade={attribute} className={`${card} grid grid-cols-[clamp(7rem,30%,15rem)_minmax(0,1fr)] content-center items-center gap-x-3 gap-y-1 p-1.5`}>
          <span className="relative col-start-1 row-span-3 row-start-1 block aspect-[2/1] w-full self-center">{drawing}</span>
          <span className="col-start-2 row-start-1 min-w-0">{heading}</span>
          <span className="col-start-2 row-start-2 min-w-0">{controls}</span>
          {props.showSentence ? <span className="col-start-2 row-start-3 min-w-0">{sentence}</span> : null}
        </li>
      );
    case "stacked":
      return (
        <li data-upgrade={attribute} className={`${card} flex flex-col gap-1.5 px-2 py-1.5`}>
          <span className="relative block min-h-24 w-full flex-1">{drawing}</span>
          <span className="flex min-w-0 shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 flex-[1_0_auto]">{heading}</span>
            <span className="ml-auto">{controls}</span>
          </span>
          {props.showSentence ? sentence : null}
        </li>
      );
    case "plain":
      return (
        <li data-upgrade={attribute} className={`${card} flex flex-col gap-1 px-2 py-1.5`}>
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="min-w-0 flex-[1_0_auto]">{heading}</span>
            <span className="ml-auto">{controls}</span>
          </span>
          {props.showSentence ? sentence : null}
        </li>
      );
  }
}

function HelpStep({ rules, onBack }: { readonly rules: RoundRules | null; onBack(): void }) {
  const m = useMessages();
  const u = m.prep.upgrades;
  return (
    <StepSheet title={u.helpTitle} onBack={onBack} action={<Button onClick={onBack}>{m.prep.rules.done}</Button>}>
      <div className="flex min-w-0 items-center gap-3">
        <UpgradeToken look="token" size={44} />
        <p className="min-w-0 text-lead">{u.helpTokens}</p>
      </div>
      <p>{u.helpCost}</p>
      <p>{rules === null ? u.helpDistanceSecret : u.helpDistance(rules.firstDistanceWithSkill)}</p>
    </StepSheet>
  );
}

export function UpgradesPane({ strategy, rules, problems, look, onChange, actions }: UpgradesPaneProps) {
  const m = useMessages();
  const [language] = useLanguage();
  const u = m.prep.upgrades;
  const { build } = strategy;
  const free = freePoints(build);
  const numbers = upgradeNumbers(rules, build);
  const [note, setNote] = useState<TrayNote>({ kind: "count" });
  const [undo, setUndo] = useState<StrategyInput | null>(null);
  const [help, setHelp] = useState(false);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  // Levels of a short pane: 1 drops the cards' sentences, 2 the secret-numbers line (the room's round rules line says
  // it too), 3 shows the tray's count only to a screen reader (the tray's cogs show it; a blocked tap's sentence
  // always shows), 4 turns a phone's cards into rows with a small drawing at the left, 5 drops the drawings, which
  // stay longest because they explain the upgrades without words. The tray, the sockets, minus and plus always stay,
  // and a card is never clipped (benchLayout).
  // The pane's own size, kept in state: the layout follows its width, the cogs its height, and a change of either
  // starts the fit levels again (passed as useFitDetail's content), so a resize never leaves a stale level behind.
  const [pane, setPane] = useState<{ readonly width: number; readonly height: number } | null>(null);
  useLayoutEffect(() => {
    if (root === null || typeof ResizeObserver === "undefined") return;
    const measure = () => setPane((old) => (old !== null && old.width === root.clientWidth && old.height === root.clientHeight ? old : { width: root.clientWidth, height: root.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);
  const detail = useFitDetail<HTMLDivElement>(BENCH_LEVELS, `${language}:${rules === null}:${note.kind}:${pane?.width ?? 0}x${pane?.height ?? 0}`);
  const fitRef = detail.ref;
  const rootRef = useCallback((element: HTMLDivElement | null) => {
    setRoot(element);
    fitRef(element);
  }, [fitRef]);
  useTokenFlight(root, build);
  const big = (pane?.height ?? 0) >= BIG_BENCH_MIN_PX;
  // The layout follows the pane's measured width. Container queries would add layout containment, which hides the
  // cards' overflow from useFitDetail, so the bench could clip a card without knowing it.
  const width = pane?.width ?? 0;
  const layout = benchLayout(width, detail.level);
  const threeInARow = layout === "columns";
  const roomyTop = width >= ROOMY_TOP_MIN_PX;
  const wordy = width >= WORDY_TOP_MIN_PX;
  // A tall, wide pane lets the bench grow to 72rem, so its three cards and drawings fill a laptop window.
  const wideBench = big && threeInARow ? "max-w-[72rem]" : "max-w-[60rem]";

  function change(next: StrategyInput): void {
    setNote({ kind: "count" });
    setUndo(null);
    onChange(next);
  }

  function tap(result: BenchTap, attribute: AttributeId): void {
    if (result.kind === "none") return;
    if (result.kind === "set") {
      playSound("tap");
      change(setBuildLevel(strategy, attribute, result.level));
      return;
    }
    setNote(result);
    if (motionAllowed()) trayRef.current?.animate([{ transform: "none" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" }, { transform: "translateX(-4px)" }, { transform: "translateX(2px)" }, { transform: "none" }], { duration: 380, easing: "ease-in-out" });
  }

  if (help) return <HelpStep rules={rules} onBack={() => setHelp(false)} />;

  const sentence = note.kind === "blocked" ? u.blocked(note.need, note.have) : free > 0 ? u.free(free) : u.allPlaced(BUILD_BUDGET);
  return (
    <div
      ref={rootRef}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 fit:overflow-hidden"

    >
      {/* The tray and its buttons on one line; the sentence beside them where the row is wide, under them where it is not. */}
      <div className={`mx-auto w-full min-w-0 shrink-0 ${wideBench}`}>
        <div className={`flex min-w-0 flex-wrap items-center gap-y-1 ${roomyTop ? "gap-x-3" : "gap-x-2"}`}>
          <div ref={trayRef} data-upgrade-tray="" role="group" aria-label={u.trayLabel}>
            <Tray free={free} cog={!roomyTop && width < 512 ? "small" : big ? "large" : "medium"} />
          </div>
          <p aria-live="polite" className={`${detail.level >= 3 && note.kind !== "blocked" ? "sr-only" : ""} min-w-0 font-semibold [overflow-wrap:anywhere] ${roomyTop ? "flex-1" : "order-last basis-full"} ${note.kind === "blocked" ? "text-warning" : ""}`}>
            {sentence}
          </p>
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {/* Words from a pane of 380 px; in a narrower pane the icon alone, with the same accessible name. */}
            {undo !== null ? (
              <Button
                variant="quiet"
                icon={<Undo2 aria-hidden size={20} />}
                aria-label={u.putBack}
                data-take-all-out=""
                className={wordy ? "" : "!min-w-11 !px-2"}
                onClick={() => {
                  onChange(undo);
                  setUndo(null);
                  setNote({ kind: "count" });
                }}
              >
                <span className={wordy ? "" : "sr-only"}>{u.putBack}</span>
              </Button>
            ) : pointsSpent(build) > 0 ? (
              <Button
                variant="quiet"
                icon={<PackageOpen aria-hidden size={20} />}
                aria-label={u.takeAllOut}
                data-take-all-out=""
                className={wordy ? "" : "!min-w-11 !px-2"}
                onClick={() => {
                  const before = strategy;
                  change(emptyBuild(strategy));
                  setUndo(before);
                }}
              >
                <span className={wordy ? "" : "sr-only"}>{u.takeAllOut}</span>
              </Button>
            ) : null}
            <IconButton label={u.help} icon={<CircleHelp aria-hidden size={22} />} variant="quiet" data-upgrade-help="" onClick={() => setHelp(true)} />
            {actions}
          </span>
        </div>
      </div>
      {rules === null && detail.level < 2 ? <p className={`mx-auto w-full shrink-0 text-caption text-muted ${wideBench}`}>{u.secret}</p> : null}
      <Problems problems={problems} />
      {/* The cards share the free height (each up to a cap), so the drawings grow with the window; without drawings they
          take only their own height. A row never shrinks below its card, so a pane too short for the cards overflows where
          useFitDetail sees it and takes the next level, instead of clipping a card. */}
      <div className={`mx-auto flex min-h-0 w-full min-w-0 flex-1 flex-col ${wideBench}`}>
        <ul
          className={`m-0 grid min-h-0 flex-1 list-none content-start p-0 ${
            layout === "columns"
              ? "grid-cols-3 grid-rows-[auto_auto_auto_auto] gap-x-3 gap-y-1.5"
              : layout === "stacked"
                ? "grid-rows-[repeat(3,minmax(auto,16rem))] gap-2"
                : "grid-rows-[repeat(3,auto)] gap-2"
          }`}
        >
          {ATTRIBUTE_IDS.map((attribute) => (
            <Card
              key={attribute}
              attribute={attribute}
              level={levelOf(build, attribute)}
              build={build}
              numbers={numbers}
              look={look}
              big={big}
              layout={layout}
              showSentence={detail.level < 1}
              tap={(result) => tap(result, attribute)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
