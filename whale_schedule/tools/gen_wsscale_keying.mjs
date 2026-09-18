// 从主版本 wsscale.mjs 生成抠像版，并核对内容确实变了
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const src = "whale_schedule/tests/wsscale.mjs";
const out = "whale_schedule/tests/wsscale_keying.mjs";

let s = readFileSync(src, "utf8");
const h0 = createHash("sha1").update(s).digest("hex").slice(0, 8);
s = s.split('"whale_schedule", "main"').join('"whale_schedule", "keying"');
s = s.split("const PORT = 8793;").join("const PORT = 8794;");
s = s.split("9341").join("9342");
s = s.split("chrome-profile-s").join("chrome-profile-sk");
const h1 = createHash("sha1").update(s).digest("hex").slice(0, 8);
writeFileSync(out, s, "utf8");

// 重新读回来核对
const back = readFileSync(out, "utf8");
console.log("主版本 sha1:", h0, " 生成内容 sha1:", h1, " 写回后 sha1:", createHash("sha1").update(back).digest("hex").slice(0, 8));
console.log("生成内容行数:", s.split("\n").length, " 写回后行数:", back.split("\n").length);
console.log("写回后含 expectedAreaVar:", back.includes("expectedAreaVar"));
console.log("写回后还含旧断言:", back.includes("m.panelBottom <= 1080 && m.domRows === 6"));
console.log("写回后 keying 引用:", (back.match("whale_schedule", "keying") || []).length);
console.log("写回后端口:", back.includes("const PORT = 8794;"), " 调试端口 9342:", back.includes("9342"));
