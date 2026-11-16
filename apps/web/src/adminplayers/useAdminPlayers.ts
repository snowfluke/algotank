// The data of "/admin/players": GET /api/admin/players. The server answers 404 to anyone who is not
// an admin, so the page shows "not found" then, as for any unknown page.

import { useCallback, useEffect, useState } from "react";
import type { AdminPlayer, AdminPlayersResponse } from "@game/arena";

export type AdminPlayersLoad =
  | { readonly kind: "loading" }
  | { readonly kind: "notFound" }
  | { readonly kind: "failed" }
  | { readonly kind: "ready"; readonly data: AdminPlayersResponse };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const whole = (value: unknown, min: number): value is number => typeof value === "number" && Number.isInteger(value) && value >= min;

function isAccount(value: unknown): value is AdminPlayer["account"] {
  if (value === null) return true;
  return isRecord(value) && typeof value["email"] === "string" && typeof value["emailVerified"] === "boolean" && typeof value["createdAt"] === "string";
}

function isAdminPlayer(value: unknown): value is AdminPlayer {
  return (
    isRecord(value) &&
    whole(value["league"], 1) &&
    (value["rank"] === null || whole(value["rank"], 1)) &&
    typeof value["name"] === "string" &&
    typeof value["score"] === "number" &&
    whole(value["countedDays"], 0) &&
    isAccount(value["account"])
  );
}

export function isAdminPlayersResponse(value: unknown): value is AdminPlayersResponse {
  return isRecord(value) && typeof value["month"] === "string" && typeof value["day"] === "string" && Array.isArray(value["players"]) && value["players"].every(isAdminPlayer);
}

async function load(): Promise<AdminPlayersLoad> {
  let response: Response;
  try {
    response = await fetch("/api/admin/players");
  } catch {
    return { kind: "failed" };
  }
  if (response.status === 404) return { kind: "notFound" };
  if (!response.ok) return { kind: "failed" };
  try {
    const body: unknown = await response.json();
    return isAdminPlayersResponse(body) ? { kind: "ready", data: body } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

export function useAdminPlayers(): { readonly load: AdminPlayersLoad; retry(): void } {
  const [state, setState] = useState<AdminPlayersLoad>({ kind: "loading" });
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
