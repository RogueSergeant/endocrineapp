import substancesIndex from "@/data/substances-index.json";
import ingredientWords from "@/data/ingredient-words.txt?raw";
import { createWordRepair, type WordRepair } from "./wordRepair";

let repair: WordRepair | null = null;

/**
 * Word repair over the ingredient vocabulary: the hand-kept word list
 * plus every word of every substance name and synonym we match against.
 * Built on first use.
 */
export function repairOcrWords(text: string): string {
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
  return repair(text);
}
