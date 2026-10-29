// The value an attribute's synonym stands for (spec/synonyms.json), shared by
// the validator and the reference renderer; the Rust core embeds the same file.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const table: Record<string, Record<string, string> | string> = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "synonyms.json"), "utf8"));

/** `value` (lowercased) as the attribute's own word, if the table has one. */
export function synonym(attr: string, value: string): string | undefined {
  const t = table[attr];
  return typeof t === "object" ? t[value] : undefined;
}
