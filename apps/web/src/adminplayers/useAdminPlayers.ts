// The data of "/admin/players": GET /api/admin/players, and DELETE /api/admin/players/:seatId to
// take one tank out. The server answers 404 to anyone who is not an admin, so the page shows "not
// found" then, as for any unknown page.

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
    typeof value["seatId"] === "string" &&
    whole(value["league"], 1) &&
    (value["rank"] === null || whole(value["rank"], 1)) &&
    typeof value["name"] === "string" &&
    typeof value["score"] === "number" &&
    whole(value["countedDays"], 0) &&
    typeof value["gm"] === "boolean" &&
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

/**
 * Takes one tank out of the monthly arena. True when it is out, also when it had left already
 * (404 no_monthly_seat). A 404 without that code is the admin check: the session ended.
 */
/** PUT /api/admin/players/:seatId/gm. True when the server took it. */
export async function setAdminGameMaster(seatId: string, gm: boolean): Promise<boolean> {
  try {
    const response = await fetch(`/api/admin/players/${encodeURIComponent(seatId)}/gm`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gm }) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function removeAdminPlayer(seatId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/admin/players/${encodeURIComponent(seatId)}`, { method: "DELETE" });
    if (response.ok) return true;
    if (response.status !== 404) return false;
    const body: unknown = await response.json();
    return isRecord(body) && body["code"] === "no_monthly_seat";
  } catch {
    return false;
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
