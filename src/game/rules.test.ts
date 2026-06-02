import { describe, expect, it } from "vitest";
import {
  countHiraganaChars,
  isHiraganaWord,
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
});
