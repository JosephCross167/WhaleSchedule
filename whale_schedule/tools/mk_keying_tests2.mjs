// 从主版本测试脚本派生抠像版测试脚本
// 用法: node whale_schedule/tools/mk_keying_tests.mjs
// 派生规则：DOCROOT 由 whale_schedule/main 改为 whale_schedule/keying，
//          并换掉端口/调试端口/浏览器 profile 名，避免与主版本测试互相干扰。
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "whale_schedule/tests/";
const MAP = [
  { src: "importtest.mjs",  out: "importtest_keying.mjs",  port: ["8807", "8810"], dbg: ["9355", "9360"], prof: ["chrome-profile-drop", "chrome-profile-dropk"] },
  { src: "swscale.mjs",     out: "swscale_keying.mjs",     port: ["8841", "8842"], dbg: ["9389", "9390"], prof: ["chrome-profile-sw", "chrome-profile-sw-k"] },
  { src: "eqscale.mjs",     out: "eqscale_keying.mjs",     port: ["8831", "8832"], dbg: ["9379", "9380"], prof: ["chrome-profile-eq", "chrome-profile-eq-k"] },
  { src: "fitexp.mjs",      out: "fitexp_keying.mjs",      port: ["8827", "8828"], dbg: ["9375", "9376"], prof: ["chrome-profile-fit", "chrome-profile-fit-k"] },
  { src: "scrollpos.mjs",   out: "scrollpos_keying.mjs",   port: ["8817", "8818"], dbg: ["9365", "9366"], prof: ["chrome-profile-scrollpos", "chrome-profile-scrollposk"] },
];

let n = 0, miss = [];
for (const m of MAP) {
  if (!existsSync(DIR + m.src)) { miss.push(m.src); continue; }
  let s = readFileSync(DIR + m.src, "utf8");
  s = s.split('"whale_schedule", "main"').join('"whale_schedule", "keying"');
  s = s.split("const PORT = " + m.port[0] + ";").join("const PORT = " + m.port[1] + ";");
  s = s.split(m.dbg[0]).join(m.dbg[1]);
  s = s.split(m.prof[0]).join(m.prof[1]);
  writeFileSync(DIR + m.out, s, "utf8");

  const keyingRefs = (s.match(/"whale_schedule", "keying"/g) || []).length;
  const bad = (s.match(/\uFFFD/g) || []).length;
  const mainLeft = (s.match(/"whale_schedule", "main"/g) || []).length;
  console.log(`  ${m.out.padEnd(24)} keying引用=${keyingRefs} 残留main=${mainLeft} 乱码=${bad} port=${m.port[1]} dbg=${m.dbg[1]}`);
  n++;
}
console.log(`\n共生成 ${n} 个${miss.length ? "；缺源文件: " + miss.join(", ") : ""}`);
