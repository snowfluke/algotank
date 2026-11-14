// "/new/private" and "/new/presenter". A signed-out visitor sees the sign-in step
// first, on this page; then the form: a name, the number of tanks with the bots switch, and a "More options"
// row that names the chosen options and opens them as a StepSheet (speed and round
// length there, round rules one step further). A private arena opens in
// the arena room, a presenter arena on the presenter page. An account owns one open
// arena, so an existing one turns the form's action into "Open it" and "Close it and
// create".
//
// No scroll: the form leaves out optional text when the pane is short (useFitDetail):
// first the intro, then the banner's second sentence, then the options summary, then the
// presets of the number of tanks (minus and plus stay), and last the space between the rows
// (the open-arena banner on a small phone needs that).

import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { useRef, useState, type FormEvent, type Ref } from "react";
import { ARENA_LIMITS, JOIN_POLICIES, RULE_SET_MODES, tankCountRange } from "@game/arena";
import { closeArena, createArena } from "../api/client.ts";
import { describeError, type ErrorView } from "../api/errorSentences.ts";
import { navigate } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import { markSignedOut, refreshAccount, refreshOwnArena, useAccount, type OwnArena } from "../auth/accountStore.ts";
import { ownArenaPath } from "../auth/AccountMenu.tsx";
import { canSendEmail, cannotSendEmail, useMailCapability } from "../auth/mailCapability.ts";
import { SignInForm } from "../auth/SignInForm.tsx";
import { useFormat, useLanguage, useMessages } from "../i18n/I18nProvider.tsx";
import { BotsSwitch } from "../room/BotsSwitch.tsx";
import { TankCountControl } from "../room/TankCountControl.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { Button, LinkButton } from "../ui/Button.tsx";
import { ChoiceGroup } from "../ui/ChoiceGroup.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { TextInput } from "../ui/Field.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { StatusBanner } from "../ui/StatusBanner.tsx";
import { StepSheet } from "../ui/StepSheet.tsx";
import { useFitDetail } from "../ui/useFitDetail.ts";
import {
  createRequest,
  defaultValues,
  GAME_SPEED_IDS,
  ROUND_LENGTH_IDS,
  ROUND_LENGTHS,
  type CreatableKind,
  type CreateFormValues,
} from "./createRequest.ts";

type NameProblem = "empty" | "tooLong";

function nameProblem(name: string): NameProblem | null {
  const trimmed = name.trim();
  if (trimmed === "") return "empty";
  return trimmed.length > ARENA_LIMITS.arenaNameMax ? "tooLong" : null;
}

/** Which view the signed-in pane shows: the form, the options step, or the round rules' own step. */
type View = { readonly kind: "form" } | { readonly kind: "options" } | { readonly kind: "ruleSetMode" } | { readonly kind: "joinPolicy" };

/** Level 0 shows everything; each level leaves out one more optional text (see the file comment). */
const DETAIL_LEVELS = 6;

function Heading({ kind, intro }: { readonly kind: CreatableKind; readonly intro: string | null }) {
  const c = useMessages().create;
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-heading">{c.heading[kind]}</h1>
      {intro === null ? null : <p className="text-lead text-muted">{intro}</p>}
    </div>
  );
}

function OptionRow({
  option,
  title,
  value,
  onOpen,
  ref,
}: {
  readonly option: string;
  readonly title: string;
  readonly value: string;
  readonly onOpen: () => void;
  readonly ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-create-option={option}
      onClick={onOpen}
      className="press flex min-h-14 w-full min-w-0 items-center gap-3 rounded-[var(--radius-control)] border-2 border-b-4 border-line bg-panel px-4 py-2 text-left hover:border-line-strong"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-muted">{value}</span>
      </span>
      <ChevronRight aria-hidden size={22} className="shrink-0 text-muted" />
    </button>
  );
}

function OptionsSheet({
  values,
  change,
  onOpenRuleSetMode,
  onBack,
}: {
  readonly values: CreateFormValues;
  readonly change: (next: Partial<CreateFormValues>) => void;
  readonly onOpenRuleSetMode: () => void;
  readonly onBack: () => void;
}) {
  const m = useMessages();
  const c = m.create;
  return (
    <StepSheet
      title={m.common.moreOptions}
      onBack={onBack}
      action={
        <Button variant="secondary" onClick={onBack} className="w-full fit:w-auto">
          {c.optionsDone}
        </Button>
      }
    >
      <SegmentedControl
        legend={c.speed}
        options={GAME_SPEED_IDS.map((value) => ({ value, label: c.speeds[value] }))}
        value={values.speed}
        onChange={(speed) => change({ speed })}
      />
      <SegmentedControl
        legend={c.length}
        options={ROUND_LENGTH_IDS.map((value) => ({ value, label: c.lengthLabel(ROUND_LENGTHS[value]) }))}
        value={values.length}
        onChange={(length) => change({ length })}
      />
      <OptionRow option="ruleSetMode" title={c.ruleSetMode} value={c.ruleSetModes[values.ruleSetMode].title} onOpen={onOpenRuleSetMode} />
    </StepSheet>
  );
}

function RuleSetModeSheet({
  values,
  change,
  onBack,
}: {
  readonly values: CreateFormValues;
  readonly change: (next: Partial<CreateFormValues>) => void;
  readonly onBack: () => void;
}) {
  const m = useMessages();
  const c = m.create;
  const done = (
    <Button variant="secondary" onClick={onBack} className="w-full fit:w-auto">
      {c.optionsDone}
    </Button>
  );
  return (
    <StepSheet title={c.ruleSetMode} backLabel={m.common.moreOptions} onBack={onBack} action={done}>
      <ChoiceGroup
        legend={c.ruleSetMode}
        hideLegend
        choices={RULE_SET_MODES.map((value) => ({ value, ...c.ruleSetModes[value] }))}
        value={values.ruleSetMode}
        onChange={(ruleSetMode) => change({ ruleSetMode })}
      />
    </StepSheet>
  );
}

/**
 * "Who can join": anyone, players with an account, or players with a verified email (ArenaSettings.joinPolicy).
 * "Verified" needs a server that sends email, so without one it is disabled and its sentence says why
 * (until the server answers, it is disabled with its usual sentence).
 */
function JoinPolicySheet({
  values,
  change,
  onBack,
}: {
  readonly values: CreateFormValues;
  readonly change: (next: Partial<CreateFormValues>) => void;
  readonly onBack: () => void;
}) {
  const c = useMessages().create;
  const mail = useMailCapability();
  const choices = JOIN_POLICIES.map((value) => {
    if (value !== "verified" || canSendEmail(mail)) return { value, ...c.joinPolicies[value] };
    return { value, ...c.joinPolicies[value], disabled: true, ...(cannotSendEmail(mail) ? { description: c.verifiedNeedsMail } : {}) };
  });
  return (
    <StepSheet
      title={c.whoCanJoin}
      onBack={onBack}
      action={
        <Button variant="secondary" onClick={onBack} className="w-full fit:w-auto">
          {c.optionsDone}
        </Button>
      }
    >
      <ChoiceGroup
        legend={c.whoCanJoin}
        hideLegend
        choices={choices}
        value={values.joinPolicy}
        onChange={(joinPolicy) => change({ joinPolicy })}
      />
    </StepSheet>
  );
}

function CreateFlow({ kind, owned }: { readonly kind: CreatableKind; readonly owned: OwnArena }) {
  const m = useMessages();
  const c = m.create;
  const f = useFormat();
  const [language] = useLanguage();
  const [values, setValues] = useState<CreateFormValues>(() => defaultValues(kind, c.defaultName[kind]));
  const [view, setView] = useState<View>({ kind: "form" });
  const [triedName, setTriedName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<ErrorView | null>(null);
  const optionsButton = useRef<HTMLButtonElement | null>(null);
  const joinButton = useRef<HTMLButtonElement | null>(null);
  const change = (next: Partial<CreateFormValues>) => setValues((current) => ({ ...current, ...next }));
  const problem = nameProblem(values.name);
  const { ref, level } = useFitDetail<HTMLFormElement>(DETAIL_LEVELS, `${language}|${owned?.id ?? ""}|${triedName && problem !== null}|${error?.sentence ?? ""}`);

  async function create(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await createArena(createRequest(values));
    setBusy(false);
    if (!result.ok) {
      if (result.code === "not_signed_in") markSignedOut();
      // The form names the open arena, so the store learns which one it is.
      if (result.code === "arena_limit") refreshOwnArena();
      else setError(describeError(result, "create", m.errors));
      return;
    }
    refreshOwnArena();
    navigate(kind === "private" ? paths.player(result.data.arenaId) : paths.host(result.data.arenaId));
  }

  async function closeOwnedAndCreate(arena: NonNullable<OwnArena>): Promise<void> {
    setError(null);
    setBusy(true);
    const closed = await closeArena(arena.id);
    setBusy(false);
    if (!closed.ok) {
      setError(describeError(closed, "close", m.errors));
      return;
    }
    await create();
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setTriedName(true);
    if (problem !== null) return;
    if (owned !== null) {
      setAsking(true);
      return;
    }
    void create();
  }

  function backToForm(): void {
    setView({ kind: "form" });
    // The row is rendered again after the sheet closes, so focus moves once it exists.
    requestAnimationFrame(() => optionsButton.current?.focus());
  }

  if (view.kind === "options") {
    return <OptionsSheet values={values} change={change} onOpenRuleSetMode={() => setView({ kind: "ruleSetMode" })} onBack={backToForm} />;
  }
  if (view.kind === "joinPolicy") {
    return (
      <JoinPolicySheet
        values={values}
        change={change}
        onBack={() => {
          setView({ kind: "form" });
          requestAnimationFrame(() => joinButton.current?.focus());
        }}
      />
    );
  }
  if (view.kind === "ruleSetMode") {
    return <RuleSetModeSheet values={values} change={change} onBack={() => setView({ kind: "options" })} />;
  }

  const ownedName = owned === null ? "" : owned.name === "" ? owned.id : owned.name;
  const summaryParts = [c.short.speeds[values.speed], c.short.length(ROUND_LENGTHS[values.length]), c.short.ruleSetModes[values.ruleSetMode]];

  return (
    <form ref={ref} data-create-form="" className={`flex min-h-0 flex-1 flex-col ${level >= 5 ? "gap-2" : "gap-4"} fit:justify-center-safe fit:overflow-hidden`} noValidate onSubmit={submit}>
      <Heading kind={kind} intro={level >= 1 ? null : c.intro[kind]} />
      {owned === null ? null : (
        <div data-limit-banner="">
          <StatusBanner tone="warning" title={c.limit.title(ownedName)} {...(level >= 2 ? {} : { body: c.limit.body })} />
        </div>
      )}
      <TextInput
        label={c.name}
        value={values.name}
        maxLength={ARENA_LIMITS.arenaNameMax}
        autoComplete="off"
        onChange={(event) => change({ name: event.currentTarget.value })}
        error={triedName && problem !== null ? (problem === "empty" ? c.nameEmpty : c.nameTooLong) : null}
      />
      <TankCountControl kind={kind} value={values.tankCount} min={tankCountRange(kind).min} onChange={(tankCount) => change({ tankCount })} brief={level >= 4} />
      <BotsSwitch on={values.botFill} tanks={values.tankCount} onChange={(botFill) => change({ botFill })} />
      <OptionRow ref={joinButton} option="joinPolicy" title={c.whoCanJoin} value={c.joinPolicies[values.joinPolicy].title} onOpen={() => setView({ kind: "joinPolicy" })} />
      <button
        ref={optionsButton}
        type="button"
        data-create-options=""
        onClick={() => setView({ kind: "options" })}
        className="press flex min-h-12 w-full min-w-0 items-center gap-3 rounded-[var(--radius-control)] px-1 text-left"
      >
        <SlidersHorizontal aria-hidden size={22} className="shrink-0 text-water" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display font-semibold text-water">{m.common.moreOptions}</span>
          {level >= 3 ? null : <span className="text-caption text-muted">{c.summary(f.list(summaryParts))}</span>}
        </span>
        <ChevronRight aria-hidden size={22} className="shrink-0 text-water" />
      </button>
      {error === null ? null : <StatusBanner tone="danger" title={error.sentence} {...(error.details.length > 0 ? { body: error.details.join(" ") } : {})} />}
      {owned === null ? (
        <Button type="submit" size="lg" loading={busy} className="w-full fit:w-auto fit:self-start">
          {c.submit[kind]}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <LinkButton href={ownArenaPath(owned)}>{c.limit.open}</LinkButton>
          <Button type="submit" variant="danger" loading={busy} data-limit-close="">
            {c.limit.close}
          </Button>
        </div>
      )}
      {owned === null ? null : (
        <Dialog
          open={asking}
          title={c.limit.dialogTitle(ownedName)}
          body={c.limit.dialogBody}
          confirmLabel={c.limit.dialogConfirm}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            void closeOwnedAndCreate(owned);
          }}
        />
      )}
    </form>
  );
}

export function CreateArenaPage({ kind }: { readonly kind: CreatableKind }) {
  const m = useMessages();
  const c = m.create;
  const [language] = useLanguage();
  const account = useAccount();
  const signedIn = account.kind === "signedIn";
  // Signed out, a short window leaves out the intro, because the sign-in tabs say what to do,
  // then the sentence on why an account is needed.
  const { ref, level } = useFitDetail<HTMLDivElement>(3, `${language}|${account.kind}`);
  return (
    <AppShell width="narrow" align={signedIn ? "start" : "center"}>
      {signedIn ? (
        // The form stays mounted while the own arena loads again (after arena_limit), so typed values stay.
        // A failed look-up does not block it: the server answers arena_limit if there is an open arena.
        <CreateFlow kind={kind} owned={account.own.kind === "ready" ? account.own.arena : null} />
      ) : (
        <div ref={ref} className="flex min-h-0 flex-col gap-4 fit:overflow-hidden">
          <Heading kind={kind} intro={level >= 1 ? null : account.kind === "signedOut" ? c.signInIntro : c.intro[kind]} />
          {account.kind === "unknown" ? (
            <p role="status" className="animate-pulse-soft text-muted">
              {c.checkingAccount}
            </p>
          ) : null}
          {account.kind === "unreachable" ? (
            <StatusBanner
              tone="danger"
              title={c.accountUnreachable}
              action={
                <Button variant="secondary" onClick={() => void refreshAccount()}>
                  {c.tryAgain}
                </Button>
              }
            />
          ) : null}
          {account.kind === "signedOut" ? <SignInForm brief={level >= 2} onSignedIn={() => undefined} /> : null}
        </div>
      )}
    </AppShell>
  );
}
