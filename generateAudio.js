// generateAudio.js
// Booha Sage TTS generator – only from game4.html
// Saves all Sage mp3 files into /audio folder, no duplicates, retries after 5min on 429.
// Run: caffeinate -i node generateAudio.js

const fs = require("fs");
const https = require("https");
const path = require("path");

const baseUrl = "https://bryanharper.tokyo/_functions/tts?voice=sage&text=";
const outDir = path.join(__dirname, "audio");
const targetFile = "game4.html";

const concurrency = 3;
const baseDelay = 8000; // 8 seconds between groups
const retryWait = 5 * 60 * 1000; // 5 minutes

// ------------------------------------
// Extract all Sage-related text
// ------------------------------------
function extractTexts(html) {
  const textList = [];

  // all .mp3 filenames
  const mp3Matches = html.match(/"([^"]+\.mp3)"/g) || [];
  mp3Matches.forEach(m => {
    const file = m.replace(/"/g, "");
    textList.push(file.replace(".mp3", ""));
  });

  // all questions
  const questionMatches = html.match(/q:"([^"]+)"/g) || [];
  questionMatches.forEach(q => {
    const text = q.replace(/^q:"|\"$/g, "");
    textList.push(text);
  });

  // all answer sentences
  const answerMatches = html.match(/"([^"]+?\.)"/g) || [];
  answerMatches.forEach(a => {
    const text = a.replace(/[".]/g, "").trim();
    if (text && text.length > 2) textList.push(text);
  });

  return textList;
}

// ------------------------------------
// Audio download
// ------------------------------------
function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchAudio(text, attempt = 1) {
  return new Promise(resolve => {
    const safe = encodeURIComponent(text);
    const url = baseUrl + safe;
    const filePath = path.join(outDir, `${text}.mp3`);

    if (fs.existsSync(filePath)) {
      console.log("✅ Exists:", text);
      return resolve();
    }

    https.get(url, res => {
      if (res.statusCode === 429) {
        const wait = retryWait * attempt;
        console.log(`⏳ Rate limited (${text}). Retrying in ${wait / 60000} minutes...`);
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
    }).on("error", () => resolve());
  });
}

// ------------------------------------
// Main
// ------------------------------------
(async () => {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  if (!fs.existsSync(targetFile)) {
    console.error("❌ Could not find", targetFile);
    process.exit(1);
  }

  const html = fs.readFileSync(targetFile, "utf8");
  let allTexts = extractTexts(html);

  // Deduplicate + clean
  allTexts = [...new Set(allTexts.map(t => t.trim()))]
    .filter(t => t.length > 1)
    .sort();

  console.log(`\n🪄 Total unique Sage lines: ${allTexts.length}\n`);

  let index = 0;
  while (index < allTexts.length) {
    const group = allTexts.slice(index, index + concurrency);
    await Promise.all(group.map(fetchAudio));
    index += concurrency;
    if (index < allTexts.length) {
      console.log(`⏳ Waiting ${baseDelay / 1000}s...`);
      await delay(baseDelay);
    }
  }

  console.log("\n✨ All Sage mp3 audio saved in /audio!");
})();
