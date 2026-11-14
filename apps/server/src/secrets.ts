// Random identifiers and secret comparison. Every value here comes from the
// operating system's random source, never from Math.random.

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ARENA_CODE_ALPHABET, ARENA_CODE_LENGTH } from "@game/arena";

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
