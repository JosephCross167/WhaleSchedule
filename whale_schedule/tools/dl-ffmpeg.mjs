import { createWriteStream } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const URL_ =
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: node dl-ffmpeg.mjs <out.zip>");
  process.exit(2);
}

const res = await fetch(URL_, { redirect: "follow" });
if (!res.ok) {
  console.error("HTTP", res.status);
  process.exit(1);
}
const total = Number(res.headers.get("content-length") || 0);
console.log("HTTP", res.status, "bytes", total);
if (res.headers.get("content-length") == null) {
  // no length: still fine
}

let got = 0;
let lastPct = -1;
const t0 = Date.now();
const body = Readable.fromWeb(res.body);
body.on("data", (c) => {
  got += c.length;
  if (total) {
    const pct = Math.floor((got / total) * 100);
    if (pct >= lastPct + 10) {
      lastPct = pct;
      process.stdout.write(
        `  ${pct}% ${(got / 1048576).toFixed(1)}MB ${((got / 1048576) / ((Date.now() - t0) / 1000)).toFixed(1)}MB/s\n`
      );
    }
  }
});

await pipeline(body, createWriteStream(OUT));
const st = await stat(OUT);
console.log("saved", OUT, st.size, "bytes");
if (total && st.size !== total) {
  console.error("SIZE MISMATCH");
  await unlink(OUT);
  process.exit(1);
}
