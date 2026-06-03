import { describe, expect, it } from "vitest";
import { HIRAGANA_BASE } from "./constants";
import {
  countHiraganaChars,
  END_HIRAGANA_WEIGHTS,
  isHiraganaWord,
  isLastCharMatch,
  isStructurallyValidAnswer,
  normalizeAnswer,
} from "./rules";

describe("word rules", () => {
  it("counts small hiragana as one displayed character", () => {
    expect(countHiraganaChars("きゃべつ")).toBe(4);
    expect(countHiraganaChars("しゅくだい")).toBe(5);
  });

  it("normalizes whitespace, width, and katakana", () => {
    expect(normalizeAnswer(" カ ザリ ")).toBe("かざり");
    expect(normalizeAnswer("ｶﾀｶﾅ")).toBe("かたかな");
  });

  it("allows hiragana and long vowel marks", () => {
    expect(isHiraganaWord("かざり")).toBe(true);
    expect(isHiraganaWord("ちょこれーと")).toBe(true);
    expect(countHiraganaChars("ちょこれーと")).toBe(6);
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

  it("can validate answers without a fixed target length", () => {
    expect(
      isStructurallyValidAnswer({
        word: "しごとの",
        startChar: "し",
        endChar: "の",
      }),
    ).toBe(true);
  });

  it("can validate answers containing a long vowel mark", () => {
    expect(
      isStructurallyValidAnswer({
        word: "かれーた",
        startChar: "か",
        endChar: "た",
      }),
    ).toBe(true);
  });

  it("allows small hiragana variants for the final condition character", () => {
    expect(isLastCharMatch("ゆ", "ゅ")).toBe(true);
    expect(isLastCharMatch("つ", "っ")).toBe(true);
    expect(isLastCharMatch("あ", "ぁ")).toBe(true);
    expect(isLastCharMatch("わ", "ゎ")).toBe(true);
    expect(isLastCharMatch("ゆ", "ゃ")).toBe(false);
  });

  it("allows long vowel marks after the final condition character", () => {
    expect(isLastCharMatch("ら", "ー", "ら")).toBe(true);
    expect(isLastCharMatch("ゆ", "ー", "ゆ")).toBe(true);
    expect(isLastCharMatch("ん", "ー", "ん")).toBe(true);
    expect(isLastCharMatch("ら", "ー", "り")).toBe(false);
  });

  it("accepts words that end with the small variant of the final condition", () => {
    expect(
      isStructurallyValidAnswer({
        word: "すかっしゅ",
        startChar: "す",
        endChar: "ゆ",
      }),
    ).toBe(true);
    expect(
      isStructurallyValidAnswer({
        word: "すらっしゅ",
        startChar: "す",
        endChar: "ゆ",
      }),
    ).toBe(true);
  });

  it("accepts words that end with the final condition followed by a long vowel mark", () => {
    expect(
      isStructurallyValidAnswer({
        word: "かばん",
        startChar: "か",
        endChar: "ん",
      }),
    ).toBe(true);
    expect(
      isStructurallyValidAnswer({
        word: "からー",
        startChar: "か",
        endChar: "ら",
      }),
    ).toBe(true);
    expect(
      isStructurallyValidAnswer({
        word: "かばんー",
        startChar: "か",
        endChar: "ん",
      }),
    ).toBe(true);
  });

  it("keeps n out of start-character candidates but includes it for end-character weights", () => {
    expect(HIRAGANA_BASE).not.toContain("ん");
    expect(END_HIRAGANA_WEIGHTS.map((item) => item.char)).toContain("ん");
  });

  it("defines positive end-character weights for all end candidates", () => {
    const weightedChars = END_HIRAGANA_WEIGHTS.map((item) => item.char);
    const expectedEndChars = [...HIRAGANA_BASE, "ん"];

    expect(new Set(weightedChars)).toEqual(new Set(expectedEndChars));
    expect(weightedChars).toHaveLength(expectedEndChars.length);
    expect(END_HIRAGANA_WEIGHTS.every((item) => item.weight > 0)).toBe(true);
  });
});
