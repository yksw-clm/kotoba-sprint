import { describe, expect, it } from "vitest";
import { parseGameSettings } from "./settings";

describe("game settings", () => {
  it("accepts target scores from 15 to 200 and fixed round times", () => {
    expect(parseGameSettings({ targetScore: 15, roundTimeSeconds: 15 })).toEqual({
      targetScore: 15,
      roundTimeSeconds: 15,
    });
    expect(parseGameSettings({ targetScore: 200, roundTimeSeconds: 60 })).toEqual({
      targetScore: 200,
      roundTimeSeconds: 60,
    });
  });

  it("rejects out-of-range scores, decimals, and unsupported round times", () => {
    expect(parseGameSettings({ targetScore: 14, roundTimeSeconds: 30 })).toBeNull();
    expect(parseGameSettings({ targetScore: 201, roundTimeSeconds: 30 })).toBeNull();
    expect(parseGameSettings({ targetScore: 30.5, roundTimeSeconds: 30 })).toBeNull();
    expect(parseGameSettings({ targetScore: 30, roundTimeSeconds: 45 })).toBeNull();
  });
});
