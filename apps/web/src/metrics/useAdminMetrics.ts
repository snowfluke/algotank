// The data of "/admin/metrics": GET /api/admin/metrics (the last 30 days). The server answers 404
// to anyone who is not an admin, so the page shows "not found" then, as for any unknown page.

import { useCallback, useEffect, useState } from "react";
import { isCounterKey, type AdminMetricsResponse, type MetricsDay } from "@game/arena";

export type AdminMetricsLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "notFound" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly data: AdminMetricsResponse };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMetricsDay(value: unknown): value is MetricsDay {
  if (!isRecord(value) || typeof value["day"] !== "string" || !DAY.test(value["day"]) || !isRecord(value["counts"])) return false;
  // A key from a newer server is allowed; the page shows only the keys it knows.
  return Object.entries(value["counts"]).every(([key, n]) => !isCounterKey(key) || (typeof n === "number" && Number.isFinite(n) && n >= 0));
}

export function isAdminMetricsResponse(value: unknown): value is AdminMetricsResponse {
  return isRecord(value) && typeof value["timeZone"] === "string" && typeof value["today"] === "string" && Array.isArray(value["days"]) && value["days"].every(isMetricsDay);
}

async function load(): Promise<AdminMetricsLoad> {
  let response: Response;
  try {
    response = await fetch("/api/admin/metrics");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) return { kind: "notFound" };
  if (!response.ok) return { kind: "failed" };
  try {
    const body: unknown = await response.json();
    return isAdminMetricsResponse(body) ? { kind: "ready", data: body } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

export function useAdminMetrics(): { readonly load: AdminMetricsLoad; retry(): void } {
  const [state, setState] = useState<AdminMetricsLoad>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ kind: "loading" });
    void load().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { load: state, retry };
}
