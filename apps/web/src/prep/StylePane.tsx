// The arena's Play style tab: the built-in styles, and "Mine" (the play styles the
// player built in the tank workshop) behind a switch that shows only when the player
// has some. Choosing either applies it and saves it at once. When the tank played by
// hand-made rules, a toast offers Undo instead of asking first. Loading one of mine
// copies it: later edits in the arena do not change the saved one. The choice is
// remembered on the device, so the next new seat starts with it (prep/lastStyle.ts). A style
// the room gives the tank after the pane opened is followed: one of mine opens the Mine view,
// a built-in one turns the cards to it.

import { CircleCheck, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StrategyInput } from "@game/engine";
import { paths } from "../app/route.ts";
import { playStyleOf, sameStrategy } from "@game/engine";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { playSound } from "../sound/player.ts";
import { TankBadge } from "../tank/TankBadge.tsx";
import type { TankLook } from "../tank/look.ts";
import { Button, LinkButton } from "../ui/Button.tsx";
import { Pager } from "../ui/Pager.tsx";
import { useToast } from "../ui/Toast.tsx";
import { isLoadable, type MyPlayStyle } from "../workshop/library.ts";
import { useLibrary } from "../workshop/useLibrary.ts";
import { BuiltInStyles, styleIndex } from "./BuiltInStyles.tsx";
import { rememberLastStyle, type LastStyle } from "./lastStyle.ts";
import { Traits } from "./Traits.tsx";
import { PaneSwitch } from "./PaneSwitch.tsx";
import { currentPlayStyle, traitsOf } from "./playStyles.ts";

export interface StylePaneProps {
  readonly strategy: StrategyInput;
  readonly look: TankLook;
  readonly nowMs?: number | undefined;
  readonly wide: boolean;
  onChange(next: StrategyInput): void;
  /** Saves without the usual wait after an edit: choosing a style is one complete action. */
  onSaveNow(): void;
}

type Source = "builtIn" | "mine";

/** The saved play style the strategy still is, or null once the player changed it. */
export function matchingSaved(strategy: StrategyInput, styles: readonly MyPlayStyle[]): MyPlayStyle | null {
  return styles.find((style) => sameStrategy(style.strategy, strategy)) ?? null;
}

function MineRow({ style, chosen, look, nowMs, onUse }: { readonly style: MyPlayStyle; readonly chosen: boolean; readonly look: TankLook; readonly nowMs: number | undefined; onUse(): void }) {
  const m = useMessages();
  const s = m.prep.style;
  const loadable = isLoadable(style);
  const traits = loadable ? traitsOf(style.strategy) : [];
  return (
    <div className={`flex min-w-0 flex-col gap-2 rounded-[var(--radius-card)] border-2 border-b-4 p-3 ${chosen ? "border-water bg-water-soft" : "border-line bg-panel"}`}>
      <div className="flex min-w-0 items-start gap-3">
        <TankBadge look={look} size={32} name={null} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-display text-lead font-semibold">{style.name}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          {loadable ? <Traits traits={traits} ultimate={style.strategy.ultimate} nowMs={nowMs} /> : <p className="text-caption font-semibold text-hit [overflow-wrap:anywhere]">{s.cannotLoad}</p>}
        </div>
      {chosen ? (
        <span className="flex shrink-0 items-center gap-1 text-caption font-semibold text-water">
          <CircleCheck aria-hidden size={18} strokeWidth={2.5} />
          {s.chosen}
        </span>
      ) : loadable ? (
        <Button variant="secondary" className="shrink-0" aria-label={`${s.use}: ${style.name}`} onClick={onUse}>
          {s.useShort}
        </Button>
      ) : null}
      </div>
    </div>
  );
}

export function StylePane({ strategy, look, wide, nowMs, onChange, onSaveNow }: StylePaneProps) {
  const m = useMessages();
  const s = m.prep.style;
  const toast = useToast();
  const library = useLibrary();
  const current = currentPlayStyle(strategy);
  const saved = current === null ? matchingSaved(strategy, library.styles) : null;
  const [source, setSource] = useState<Source>(saved === null ? "builtIn" : "mine");
  const [index, setIndex] = useState(() => styleIndex(current));
  // Undo must put back the hand-made strategy even after later renders.
  const before = useRef<StrategyInput | null>(null);
  const hasMine = library.styles.length > 0;
  const shown: Source = hasMine ? source : "builtIn";
  // A style given from outside after the pane opened (the room applies "Play now with it" or the style used last
  // once the strategy loads) shows where the player finds it: one of mine opens the Mine view, a built-in one turns
  // the cards to it. A built-in style never switches the view, because a saved copy of one, used from Mine, stays there.
  const given = current !== null ? `builtIn:${current}` : saved !== null ? `mine:${saved.id}` : null;
  useEffect(() => {
    if (current !== null) setIndex(styleIndex(current));
    else if (saved !== null) setSource("mine");
    // Follows only a change of the style the tank plays as, so the player's own switch between the views stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [given]);

  function apply(next: StrategyInput, name: string, used: LastStyle): void {
    playSound("tap");
    rememberLastStyle(used);
    if (sameStrategy(next, strategy)) return;
    if (current === null) {
      before.current = strategy;
      toast.show({
        message: s.changed(name),
        onUndo: () => {
          if (before.current === null) return;
          onChange(before.current);
          onSaveNow();
        },
      });
    }
    onChange(next);
    onSaveNow();
  }

  // One line: the toast that offers Undo says the rest when a style replaces own rules. Under a built-in style, with
  // any ultimate, the line nudges toward own rules (owner, 2026-11-21): that tank plays with the worst handicap
  // (handicapTierOf in the engine's strategy/built-in.ts), which no screen names.
  const status = saved !== null ? s.fromMine(saved.name) : playStyleOf(strategy) === null ? s.ownRules : s.builtInHint;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      {hasMine ? (
        // data-coach: the lobby tour's step about the play style choice (guide/tours.ts).
        <div data-coach="style-source" className="shrink-0">
          <PaneSwitch
            legend={s.sourceLegend}
            hook="style-source"
            options={[
              { value: "builtIn", label: s.builtIn },
              { value: "mine", label: s.mine },
            ]}
            value={shown}
            onChange={setSource}
          />
        </div>
      ) : (
        <div data-coach="style-source" className="shrink-0">
          <LinkButton href={paths.workshop()} variant="quiet" icon={<Wrench aria-hidden size={20} />}>
            {s.noneYet}
          </LinkButton>
        </div>
      )}
      {status === null ? null : <p className="shrink-0 font-semibold [overflow-wrap:anywhere]">{status}</p>}
      {shown === "builtIn" ? (
        <BuiltInStyles
          chosen={current}
          look={look}
          wide={wide}
          nowMs={nowMs}
          index={index}
          onIndexChange={setIndex}
          actionLabel={s.use}
          onChoose={(style) => apply(style.strategy, m.vocabulary.playStyles[style.id].name, { kind: "builtIn", id: style.id })}
        />
      ) : (
        <Pager
          label={s.mineLabel}
          items={library.styles}
          itemKey={(style) => style.id}
          ordered={false}
          // Each row compares itself, so a saved copy of a built-in style is marked too.
          renderItem={(style) => <MineRow style={style} chosen={sameStrategy(style.strategy, strategy)} look={look} nowMs={nowMs} onUse={() => apply(style.strategy, style.name, { kind: "mine", id: style.id })} />}
        />
      )}
    </div>
  );
}
