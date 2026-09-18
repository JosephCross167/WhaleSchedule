// 精确字节搜索：在 .ldb / .log 里找课程名的 UTF-8 与 UTF-16LE 两种编码
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2];
const WORDS = ["工科物理", "物理化学", "高等数学", "大学物理", "线性代数", "课程名称", "雨课堂", "云班课", "智慧树"];
const files = readdirSync(DIR).filter((f) => /\.(ldb|log)$/.test(f)).sort();

console.log("在", files.length, "个文件里搜索课程名（UTF-8 / UTF-16LE 两种编码）\n");

for (const f of files) {
  const buf = readFileSync(join(DIR, f));
  const found = [];
  for (const w of WORDS) {
    const u8 = Buffer.from(w, "utf8");
    const u16 = Buffer.from(w, "utf16le");
    const c8 = countOccur(buf, u8);
    const c16 = countOccur(buf, u16);
    if (c8 || c16) found.push(`${w}(utf8×${c8}, utf16×${c16})`);
  }
  if (found.length) console.log(`★ ${f}  (${(buf.length / 1048576).toFixed(2)}MB)`);
  else console.log(`  ${f}  (${(buf.length / 1048576).toFixed(2)}MB) 无`);
  for (const x of found) console.log(`     ${x}`);
}

function countOccur(hay, needle) {
  let n = 0, i = -1;
  while ((i = hay.indexOf(needle, i + 1)) !== -1) n++;
  return n;
}

/* 另外：搜 courseWallpaper 的两种编码，确认到底在哪些文件里 */
console.log("\n=== courseWallpaper 出现情况 ===");
for (const f of files) {
  const buf = readFileSync(join(DIR, f));
  const c8 = countOccur(buf, Buffer.from("courseWallpaper", "utf8"));
  const c16 = countOccur(buf, Buffer.from("courseWallpaper", "utf16le"));
  if (c8 || c16) console.log(`  ${f}: utf8×${c8} utf16×${c16}`);
}
console.log("（只列出命中的文件）");
