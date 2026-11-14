// What happens next, in one sentence: a count of the seconds left when the server
// runs the next step by itself (a public arena), or who starts it otherwise.

import { useSecondsUntil } from "../live/countdown.ts";
import type { NextStep } from "../stream/streamState.ts";

export function NextStepLine({ step, counting, waiting, className = "" }: {
  step: NextStep | null;
  counting: (seconds: number) => string;
  waiting: string;
  className?: string;
}) {
  const seconds = useSecondsUntil(step?.at ?? null);
  return (
    <p className={`min-w-0 [overflow-wrap:anywhere] ${className}`}>
      {seconds === null ? waiting : counting(seconds)}
    </p>
  );
}
