// Lists English strings passed to t("…") that have no French or Swedish
// translation yet. Run: npm run i18n:check
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
};
walk("src");

const keys = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
}
// Labels translated at runtime with t(label).
for (const [file, field] of [["src/lib/categories.ts", "label"], ["src/lib/recurrence.ts", "label"], ["src/components/send-gift.tsx", "hint"], ["src/lib/meals.ts", "label"], ["src/app/welcome/page.tsx", "title"], ["src/app/welcome/page.tsx", "body"], ["src/lib/work.ts", "label"], ["src/lib/wardrobe.ts", "label"], ["src/lib/wardrobe.ts", "title"], ["src/lib/feedback.ts", "label"], ["src/lib/papers.ts", "label"], ["src/lib/people.ts", "label"]]) {
  for (const m of readFileSync(file, "utf8").matchAll(new RegExp(`${field}: "([^"]+)"`, "g"))) keys.add(m[1]);
}

let missing = 0;
for (const lang of ["fr", "sv"]) {
  const dict = readFileSync(`src/lib/i18n/${lang}.ts`, "utf8");
  const have = new Set([...dict.matchAll(/^\s*("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1])));
  for (const k of keys) {
    if (have.has(k)) continue;
    missing++;
    console.log(`${lang}: ${JSON.stringify(k)}`);
  }
}
console.log(missing ? `${missing} missing translations` : `All ${keys.size} strings translated.`);
process.exit(missing ? 1 : 0);
