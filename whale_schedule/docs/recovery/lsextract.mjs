// 从 Chrome/Edge 的 Local Storage LevelDB 里精确提取某个键的值
// Local Storage 的值编码：首字节 0x00=UTF-16LE, 0x01=Latin1/UTF-8
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = process.argv[2];
const KEY = process.argv[3] || "courseWallpaper.data.v1";
const OUTDIR = process.argv[4] || "whale_schedule/build/recover";
if (!DIR) { console.error("usage: node lsextract.mjs <leveldb-dir> [key] [outdir]"); process.exit(2); }

const files = readdirSync(DIR).filter((f) => /\.(ldb|log)$/.test(f));
console.log("扫描文件:", files.join(", "));

/** 在 buffer 的 UTF-8 视图里找 key，返回命中位置列表 */
function findKey(buf, key) {
  const hay = buf.toString("latin1");
  const needle = Buffer.from(key, "utf8").toString("latin1");
  const hits = [];
  let i = -1;
  while ((i = hay.indexOf(needle, i + 1)) !== -1) hits.push(i);
  return hits;
}

/** 从 pos 开始解析 Local Storage 的 value 编码，返回 JS 字符串与结束位置 */
function readValue(buf, pos, maxLen = 4 * 1024 * 1024) {
  if (pos >= buf.length) return null;
  const kind = buf[pos];
  if (kind === 0x00) {
    // UTF-16LE
    const end = Math.min(buf.length, pos + maxLen);
    let s = "";
    for (let i = pos + 1; i + 1 < end; i += 2) {
      const c = buf[i] | (buf[i + 1] << 8);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return { kind: "utf16", text: s };
  }
  if (kind === 0x01) {
    const end = Math.min(buf.length, pos + maxLen);
    let e = pos + 1;
    while (e < end && buf[e] !== 0) e++;
    return { kind: "latin1", text: buf.subarray(pos + 1, e).toString("latin1") };
  }
  return null;
}

mkdirSync(OUTDIR, { recursive: true });
let found = 0;

for (const f of files) {
  const full = join(DIR, f);
  const buf = readFileSync(full);
  const hits = findKey(buf, KEY);
  if (!hits.length) continue;
  console.log(`\n[${f}] 命中 ${hits.length} 处`);

  hits.forEach((h, n) => {
    // 值通常紧跟在 key 之后（中间可能有少量元数据字节），逐个偏移试
    for (let delta = 0; delta <= 24; delta++) {
      const v = readValue(buf, h + Buffer.byteLength(KEY, "utf8") + delta);
      if (!v || v.text.length < 20) continue;
      if (!v.text.trimStart().startsWith("{")) continue;

      // 配平 JSON
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let j = 0; j < v.text.length; j++) {
        const c = v.text[j];
        if (esc) { esc = false; continue; }
        if (c === "\\") { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) { end = j; break; } }
      }
      const jsonText = end > 0 ? v.text.slice(0, end + 1) : v.text;
      let obj = null;
      try { obj = JSON.parse(jsonText); } catch (e) {
        console.log(`   偏移+${delta} (${v.kind}) JSON 解析失败: ${e.message.slice(0, 60)}  长度=${jsonText.length}`);
        writeFileSync(join(OUTDIR, `raw_${f}_${n}_${delta}.txt`), v.text.slice(0, 200000), "utf8");
        return;
      }
      const wsN = obj.workspaces ? Object.keys(obj.workspaces).length : 0;
      const wsDetail = obj.workspaces
        ? Object.entries(obj.workspaces).map(([k, w]) =>
            `${w.name || k}[列${w.columns ? w.columns.length : 0}行${w.rows ? w.rows.length : 0}]`).join(" ")
        : "";
      const tag = `v${obj.version || "?"}_ws${wsN}_rows${Array.isArray(obj.rows) ? obj.rows.length : 0}`;
      const out = join(OUTDIR, `data_${f.replace(/\W/g, "")}_${n}_${tag}.json`);
      writeFileSync(out, JSON.stringify(obj, null, 2), "utf8");
      console.log(`   ✓ 偏移+${delta} (${v.kind}) version=${obj.version} 工作区=${wsN} ${wsDetail}`);
      console.log(`     活动工作区=${obj.activeWsId || "-"} 顶层行数=${Array.isArray(obj.rows) ? obj.rows.length : 0}`);
      console.log(`     → ${out}`);
      found++;
      break;
    }
  });
}
console.log(`\n共提取 ${found} 份数据到 ${OUTDIR}`);
