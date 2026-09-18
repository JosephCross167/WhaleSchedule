// 在 RocksDB .ldb 里直接搜线索：键名会不会以明文出现
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2];
const files = readdirSync(DIR).filter((f) => f.endsWith(".ldb"));
const NEEDLES = ["courseWallpaper", "columnConfig", "workspaces", "activeWsId", "雨课堂", "课程名称", "yuketang"];

for (const f of files) {
  const buf = readFileSync(join(DIR, f));
  const s = buf.toString("latin1");
  const hits = {};
  let total = 0;
  for (const n of NEEDLES) {
    let i = -1, c = 0;
    const nb = Buffer.from(n, "utf8").toString("latin1");
    while ((i = s.indexOf(nb, i + 1)) !== -1) c++;
    if (c) { hits[n] = c; total += c; }
  }
  const size = (buf.length / 1024 / 1024).toFixed(1);
  if (total) {
    console.log(`\n★ ${f} (${size}MB) 命中 ${total} 次: ${JSON.stringify(hits)}`);
    // 打第一处上下文
    const first = Object.keys(hits)[0];
    const i = s.indexOf(Buffer.from(first, "utf8").toString("latin1"));
    const st = Math.max(0, i - 150);
    const chunk = s.slice(st, st + 400);
    console.log("   上下文:");
    console.log("   " + chunk.replace(/[^\x20-\x7e\u4e00-\u9fff]/g, "."));
  } else {
    console.log(`  ${f} (${size}MB) 无命中（应为压缩块）`);
  }
}
console.log("\n（若全部无命中，说明数据块是 zstd/snappy 压缩，需解压才能读到）");
