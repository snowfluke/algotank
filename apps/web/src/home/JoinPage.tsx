// "/join": one field for the arena code and one button. The code is checked with
// the server before the player page opens, so a typo gets a sentence here
// instead of an empty arena page.

import { useState, type FormEvent } from "react";
import { getArena } from "../api/client.ts";
import { navigate } from "../app/navigation.ts";
import { paths } from "../app/route.ts";
import type { Catalog } from "../i18n/catalog.ts";
import { useMessages } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/Button.tsx";
import { TextInput } from "../ui/Field.tsx";
import { AppShell } from "../ui/AppShell.tsx";
import { JoinArt } from "./EntryArt.tsx";
import { readArenaCode } from "./arenaCode.ts";
type JoinMessages = Catalog["home"]["join"];

type JoinState =
  | { readonly kind: "editing"; readonly problem: JoinProblem | null }
  | { readonly kind: "checking" };

type JoinProblem =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid" }
  | { readonly kind: "notFound"; readonly code: string }
  | { readonly kind: "network" }
  | { readonly kind: "other" };

/** The sentence for a problem, in the current language. */
export function joinProblemSentence(problem: JoinProblem, m: JoinMessages): string {
  switch (problem.kind) {
    case "empty":
      return m.empty;
    case "invalid":
      return m.invalid;
    case "notFound":
      return m.notFound(problem.code);
    case "network":
      return m.network;
    case "other":
      return m.other;
  }
}

export function JoinPage() {
  const m = useMessages();
  const [text, setText] = useState("");
  const [state, setState] = useState<JoinState>({ kind: "editing", problem: null });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const reading = readArenaCode(text);
    if (reading.kind !== "code") {
      setState({ kind: "editing", problem: { kind: reading.kind } });
      return;
    }
    setState({ kind: "checking" });
    const result = await getArena(reading.code);
    if (result.ok) {
      navigate(paths.player(reading.code));
      return;
    }
    const problem: JoinProblem =
      result.status === 404
        ? { kind: "notFound", code: reading.code }
        : result.status === 0
          ? { kind: "network" }
          : { kind: "other" };
    setState({ kind: "editing", problem });
  }

  const problem = state.kind === "editing" ? state.problem : null;
  return (
    <AppShell width="narrow" align="center">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="size-16">
            <JoinArt />
          </span>
          <h1 className="text-heading">{m.home.join.heading}</h1>
          <p className="text-lead text-muted">{m.home.join.intro}</p>
        </div>
        <form className="flex flex-col gap-4" noValidate onSubmit={(event) => void submit(event)}>
          <TextInput
            label={m.home.join.label}
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            error={problem === null ? null : joinProblemSentence(problem, m.home.join)}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            display="code"
          />
          <Button type="submit" size="lg" loading={state.kind === "checking"} className="w-full sm:w-auto sm:self-start">
            {state.kind === "checking" ? m.home.join.checking : m.home.join.submit}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
