// generateAudio.js
// 🎙️ Booha Sage TTS downloader for game4.html
// ✅ Extracts unique sentences, questions, and answers
// ✅ Saves all Sage MP3 files into the /audio folder
// ✅ Handles rate limits and retry logic safely
// Run: caffeinate node generateAudio.js

//-----------------------------------------------------
// ⚙️ SETTINGS
//-----------------------------------------------------
const fs = require("fs");
const https = require("https");
const path = require("path");
const { default: PQueue } = require("p-queue");

// ✅ target source and output
const inputFile = "game4.html";
const outDir = path.join(__dirname, "audio");   // 🔊 save destination
const failLog = path.join(__dirname, "failures.txt");
const baseUrl = "https://bryanharper.tokyo/_functions/tts?voice=sage&text=";

// ✅ throttling settings
const concurrency = 3;          // simultaneous downloads
const batchDelay = 8000;        // pause between batches (8s)
const retryWait = 300000;       // wait 5 min on 429
const timeoutMs = 20000;        // 20s timeout per request

//-----------------------------------------------------
// 🧠 HELPERS
//-----------------------------------------------------
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
fs.writeFileSync(failLog, "", "utf8");

function sanitizeFilename(text) {
  return text
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/[^a-z0-9\s']/gi, "")
    .replace(/\s+/g, "_")
    .substring(0, 80);
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

//-----------------------------------------------------
// 🧩 PARSE HTML TEXT
//-----------------------------------------------------
const html = fs.readFileSync(inputFile, "utf8");

// grab every quoted string that looks like a sentence
const pattern = /["'`]([^"'`<>]{3,200}?)["'`]/g;
const allMatches = [...html.matchAll(pattern)].map((m) => m[1].trim());

// filter for human-readable text only
const texts = allMatches.filter(
  (t) =>
    /[a-zA-Z]/.test(t) &&
    !t.startsWith("http") &&
    !t.startsWith("#") &&
    !t.includes("{") &&
    !t.includes("=") &&
    !t.match(/\.mp3|\.jpg|\.png|\.js|\.css|\.html/i)
);

// unique only
const uniqueTexts = [...new Set(texts)].sort();

console.log(`🎧 Found ${uniqueTexts.length} unique Sage lines from ${inputFile}`);
console.log(`💾 Saving to: ${outDir}\n`);

//-----------------------------------------------------
// 🚀 FETCH AUDIO
//-----------------------------------------------------
async function fetchAudio(text) {
  const fileName = sanitizeFilename(text) + ".mp3";
  const filePath = path.join(outDir, fileName);

  // skip existing
  if (fs.existsSync(filePath)) {
    console.log("⏩ Skipped (exists): " + fileName);
    return;
  }

  const url = baseUrl + encodeURIComponent(text);
  const file = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode === 429) {
        console.log("⚠️ 429 Rate limit, waiting 5 min…");
        fs.appendFileSync(failLog, "RATE_LIMIT: " + text + "\n");
        setTimeout(() => fetchAudio(text).then(resolve).catch(reject), retryWait);
        return;
      }
      if (res.statusCode !== 200) {
        fs.appendFileSync(failLog, `ERROR ${res.statusCode}: ${text}\n`);
        return reject(new Error("Bad status: " + res.statusCode));
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        console.log("✅ " + fileName);
        resolve();
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      fs.appendFileSync(failLog, "TIMEOUT: " + text + "\n");
      reject(new Error("Timeout: " + text));
    });

    req.on("error", (err) => {
      fs.appendFileSync(failLog, "ERROR: " + text + "\n");
      reject(err);
    });
  });
}

//-----------------------------------------------------
// 🕹️ MAIN EXECUTION
//-----------------------------------------------------
(async () => {
  const queue = new PQueue({ concurrency });
  let batch = 0;

  for (const line of uniqueTexts) {
    queue.add(() => fetchAudio(line).catch(() => {}));

    if (++batch % (concurrency * 5) === 0) {
      await queue.onEmpty();
      console.log(`⏳ Cooling ${batchDelay / 1000}s...`);
      await delay(batchDelay);
    }
  }

  await queue.onIdle();
  console.log("\n✅ All Sage audio files saved to /audio");
})();
