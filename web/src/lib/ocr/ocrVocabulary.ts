import substancesIndex from "@/data/substances-index.json";
import ingredientWords from "@/data/ingredient-words.txt?raw";
import { createWordRepair, type WordRepair } from "./wordRepair";

let repair: WordRepair | null = null;

/**
 * The ingredient vocabulary: the hand-kept word list plus every word of
 * every substance name and synonym we match against. Built on first use.
 */
function vocabulary(): WordRepair {
  if (!repair) {
    const words = ingredientWords
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    for (const name of Object.keys(substancesIndex)) {
      for (const w of name.split(/[^a-z]+/)) if (w.length >= 3) words.push(w);
    }
    repair = createWordRepair(words);
  }
  return repair;
}

/** Word repair of OCR output over the vocabulary. */
export function repairOcrWords(text: string): string {
  return vocabulary()(text);
}

/** Whether a word is in the vocabulary, i.e. a correctly spelled word. */
export function isKnownWord(word: string): boolean {
  return vocabulary().has(word);
}
