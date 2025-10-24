// generateAudio.js
// Booha Sage TTS incremental generator (January Week 1)
// Run: caffeinate -i node generateAudio.js

const fs = require("fs");
const https = require("https");
const path = require("path");
const { default: PQueue } = require("p-queue");

// -------------------------------------
// SETTINGS
// -------------------------------------
const concurrency = 3;           // how many downloads at once
const baseDelay = 10000;         // 10 sec between batches
const retryWait = 300000;        // 5 min wait if rate-limited
const baseUrl = "https://bryanharper.tokyo/_functions/tts?voice=sage&text=";
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
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0)
      return resolve("skipped");

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
// JANUARY WEEK 1 LINES
// -------------------------------------
const questions = [
  "What do you eat for breakfast?",
  "What do you do on your birthday?",
  "What do you do before bed?",
  "What do you do after school?",
  "What do you do after dinner?",
  "What do you do every morning?",
  "What do you do on weekends?",
  "What do you do every night?",
  "What do you do in the morning?",
  "What do you do at school?",
  "What do you do at home?",
  "What do you eat for lunch?",
  "What do you eat for dinner?",
  "What do you drink in the morning?",
  "What do you drink with dinner?",
];

const answers = [
  // 1 breakfast
  "I eat rice and miso soup for breakfast.",
  "I eat curry for breakfast.",
  "I eat toothpaste for breakfast.",
  "I eat pencils and notebooks for breakfast.",

  // 2 birthday
  "I eat cake and open presents on my birthday.",
  "I eat toothpaste on my birthday.",
  "I call my refrigerator on my birthday.",
  "I fight dragons on my birthday.",

  // 3 before bed
  "I brush my teeth before bed.",
  "I eat spaghetti before bed.",
  "I water my homework before bed.",
  "I call my refrigerator before bed.",

  // 4 after school
  "I do my homework after school.",
  "I fight dragons after school.",
  "I dance with my mirror after school.",
  "I call my refrigerator after school.",

  // 5 after dinner
  "I wash the dishes after dinner.",
  "I watch TV after dinner.",
  "I play video games after dinner.",
  "I fight dragons after dinner.",

  // 6 every morning
  "I brush my teeth every morning before breakfast.",
  "I fight dragons every morning before breakfast.",
  "I dance with my mirror every morning before breakfast.",
  "I call my refrigerator every morning before breakfast.",

  // 7 weekends
  "I play outside on weekends.",
  "I fight dragons on weekends.",
  "I clean my ceiling on weekends.",
  "I call my refrigerator on weekends.",

  // 8 every night
  "I go to sleep every night at ten.",
  "I dance with my mirror every night.",
  "I call my refrigerator every night.",
  "I fight dragons every night.",

  // 9 in the morning
  "I eat breakfast and go to school in the morning.",
  "I sleep in the morning.",
  "I fight dragons in the morning.",
  "I call my refrigerator in the morning.",

  // 10 at school
  "I study English at school.",
  "I sleep at school.",
  "I call my refrigerator at school.",
  "I fight dragons at school.",

  // 11 at home
  "I help my mom at home.",
  "I swim at home.",
  "I call my refrigerator at home.",
  "I fight dragons at home.",

  // 12 lunch
  "I eat rice for lunch.",
  "I eat my homework for lunch.",
  "I eat pencils for lunch.",
  "I eat dragons for lunch.",

  // 13 dinner
  "I eat fish for dinner.",
  "I eat soap for dinner.",
  "I eat dragons for dinner.",
  "I eat homework for dinner.",

  // 14 drink morning
  "I drink milk in the morning.",
  "I drink toothpaste in the morning.",
  "I drink dragons in the morning.",
  "I drink homework in the morning.",

  // 15 drink with dinner
  "I drink tea with dinner.",
  "I drink toothpaste with dinner.",
  "I drink dragons with dinner.",
  "I drink homework with dinner.",
];

const reactions = [
  "yes good job",
  "perfect english",
  "wow nice work",
  "hmm try again",
  "what language was that",
  "do you have a cookie in your mouth",
];

// -------------------------------------
// MAIN
// -------------------------------------
(async () => {
  console.log("🎧 Checking for NEW Sage audio for January Week 1…\n");

  const allLines = [...questions, ...answers, ...reactions];
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

    // slow down between bursts
    if (count % 50 === 0) await wait(baseDelay);
  }

  await queue.onIdle();
  const duration = formatTime(Date.now() - start);
  console.log(`\n✨ Finished. ${count} new Sage audios saved in /audio/`);
  console.log(`🪶 Failures logged to failures.txt if any`);
  console.log(`⏱️ Completed in ${duration}\n`);
})();
