import { describe, expect, it } from "vitest";
import {
  countHiraganaChars,
  isHiraganaWord,
  isStructurallyValidAnswer,
  normalizeAnswer,
  randomWordLength,
} from "./rules";
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH } from "./constants";

describe("word rules", () => {
  it("counts small hiragana as one displayed character", () => {
    expect(countHiraganaChars("きゃべつ")).toBe(4);
    expect(countHiraganaChars("しゅくだい")).toBe(5);
  });

  it("normalizes whitespace, width, and katakana", () => {
    expect(normalizeAnswer(" カ ザリ ")).toBe("かざり");
    expect(normalizeAnswer("ｶﾀｶﾅ")).toBe("かたかな");
  });

  it("allows hiragana and rejects long vowel marks", () => {
    expect(isHiraganaWord("かざり")).toBe(true);
    expect(isHiraganaWord("ちょこれーと")).toBe(false);
  });

  it("checks start, end, and length structurally", () => {
    expect(
      isStructurallyValidAnswer({
        word: "かざり",
        startChar: "か",
        endChar: "り",
        length: 3,
      }),
    ).toBe(true);
    expect(
      isStructurallyValidAnswer({
        word: "かざり",
        startChar: "か",
        endChar: "り",
        length: 4,
      }),
    ).toBe(false);
  });

  it("generates word lengths in the configured range", () => {
    for (let i = 0; i < 100; i += 1) {
      const length = randomWordLength();
      expect(length).toBeGreaterThanOrEqual(MIN_WORD_LENGTH);
      expect(length).toBeLessThanOrEqual(MAX_WORD_LENGTH);
    }
  });
});
