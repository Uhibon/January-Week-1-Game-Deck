// generateAudio.js
// Booha multi-deck Sage TTS generator (parallel-safe version)
// Run: caffeinate node generateAudio.js

const fs = require("fs");
const https = require("https");
const path = require("path");
const { default: PQueue } = require("p-queue"); // ✅ FIXED import for Node 22+

// -------------------------------------
// SETTINGS
// -------------------------------------
const concurrency = 3;            // simultaneous downloads
const baseDelay = 10000;          // 10s between batches
const retryWait = 300000;         // 5min pause on 429
const baseUrl = "https://bryanharper.tokyo/_functions/tts?voice=sage&text=";
const deckFiles = [
  "dragdrop.html",
  "game4.html",
  "sentencequiz.html",
  "speak.html",
];
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
  console.log("🎧 Generating Sage audio from all Booha decks…\n");
  const seen = new Set();
  const allLines = [];

  for (const file of deckFiles) {
    const fullPath = path.join(__dirname, file);
    const lines = extractEnglish(fullPath);
    console.log(`📄 ${file}: ${lines.length} items`);
    allLines.push(...lines);
  }

  const total = allLines.length;
  console.log(`\n📂 Total raw English lines: ${total}\n`);
  if (total === 0) {
    console.log("⚠️ No English lines found. Check file paths.\n");
    return;
  }

  const queue = new PQueue({ concurrency });
  let count = 0;
  const start = Date.now();

  for (const line of allLines) {
    const clean = line.trim();
    const key = clean.toLowerCase();
    const fileName = safeName(clean);
    const filePath = path.join(outDir, fileName);
    if (seen.has(key)) {
      console.log(`↩️ duplicate skipped: ${clean}`);
      continue;
    }
    seen.add(key);

    queue.add(async () => {
      let done = false;
      while (!done) {
        try {
          await download(clean);
          count++;
          const pct = Math.round((count / total) * 100);
          console.log(`✅ (${count}/${total}, ${pct}%) ${clean}`);
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
            console.error(`❌ ${clean} → ${e}`);
            fs.appendFileSync(failLog, clean + "\n");
            done = true;
          }
        }
      }
    });

    // small pause every few items just to breathe
    if (count % 50 === 0) await wait(baseDelay);
  }

  await queue.onIdle();
  const duration = formatTime(Date.now() - start);
  console.log(`\n✨ All Sage audio saved in /audio/ (total ${count})`);
  console.log(`🪶 Failures logged to failures.txt if any`);
  console.log(`⏱️ Completed in ${duration}\n`);
})();
