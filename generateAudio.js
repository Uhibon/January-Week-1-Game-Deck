// generateAudio.js
// Booha Sage TTS incremental generator (sentencequiz.html only)
// Run: caffeinate -i node generateAudio.js

const fs = require("fs");
const https = require("https");
const path = require("path");
const { default: PQueue } = require("p-queue");

// -------------------------------------
// SETTINGS
// -------------------------------------
const concurrency = 3;
const baseDelay = 10000; // 10s
const retryWait = 300000; // 5min
const baseUrl = "https://bryanharper.tokyo/_functions/tts?voice=sage&text=";
const targetFile = "sentencequiz.html";
const outDir = path.join(__dirname, "audio");
const failLog = path.join(__dirname, "failures.txt");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(failLog, "");

// -------------------------------------
// HELPERS
// -------------------------------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const formatTime = (ms) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};
function safeName(t) {
  return (
    t
      .toLowerCase()
      .replace(/[^\wぁ-んァ-ン一-龯０-９a-zA-Z0-9]/g, "")
      .substring(0, 100) + ".mp3"
  );
}
function download(text) {
  return new Promise((resolve, reject) => {
    const fileName = safeName(text);
    const filePath = path.join(outDir, fileName);
    if (fs.existsSync(filePath)) return resolve("skipped");

    const url = baseUrl + encodeURIComponent(text);
    const file = fs.createWriteStream(filePath);
    https
      .get(url, (res) => {
        if (res.statusCode === 200) {
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve("ok")));
        } else {
          file.close(() =>
            fs.unlink(filePath, () => reject(`HTTP ${res.statusCode}`))
          );
        }
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => reject(err.message));
      });
  });
}

// -------------------------------------
// EXTRACT ENGLISH
// -------------------------------------
function extractEnglish(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Missing file: ${filePath}`);
    return [];
  }
  const text = fs.readFileSync(filePath, "utf8");
  const english = [];
  const arrayRegex =
    /const\s+(MASTER|DATA|ITEMS|VOCAB|SENTENCES|QUESTIONS|PARAGRAPHS)\s*=\s*\[[\s\S]*?\];/g;
  const sections = [...text.matchAll(arrayRegex)];

  for (const section of sections) {
    const block = section[0];
    const enMatches = [...block.matchAll(/\ben\s*:\s*"([^"]+)"/g)];
    enMatches.forEach((m) => english.push(m[1].trim()));
    const strMatches = [...block.matchAll(/"([A-Za-z][^"]+?)"/g)];
    for (const m of strMatches) {
      const str = m[1].trim();
      if (/[\u3040-\u30ff\u4e00-\u9faf]/.test(str)) continue;
      if (str.startsWith("http") || str.length < 2) continue;
      if (/^(en|utf|html|meta|viewport|width|cover|css)$/i.test(str)) continue;
      english.push(str);
    }
  }
  return english;
}

// -------------------------------------
// MAIN
// -------------------------------------
(async () => {
  console.log("🎧 Checking for NEW Sage audio in sentencequiz.html…\n");

  const fullPath = path.join(__dirname, targetFile);
  const allLines = extractEnglish(fullPath);
  console.log(`📄 ${targetFile}: ${allLines.length} items found`);

  // filter only new ones (no .mp3 yet)
  const newLines = allLines.filter((line) => {
    const fileName = safeName(line);
    return !fs.existsSync(path.join(outDir, fileName));
  });

  console.log(`🆕 ${newLines.length} new lines need Sage audio\n`);
  if (newLines.length === 0) {
    console.log("✅ All up to date! No new Sage audio needed.\n");
    return;
  }

  const queue = new PQueue({ concurrency });
  let count = 0;
  const start = Date.now();

  for (const line of newLines) {
    queue.add(async () => {
      let done = false;
      while (!done) {
        try {
          await download(line);
          count++;
          const pct = Math.round((count / newLines.length) * 100);
          console.log(`✅ (${count}/${newLines.length}, ${pct}%) ${line}`);
          done = true;
        } catch (e) {
          const msg = String(e);
          if (msg.includes("HTTP 429")) {
            console.warn(`⚠️ 429 Too Many Requests → waiting ${retryWait / 60000} min`);
            await wait(retryWait);
          } else if (msg.includes("HTTP 500")) {
            console.warn("⚠️ 500 Server error → waiting 2 min before retry");
            await wait(120000);
          } else {
            console.error(`❌ ${line} → ${e}`);
            fs.appendFileSync(failLog, line + "\n");
            done = true;
          }
        }
      }
    });

    if (count % 50 === 0) await wait(baseDelay);
  }

  await queue.onIdle();
  const duration = formatTime(Date.now() - start);
  console.log(`\n✨ Finished. ${count} new Sage audios saved in /audio/`);
  console.log(`🪶 Failures logged to failures.txt if any`);
  console.log(`⏱️ Completed in ${duration}\n`);
})();
