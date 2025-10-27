// generateAudio.js
// Booha Sage TTS generator – scans game4.html
// Saves all Sage mp3 files into /audio folder, skips duplicates
// Retries after 5 min on 429 errors
// Run: caffeinate -i node generateAudio.js

const fs = require("fs");
const https = require("https");
const path = require("path");

const baseUrl = "https://bryanharper.tokyo/_functions/tts?voice=sage&text=";
const outDir = path.join(__dirname, "audio");
const targetFile = "game4.html";

const concurrency = 3;
const delayMs = 8000;              // 8 s between batches
const retryWait = 5 * 60 * 1000;   // 5 min on 429

// ------------------------------------
// Extract all Sage-related text
// ------------------------------------
function extractTexts(html) {
  const list = [];

  // mp3 filenames
  const mp3Matches = html.match(/"([^"]+\.mp3)"/g) || [];
  mp3Matches.forEach(m => list.push(m.replace(/["]/g, "").replace(".mp3", "")));

  // q:"question"
  const qMatches = html.match(/q:"([^"]+)"/g) || [];
  qMatches.forEach(q => list.push(q.replace(/^q:"|\"$/g, "")));

  // sentences ending with period
  const sMatches = html.match(/"([^"]+?\.)"/g) || [];
  sMatches.forEach(a => {
    const t = a.replace(/[".]/g, "").trim();
    if (t.length > 2) list.push(t);
  });

  return list;
}

// ------------------------------------
// Helpers
// ------------------------------------
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function safeFile(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^\wぁ-んァ-ン一-龯０-９a-zA-Z0-9]/g, "")
      .substring(0, 100) + ".mp3"
  );
}

function fetchAudio(text, attempt = 1) {
  return new Promise(resolve => {
    const fileName = safeFile(text);
    const filePath = path.join(outDir, fileName);
    if (fs.existsSync(filePath)) {
      console.log("✅ Exists:", text);
      return resolve();
    }

    const url = baseUrl + encodeURIComponent(text);
    https
      .get(url, res => {
        if (res.statusCode === 429) {
          const wait = retryWait * attempt;
          console.log(`⏳ 429 Too Many Requests → waiting ${wait / 60000} min for ${text}`);
          return setTimeout(() => fetchAudio(text, attempt + 1).then(resolve), wait);
        }
        if (res.statusCode !== 200) {
          console.log("❌ Failed:", text, "→", res.statusCode);
          return resolve();
        }
        const file = fs.createWriteStream(filePath);
        res.pipe(file);
        file.on("finish", () => file.close(() => {
          console.log("🎧 Saved:", text);
          resolve();
        }));
      })
      .on("error", err => {
        console.log("⚠️ Network error:", text, "→", err.message);
        resolve();
      });
  });
}

// ------------------------------------
// Main
// ------------------------------------
(async () => {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  if (!fs.existsSync(targetFile)) {
    console.error("❌ Missing", targetFile);
    process.exit(1);
  }

  const html = fs.readFileSync(targetFile, "utf8");
  let items = extractTexts(html);

  // Deduplicate + clean
  items = [...new Set(items.map(t => t.trim()))].filter(t => t.length > 1);
  console.log(`\n🪄 Total unique Sage lines: ${items.length}\n`);

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(fetchAudio));
    if (i + concurrency < items.length) {
      console.log(`⏳ Waiting ${delayMs / 1000}s before next batch...`);
      await delay(delayMs);
    }
  }

  console.log("\n✨ All Sage mp3 audio saved in /audio/");
})();
