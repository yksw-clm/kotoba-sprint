import {
  ALLOWED_ROUND_TIME_SECONDS,
  MAX_TARGET_SCORE,
  MIN_TARGET_SCORE,
} from "./constants";
import type { GameSettings, RoundTimeSeconds } from "./types";

export function isRoundTimeSeconds(value: unknown): value is RoundTimeSeconds {
  return (
    typeof value === "number" &&
    ALLOWED_ROUND_TIME_SECONDS.includes(value as RoundTimeSeconds)
  );
}

export function isValidTargetScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_TARGET_SCORE &&
    value <= MAX_TARGET_SCORE
  );
}

export function parseGameSettings(value: unknown): GameSettings | null {
  if (!isRecord(value)) return null;
  if (!isValidTargetScore(value.targetScore)) return null;
  if (!isRoundTimeSeconds(value.roundTimeSeconds)) return null;
  return {
    targetScore: value.targetScore,
    roundTimeSeconds: value.roundTimeSeconds,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
