import { HIRAGANA_BASE } from "./constants";
import { randomInt } from "../utils/random";

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
    chars[chars.length - 1] === params.endChar &&
    (params.length === undefined || chars.length === params.length)
  );
}

export function pickRandomHiragana(): string {
  return HIRAGANA_BASE[randomInt(0, HIRAGANA_BASE.length - 1)];
}
