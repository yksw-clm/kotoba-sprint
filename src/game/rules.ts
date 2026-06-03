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

export function isLastCharMatch(endChar: string, actualLastChar: string): boolean {
  return actualLastChar === endChar || actualLastChar === SMALL_HIRAGANA_BY_BASE[endChar];
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
    isLastCharMatch(params.endChar, chars[chars.length - 1]) &&
    (params.length === undefined || chars.length === params.length)
  );
}

export function pickRandomHiragana(): string {
  return HIRAGANA_BASE[randomInt(0, HIRAGANA_BASE.length - 1)];
}
