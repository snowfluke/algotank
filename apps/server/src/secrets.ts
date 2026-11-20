// Random identifiers and secret comparison. Every value here comes from the
// operating system's random source, never from Math.random.

import { createHash, randomBytes, randomFillSync, randomInt, timingSafeEqual } from "node:crypto";
import { ARENA_CODE_ALPHABET, ARENA_CODE_LENGTH } from "@game/arena";
import { rngFrom, type Rng } from "@game/engine";

// The code shape lives in @game/arena, so the web reads typed codes the same way.
// The largest multiple of the alphabet length that fits in a byte. Bytes at or
// above it are skipped, so every character has the same chance.
const ARENA_CODE_BYTE_LIMIT = Math.floor(256 / ARENA_CODE_ALPHABET.length) * ARENA_CODE_ALPHABET.length;

export function newArenaCode(): string {
  let code = "";
  while (code.length < ARENA_CODE_LENGTH) {
    for (const byte of randomBytes(ARENA_CODE_LENGTH * 2)) {
      if (byte < ARENA_CODE_BYTE_LIMIT && code.length < ARENA_CODE_LENGTH) {
        code += ARENA_CODE_ALPHABET.charAt(byte % ARENA_CODE_ALPHABET.length);
      }
    }
  }
  return code;
}

/** 192 random bits. Used for player tokens. */
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** 48 random bits. Player ids are public, so they are short. */
export function newPlayerId(): string {
  return `p${randomBytes(6).toString("hex")}`;
}

/** Another prefix than newPlayerId, so a bot id can never equal a player id. */
export function newBotId(): string {
  return `b${randomBytes(6).toString("hex")}`;
}

/** A 32-bit round seed. */
export function newSeed(): number {
  return randomInt(0x1_0000_0000);
}

/**
 * Compares two secrets without leaking where they differ or how long they are.
 * Both sides are hashed first, because timingSafeEqual needs equal lengths.
 */
export function safeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

/** 48 random bits. A chat message's id only has to be unique in its arena's 500 messages. */
export function newChatMessageId(): string {
  return `m${randomBytes(6).toString("hex")}`;
}

// The monthly league's draws (2026-11-20, before the source went public). Its players change their rules while a day
// plays, so a draw anyone could foresee would be worth acting on: a 32-bit round seed can be found by trying every
// value against the public board, and Math.random's state can be worked out from enough of its outputs. These come
// straight from the operating system, so a copy of the game and of the live state still cannot tell the next draw.
// 2,048 words per refill, because one randomInt call per draw costs about 30 times more (378 ms per million on Bun 1.4).
const pool = new Uint32Array(2048);
let poolAt = pool.length;

/** A uniform number in [0, 1) with 53 random bits, from the operating system's random source. */
export function secureRandom(): number {
  if (poolAt + 2 > pool.length) {
    randomFillSync(pool);
    poolAt = 0;
  }
  const high = (pool[poolAt++] ?? 0) >>> 5;
  const low = (pool[poolAt++] ?? 0) >>> 6;
  return (high * 67_108_864 + low) / 9_007_199_254_740_992;
}

/** A round's draws from the operating system's random source (a monthly day round). */
export function secureRng(): Rng {
  return rngFrom(secureRandom);
}
