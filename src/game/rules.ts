import { HIRAGANA_BASE } from "./constants";
import { randomInt } from "../utils/random";

const SMALL_HIRAGANA_BY_BASE: Record<string, string> = {
  あ: "ぁ",
  い: "ぃ",
  う: "ぅ",
  え: "ぇ",
  お: "ぉ",
  つ: "っ",
  や: "ゃ",
  ゆ: "ゅ",
  よ: "ょ",
  わ: "ゎ",
};

const EASY_END_CHARS = [
  "あ",
  "い",
  "う",
  "き",
  "く",
  "し",
  "す",
  "た",
  "ち",
  "つ",
  "て",
  "と",
  "な",
  "に",
  "の",
  "り",
  "る",
  "れ",
  "ら",
  "ん",
] as const;

const NORMAL_END_CHARS = [
  "え",
  "お",
  "か",
  "こ",
  "さ",
  "せ",
  "そ",
  "は",
  "ひ",
  "ふ",
  "や",
  "ゆ",
  "よ",
  "ろ",
] as const;

const HARD_END_CHARS = [
  "け",
  "ぬ",
  "ね",
  "へ",
  "ほ",
  "ま",
  "み",
  "む",
  "め",
  "も",
  "わ",
] as const;

export const END_HIRAGANA_WEIGHTS = [
  ...EASY_END_CHARS.map((char) => ({ char, weight: 8 })),
  ...NORMAL_END_CHARS.map((char) => ({ char, weight: 4 })),
  ...HARD_END_CHARS.map((char) => ({ char, weight: 1 })),
] as const;

export function countHiraganaChars(word: string): number {
  return Array.from(word).length;
}

export function isHiraganaWord(word: string): boolean {
  return /^[ぁ-んー]+$/.test(word);
}

export function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

export function normalizeAnswer(input: string): string {
  return katakanaToHiragana(input.trim().replace(/\s+/g, "").normalize("NFKC"));
}

export function normalizePlayerName(input: string): string {
  return input.trim().replace(/\s+/g, " ").normalize("NFKC").slice(0, 16);
}

function isDirectLastCharMatch(endChar: string, actualLastChar: string): boolean {
  return actualLastChar === endChar || actualLastChar === SMALL_HIRAGANA_BY_BASE[endChar];
}

export function isLastCharMatch(
  endChar: string,
  actualLastChar: string,
  previousChar?: string,
): boolean {
  if (isDirectLastCharMatch(endChar, actualLastChar)) return true;
  return actualLastChar === "ー" && previousChar !== undefined
    ? isDirectLastCharMatch(endChar, previousChar)
    : false;
}

export function isStructurallyValidAnswer(params: {
  word: string;
  startChar: string;
  endChar: string;
  length?: number;
}): boolean {
  const chars = Array.from(params.word);

  if (chars.length === 0) return false;

  return (
    isHiraganaWord(params.word) &&
    chars[0] === params.startChar &&
    isLastCharMatch(params.endChar, chars[chars.length - 1], chars[chars.length - 2]) &&
    (params.length === undefined || chars.length === params.length)
  );
}

export function pickRandomHiragana(): string {
  return HIRAGANA_BASE[randomInt(0, HIRAGANA_BASE.length - 1)];
}

export function pickRandomEndHiragana(): string {
  const totalWeight = END_HIRAGANA_WEIGHTS.reduce((total, item) => total + item.weight, 0);
  let cursor = Math.random() * totalWeight;

  for (const item of END_HIRAGANA_WEIGHTS) {
    cursor -= item.weight;
    if (cursor < 0) return item.char;
  }

  return END_HIRAGANA_WEIGHTS[END_HIRAGANA_WEIGHTS.length - 1].char;
}
