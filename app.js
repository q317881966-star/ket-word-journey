/* ================= KET 闯关 · 核心逻辑 ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let WORDS = [];              // 词库
let DB = null;               // 进度库
let session = null;          // 当前答题会话
let saveTimer = null;

/* ---------- 日期工具 ---------- */
const pad = n => String(n).padStart(2, "0");
function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  return dateStr(t);
}
const today = () => dateStr();

/* ---------- 存储 ---------- */
const KEY = "ket_v2";
function freshDB() {
  return {
    v: 2,
    states: {},
    days: {},
    profile: {
      streak: 0, longest: 0, lastActive: null, totalXp: 0,
      dailyNew: 10, reviewCap: 80, autoAudio: true,
      sfx: true, voice: true, theme: "auto", specialDone: {}, created: today(),
    },
  };
}
function loadDB() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const db = Object.assign(freshDB(), JSON.parse(raw));
      // 旧版本进度补齐新增设置项
      db.profile = Object.assign(freshDB().profile, db.profile || {});
      return db;
    }
  } catch (e) { console.warn("读取进度失败", e); }
  return freshDB();
}
function save(now = false) {
  if (saveTimer) clearTimeout(saveTimer);
  if (now) { localStorage.setItem(KEY, JSON.stringify(DB)); saveTimer = null; return; }
  saveTimer = setTimeout(() => { localStorage.setItem(KEY, JSON.stringify(DB)); saveTimer = null; }, 400);
}

/* ---------- 单词状态 ---------- */
function stateOf(id) {
  if (!DB.states[id]) {
    DB.states[id] = { ease: 2.5, interval: 0, due: "", reps: 0, lapses: 0, wrong: 0, wrongBy: {}, status: "new" };
  }
  return DB.states[id];
}
const isLearned = id => !!DB.states[id] && DB.states[id].status !== "new";

/** SM-2 变体：q=0 忘了 / 1 一般 / 2 秒答 */
function gradeWord(id, q) {
  const s = stateOf(id);
  const t = today();
  if (q === 0) {
    s.lapses += 1;
    s.wrong = 2;                       // 进错词本，需答对两次移出
    s.ease = Math.max(1.3, s.ease - 0.2);
    s.interval = 1;
    s.reps = 0;
    s.status = "learning";
  } else {
    if (s.wrong > 0) s.wrong -= 1;
    s.reps += 1;
    if (s.interval < 1) s.interval = q === 2 ? 2 : 1;
    else s.interval = Math.min(180, Math.round(s.interval * s.ease * (q === 2 ? 1.3 : 1)));
    if (q === 2) s.ease = Math.min(3.0, s.ease + 0.05);
    s.status = s.interval >= 21 && s.reps >= 3 ? "mastered" : "review";
  }
  s.due = addDays(t, Math.max(1, s.interval));
  return s;
}

function recordWrong(id, kind) {
  const s = stateOf(id);
  s.wrongBy = s.wrongBy || {};
  const key = kind === "spell" ? "spell" : kind === "listen" ? "listen" : kind === "reveal" ? "recall" : "meaning";
  s.wrongBy[key] = (s.wrongBy[key] || 0) + 1;
}
function dueWords() {
  const t = today();
  return WORDS.filter(w => {
    const s = DB.states[w.id];
    return s && s.status !== "new" && s.due && s.due <= t;
  }).sort((a, b) => DB.states[a.id].due.localeCompare(DB.states[b.id].due));
}
function freshWords(n) {
  return WORDS.filter(w => !isLearned(w.id)).slice(0, n);
}
function learnedCount() {
  return WORDS.reduce((n, w) => n + (isLearned(w.id) ? 1 : 0), 0);
}
function masteredCount() {
  return WORDS.reduce((n, w) => n + (DB.states[w.id]?.status === "mastered" ? 1 : 0), 0);
}
function wrongWords() {
  return WORDS.filter(w => (DB.states[w.id]?.wrong || 0) > 0)
    .sort((a, b) => (DB.states[b.id].wrong || 0) - (DB.states[a.id].wrong || 0));
}
/** 按错误次数加权抽取：错得越多越容易被抽中 */
function weightedPick(pool, n) {
  const items = pool.map(w => ({ w, weight: 1 + (DB.states[w.id]?.wrong || 0) * 2 }));
  const out = [];
  while (out.length < n && items.length) {
    const total = items.reduce((a, x) => a + x.weight, 0);
    let r = Math.random() * total, idx = 0;
    for (; idx < items.length; idx++) { r -= items[idx].weight; if (r <= 0) break; }
    idx = Math.min(idx, items.length - 1);
    out.push(items[idx].w);
    items.splice(idx, 1);
  }
  return out;
}
function groupWords(g) {
  return WORDS.filter(w => w.group === g);
}
function groupLearned(g) {
  return groupWords(g).every(w => isLearned(w.id));
}

/* ---------- 今日统计 ---------- */
function dayRec(d = today()) {
  if (!DB.days[d]) DB.days[d] = { new: 0, rev: 0, correct: 0, total: 0, xp: 0 };
  return DB.days[d];
}
function todayNewDone() {
  return DB.days[today()]?.new || 0;
}
function markActive() {
  const p = DB.profile, t = today();
  if (p.lastActive === t) return;
  p.streak = p.lastActive === addDays(t, -1) ? p.streak + 1 : 1;
  p.lastActive = t;
  p.longest = Math.max(p.longest, p.streak);
}

/* ---------- 音频 ---------- */
let currentAudio = null;
function playAudio(id, btn) {
  const w = WORDS.find(x => x.id === id);
  if (!w) return;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if (btn) btn.classList.add("playing");
  const done = () => btn && btn.classList.remove("playing");
  const a = new Audio(`audio/${id}.mp3`);
  currentAudio = a;
  a.onended = done; a.onerror = () => { done(); speak(w.word); };
  a.play().catch(() => { done(); speak(w.word); });
  setTimeout(done, 4000);
}
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-GB"; u.rate = .9;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

/* ---------- 中文语音鼓励 ---------- */
let zhVoice = null;
function pickZhVoice() {
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find(v => /zh[-_]CN|zh[-_]Hans|Chinese/i.test(v.lang + v.name)) || null;
}
if ("speechSynthesis" in window) {
  pickZhVoice();
  speechSynthesis.addEventListener?.("voiceschanged", pickZhVoice);
}
function sayZh(text) {
  if (!DB?.profile?.voice || !text || !("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    if (!zhVoice) pickZhVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 1.05;
    u.pitch = 1.08;
    u.volume = 1;
    if (zhVoice) u.voice = zhVoice;
    speechSynthesis.speak(u);
  } catch {}
}

/* ---------- 预生成的可爱语音 ---------- */
const VOICE_BANK = { correct: 16, wrong: 8, finish: 3, chest: 3, levelup: 2, game: 4 };
const lastVoice = {};
let currentVoice = null;
function speakKind(kind, fallback) {
  if (!DB?.profile?.voice) return;
  const n = VOICE_BANK[kind];
  if (!n) { sayZh(fallback || ""); return; }
  let i = 1 + Math.floor(Math.random() * n);
  if (n > 1 && i === lastVoice[kind]) i = (i % n) + 1;
  lastVoice[kind] = i;
  try {
    if (currentVoice) { currentVoice.pause(); currentVoice = null; }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    const a = new Audio(`audio/voice/${kind}-${i}.mp3`);
    currentVoice = a;
    a.onended = () => { if (currentVoice === a) currentVoice = null; };
    a.play().catch(() => sayZh(fallback || ""));
  } catch { sayZh(fallback || ""); }
}

/* ---------- 音效（Web Audio 合成，无需音频文件） ---------- */
let actx = null;
function ensureAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
  } catch { actx = null; }
}
function tone(freq, dur, type = "sine", vol = .06, delay = 0) {
  if (!actx) return;
  const t = actx.currentTime + delay;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + .012);
  g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + .03);
}
const SFX_FILES = { ok: "audio/sfx/ok-v2.wav", bad: "audio/sfx/bad-v2.wav", done: "audio/sfx/done-v2.wav", tap: "audio/sfx/tap-v2.wav" };
function sfx(kind) {
  if (!DB?.profile?.sfx) return;
  const src = SFX_FILES[kind];
  if (src) {
    try {
      const a = new Audio(src);
      a.volume = .9;
      a.play().catch(() => webSfx(kind));
      return;
    } catch {}
  }
  webSfx(kind);
}
function webSfx(kind) {
  ensureAudio(); if (!actx) return;
  if (kind === "ok") {
    // 清亮的三连上行音：配对成功 / 答对
    [659.25, 783.99, 1046.5].forEach((f, i) => tone(f, .15, "sine", .075, i * .065));
    tone(1318.5, .18, "sine", .04, .2);
  } else if (kind === "bad") {
    // 两声下行：配对失败 / 答错
    tone(311.13, .13, "triangle", .065, 0);
    tone(233.08, .22, "triangle", .065, .12);
  } else if (kind === "done") {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, .2, "sine", .06, i * .1));
  } else if (kind === "tap") {
    tone(660, .05, "sine", .035);
  }
}

/* ---------- 主题 ---------- */
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const t = DB?.profile?.theme || "auto";
  const dark = t === "dark" || (t === "auto" && darkQuery.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#141619" : "#58cc02";
}
darkQuery.addEventListener?.("change", () => { if ((DB?.profile?.theme || "auto") === "auto") applyTheme(); });

/* ---------- 结算彩带 ---------- */
function confetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#58cc02", "#ffc800", "#1cb0f6", "#ff4b4b", "#ce82ff", "#ff9600"];
  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  for (let i = 0; i < 64; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "%";
    p.style.background = pick(colors);
    p.style.width = 6 + Math.random() * 7 + "px";
    p.style.height = 10 + Math.random() * 9 + "px";
    layer.appendChild(p);
    p.animate([
      { transform: "translate3d(0,-20px,0) rotate(0deg)", opacity: 1 },
      { transform: `translate3d(${(Math.random() * 2 - 1) * 90}px, 106vh, 0) rotate(${360 + Math.random() * 540}deg)`, opacity: .8 },
    ], { duration: 1600 + Math.random() * 1400, delay: Math.random() * 500, easing: "cubic-bezier(.2,.6,.4,1)", fill: "forwards" });
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3600);
}

/* ---------- 页面切换 ---------- */
function showPage(name) {
  $$(".page").forEach(p => p.classList.toggle("active", p.id === `page-${name}`));
  $$("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  $("#app").scrollTop = 0;
  if (name === "wrong") renderWrong();
  if (name === "buddy") Buddy.render();
  if (name === "stats") renderStats();
  if (name === "settings") renderSettings();
}
$("#userChip").addEventListener("click", () => showPage("settings"));
$("#tabs").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b) showPage(b.dataset.page);
});

/* ---------- 首页 ---------- */
function renderHome() {
  $("#userName").textContent = DB.profile.name || "ZOE";
  $("#streakNum").textContent = DB.profile.streak;
  $("#xpNum").textContent = DB.profile.totalXp;
  $("#masterNum").textContent = DB.profile.stars || 0;

  const due = dueWords().length;
  const doneNew = Math.min(todayNewDone(), DB.profile.dailyNew);
  const dailyDone = todayNewDone() >= DB.profile.dailyNew && due === 0;

  $("#todayBar").innerHTML = `
    <div class="today-bar ${dailyDone ? "done" : ""}">
      <div class="tb-art" id="homeBuddy" role="button">${Buddy.avatar()}</div>
      <div class="tb-main">
        <b>${dailyDone ? "今天完成啦 🎉" : `今天 ${doneNew}/${DB.profile.dailyNew} 个新词`}</b>
        <span>${due ? `🔁 ${due} 个到期复习` : "🔁 没有到期复习"} · 🔥 ${DB.profile.streak} 天</span>
      </div>
      <button class="btn ${dailyDone ? "btn-blue" : "btn-green"} btn-sm" id="startDaily">${dailyDone ? "再练" : "开始"}</button>
    </div>`;
  $("#startDaily").onclick = () => startDaily();
  $("#homeBuddy").onclick = () => showPage("buddy");

  renderMap();
  Buddy.renderChest();
}

const SPECIALS = {
  wrong:  { label: "错题复习", icon: "📕", cls: "sp-wrong" },
  recall: { label: "回忆复习", icon: "🧠", cls: "sp-recall" },
  day7:   { label: "7 天回顾", icon: "📅", cls: "sp-d7" },
  day10:  { label: "10 天回顾", icon: "🏆", cls: "sp-d10" },
};
const SPECIAL_POS = { 3: "wrong", 5: "recall", 7: "day7", 10: "day10" };

function startSpecial(kind, unit) {
  const unitWords = WORDS.filter(w => Math.ceil(w.group / 10) === unit);
  const learned = unitWords.filter(w => isLearned(w.id));
  const allWrong = wrongWords();
  const uniq = arr => [...new Map(arr.map(w => [w.id, w])).values()];
  let pool = [];
  let label = SPECIALS[kind].label;

  if (kind === "wrong") {
    // 错题优先，不足 15 题时用到期词 / 已学词补足
    pool = uniq([...allWrong, ...dueWords(), ...learned, ...unitWords]);
  } else if (kind === "recall") {
    pool = learned.length ? learned : unitWords;
  } else if (kind === "day7") {
    pool = uniq([...dueWords(), ...learned, ...allWrong]);
    if (!pool.length) pool = unitWords;
  } else {
    pool = uniq([...learned, ...allWrong, ...unitWords]);
  }
  if (!pool.length) return toast("这一单元还没有可复习的词");

  const picked = weightedPick(pool, 15);
  const qs = picked.map(w => {
    if (kind === "recall") return { kind: "reveal", word: w };
    if (kind === "wrong") {
      const by = DB.states[w.id]?.wrongBy || {};
      const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0];
      if (top === "spell") return { kind: "spell", word: w };
      if (top === "listen") return makeListen(w);
      if (top === "meaning") return makeChoice(w, "en2cn");
      if (top === "recall") return { kind: "reveal", word: w };
    }
    return makeReviewQuestion(w);
  });
  beginSession(qs, `第 ${unit} 单元 · ${label}`, { special: { kind, unit } });
}

function gameStation() {
  return `<div class="game-station">
    <button data-gmode="pair"><span>🔤</span>配对</button>
    <button data-gmode="listen"><span>🔊</span>听音</button>
    <button data-gmode="daily"><span>🏆</span>挑战</button>
  </div>`;
}

function renderMap() {
  const map = $("#map");
  const groups = Math.ceil(WORDS.length / 10);
  const cur = WORDS.filter(w => !isLearned(w.id)).reduce((g, w) => Math.min(g, w.group), Infinity);
  const curGroup = cur === Infinity ? null : cur;

  let html = "";
  let stationIdx = 0;
  for (let g = 1; g <= groups; g++) {
    if ((g - 1) % 10 === 0) {
      const unit = Math.ceil(g / 10);
      html += `<div class="unit-head u${(unit - 1) % 5}">
        <span>第 ${unit} 单元</span>
        <small>第 ${(g - 1) * 10 + 1}–${Math.min(g * 10, WORDS.length)} 个单词</small>
      </div>`;
    }
    const ws = groupWords(g);
    const learned = ws.every(w => isLearned(w.id));
    const anyDue = ws.some(w => {
      const s = DB.states[w.id];
      return s && s.status !== "new" && s.due && s.due <= today();
    });
    const isCur = g === curGroup;
    let cls = "pnode";
    if (learned && !anyDue) cls += " done";
    else if (learned && anyDue) cls += " reviewdue";
    else if (isCur) cls += " current";
    else if (g > (curGroup ?? groups)) cls += " locked";
    const x = Math.round(Math.sin(g * 0.62) * 74);
    let stationRow = "";
    if (g % 3 === 0 && g < groups) {
      const STATIONS = ["pair", "listen", "daily", "spell", "listenWrong", "meaning"];
      const STATION_NAMES = { pair: "单词配对", listen: "听音配对", daily: "每日挑战", spell: "拼写错题", listenWrong: "听音错题", meaning: "词义错题" };
      const key = STATIONS[stationIdx % STATIONS.length];
      const isDrill = ["spell", "listenWrong", "meaning"].includes(key);
      const attr = isDrill ? `data-drill-img="${key}"` : `data-gstart="${key}"`;
      const sx = stationIdx % 2 === 0 ? -92 : 92;
      stationIdx++;
      stationRow = `<div class="path-row station-row">
        <button class="side-game" ${attr} style="--sx:${sx}px" title="${STATION_NAMES[key]}">${Buddy.gameIcon(key)}</button>
      </div>`;
    }
    html += `<div class="path-row">
      <button class="${cls}" data-group="${g}" style="--x:${x}px">
        ${isCur ? `<span class="bubble">${anyDue ? "复习" : "开始"}</span>` : ""}
        ${learned && !anyDue ? "✓" : g}
      </button>
    </div>
    ${stationRow}`;
    const posInUnit = ((g - 1) % 10) + 1;
    const unit = Math.ceil(g / 10);
    if (SPECIAL_POS[posInUnit]) {
      const kind = SPECIAL_POS[posInUnit];
      const done = DB.profile.specialDone?.[`${unit}-${kind}`];
      html += `<div class="path-row special-row">
        <button class="snode ${SPECIALS[kind].cls} ${done ? "done" : ""}" data-special="${kind}" data-unit="${unit}">
          <span class="s-ico">${done ? "✓" : SPECIALS[kind].icon}</span>
          <span class="s-label">${SPECIALS[kind].label}</span>
        </button>
      </div>`;
    }
  }
  map.innerHTML = html;

  const el = map.querySelector(".pnode.current");
  if (el && curGroup > 12) setTimeout(() => el.scrollIntoView({ block: "center" }), 80);
}

$("#map").addEventListener("click", e => {
  const gs = e.target.closest("[data-gstart]");
  if (gs) { Game.start(gs.dataset.gstart); return; }
  const di = e.target.closest("[data-drill-img]");
  if (di) {
    const map = { spell: "spell", listenWrong: "listen", meaning: "meaning" };
    startDrill(map[di.dataset.drillImg]); return;
  }
  const sp = e.target.closest("[data-special]");
  if (sp) { startSpecial(sp.dataset.special, Number(sp.dataset.unit)); return; }
  const gm = e.target.closest("[data-gmode]");
  if (gm) { Game.start(gm.dataset.gmode); return; }
  const b = e.target.closest(".pnode");
  if (!b) return;
  const g = Number(b.dataset.group);
  if (b.classList.contains("locked")) return toast("先完成前面的关卡");
  if (groupLearned(g)) startGroupReview(g);
  else startGroup(g);
});

/* ---------- 会话构造 ---------- */
function posOf(meaning) {
  const m = /^(n|v|adj|adv|prep|pron|conj|num|int|pl|abbr)\./i.exec((meaning || "").trim());
  return m ? m[1].toLowerCase() : "";
}
/** 干扰项：优先邻近关卡、释义长度相近、词性相同，再从候选中随机，避免一眼看穿 */
function distill(word, key) {
  const seen = new Set([word[key]]);
  const scored = [];
  for (const w of WORDS) {
    if (w.id === word.id || seen.has(w[key])) continue;
    seen.add(w[key]);
    let score = 60 - Math.abs(w.group - word.group) * 6;
    score -= Math.abs(w.meaning.length - word.meaning.length) * 0.4;
    if (posOf(w.meaning) === posOf(word.meaning)) score += 18;
    scored.push({ w, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return shuffle(scored.slice(0, 24)).slice(0, 3).map(x => x.w);
}
function makeChoice(word, dir) {
  const key = dir === "en2cn" ? "meaning" : "word";
  const answer = word[key];
  const opts = shuffle([answer, ...distill(word, key).map(w => w[key])]);
  return { kind: "choice", word, dir, opts, answer };
}
function makeListen(word) {
  const opts = [word.word, ...distill(word, "word").map(w => w.word)];
  return { kind: "listen", word, opts: shuffle(opts), answer: word.word };
}
const KINDS_REVIEW = ["choice", "choice", "listen", "spell", "reveal", "reveal"];
function makeReviewQuestion(word) {
  const k = KINDS_REVIEW[Math.floor(Math.random() * KINDS_REVIEW.length)];
  if (k === "reveal") return { kind: "reveal", word };
  if (k === "choice") return makeChoice(word, Math.random() < .5 ? "en2cn" : "cn2en");
  if (k === "listen") return makeListen(word);
  return { kind: "spell", word };
}
function makeBlock(word, isNew) {
  const qs = [];
  if (isNew) qs.push({ kind: "card", word });
  qs.push(makeChoice(word, "en2cn"));
  const r = Math.random();
  if (r < .42) qs.push({ kind: "spell", word });
  else if (r < .72) qs.push({ kind: "listen", word, opts: shuffle([word.word, ...distill(word, "word").map(w => w.word)]), answer: word.word });
  else qs.push(makeChoice(word, "cn2en"));
  return qs;
}

function startDaily() {
  const newW = freshWords(Math.max(0, DB.profile.dailyNew - todayNewDone()));
  const due = dueWords().slice(0, DB.profile.reviewCap);
  if (!newW.length && !due.length) {
    const review = WORDS.filter(w => isLearned(w.id));
    if (!review.length) return toast("先完成第一关吧");
    return beginSession(shuffle(review).slice(0, 8).map(w => makeReviewQuestion(w)), "自由复习");
  }
  const queue = [];
  newW.forEach(w => queue.push(...makeBlock(w, true)));
  shuffle(due).forEach(w => queue.push(makeReviewQuestion(w)));
  // 艾宾浩斯补强：随机插入之前学过的词（排除今日新词和到期词）
  const dueIds = new Set(due.map(w => w.id));
  const newIds = new Set(newW.map(w => w.id));
  const pool = WORDS.filter(w => isLearned(w.id) && !dueIds.has(w.id) && !newIds.has(w.id));
  weightedPick(pool, 8).forEach(w => queue.push(makeReviewQuestion(w)));
  beginSession(queue, "今日学习", { newIds: newW.map(w => w.id), totalNew: newW.length });
}
function startGroup(g) {
  const ws = groupWords(g).filter(w => !isLearned(w.id));
  const queue = [];
  ws.forEach(w => queue.push(...makeBlock(w, true)));
  beginSession(queue, `第 ${g} 关`, { newIds: ws.map(w => w.id), totalNew: ws.length });
}
function startGroupReview(g) {
  const ws = groupWords(g).map(w => makeReviewQuestion(w));
  if (!ws.length) return toast("这一关没有可复习的词");
  beginSession(shuffle(ws).slice(0, 12), `第 ${g} 关复习`);
}
function startDrill(type = "all") {
  let ws = wrongWords();
  if (type !== "all") ws = ws.filter(w => (DB.states[w.id]?.wrongBy?.[type] || 0) > 0);
  if (!ws.length) return toast(type === "all" ? "错词本是空的" : "这一类的错词已经清空啦");
  const qs = weightedPick(ws, 15).map(w => {
    if (type === "spell") return { kind: "spell", word: w };
    if (type === "listen") return makeListen(w);
    if (type === "meaning") return makeChoice(w, "en2cn");
    if (type === "recall") return { kind: "reveal", word: w };
    return makeReviewQuestion(w);
  });
  beginSession(qs, type === "all" ? "强化训练" : `错词专项 · ${TYPE_LABEL[type] || ""}`);
}
const TYPE_LABEL = { spell: "拼写", listen: "听音", meaning: "词义", recall: "回忆" };
/** 考前冲刺：错词 + 未来 3 天到期词，混合主动回忆，最多 20 题 */
function startSprint() {
  const pool = new Map();
  wrongWords().forEach(w => pool.set(w.id, w));
  const horizon = addDays(today(), 3);
  WORDS.forEach(w => {
    const s = DB.states[w.id];
    if (s && s.status !== "new" && s.due && s.due <= horizon) pool.set(w.id, w);
  });
  const list = [...pool.values()];
  if (!list.length) return toast("还没有需要冲刺的单词，先学几组吧");
  const qs = shuffle(list).slice(0, 20).map(w =>
    Math.random() < .4 ? { kind: "reveal", word: w } : makeReviewQuestion(w)
  );
  beginSession(qs, "考前冲刺");
}
/** 只做到期复习，不掺新词 */
function startDueReview() {
  const due = dueWords().slice(0, DB.profile.reviewCap);
  if (!due.length) return toast("今天没有到期复习");
  beginSession(shuffle(due).map(w => makeReviewQuestion(w)), "到期复习");
}

function beginSession(queue, title, meta = {}) {
  if (!queue.length) return toast("今天没有需要复习的内容");
  session = {
    queue, i: 0, title,
    total: queue.length,
    reviewed: new Set(), newSeen: new Set(),
    correct: 0, answered: 0, xp: 0,
    firstTry: {}, retried: {},
    ...meta,
  };
  $("#lesson").classList.add("open");
  $("#result").classList.remove("open");
  renderQuestion();
}

/* ---------- 渲染题目 ---------- */
function renderQuestion() {
  const s = session;
  if (!s || s.i >= s.queue.length) return finishSession();
  const q = s.queue[s.i];
  const body = $("#qbody");
  const fb = $("#feedback");
  fb.className = "feedback"; fb.querySelector("#fbTitle").textContent = ""; fb.querySelector("#fbAnswer").textContent = "";
  const check = $("#checkBtn");
  check.textContent = "检查"; check.disabled = true; check.classList.remove("btn-blue");
  check.className = "btn btn-green btn-block";
  $("#skipBtn").style.display = "block";
  $(".lesson-bar i").style.width = `${Math.round(s.i / s.queue.length * 100)}%`;
  $("#lessonCounter").textContent = `${Math.min(s.i + 1, s.queue.length)}/${s.queue.length}`;
  body.scrollTop = 0;
  body.classList.toggle("center", q.kind === "card");

  if (q.kind === "card") {
    body.innerHTML = `
      <p class="q-prompt">新单词</p>
      <div class="q-card">
        <span class="tag">${q.word.group} 组</span>
        <div class="q-word-line">
          <div class="big-word">${esc(q.word.word)}</div>
          <button class="spk-inline" data-spk="${q.word.id}">🔊</button>
        </div>
        ${q.word.phonetic ? `<div class="ph">${esc(q.word.phonetic)}</div>` : ""}
        <div class="cn">${esc(q.word.meaning)}</div>
      </div>
      <p class="spell-hint">点 🔊 听发音，记住后点下面的按钮</p>
      <div style="text-align:center;margin-top:6px"><button class="btn btn-blue btn-sm" id="speakBtn">🎤 跟读练习</button></div>`;
    check.textContent = "我记住了"; check.disabled = false; check.className = "btn btn-green btn-block";
    $("#skipBtn").style.display = "none";
    if (DB.profile.autoAudio) setTimeout(() => playAudio(q.word.id), 120);
    return;
  }

  if (q.kind === "choice") {
    const isEn = q.dir === "en2cn";
    body.innerHTML = `
      <p class="q-prompt">选择正确的${isEn ? "中文释义" : "英文单词"}</p>
      ${isEn
        ? `<div class="q-word-line"><div class="q-word">${esc(q.word.word)}</div><button class="spk-inline" data-spk="${q.word.id}">🔊</button></div>
           ${q.word.phonetic ? `<div class="q-ph">${esc(q.word.phonetic)}</div>` : ""}`
        : `<div class="q-cn">${esc(q.word.meaning)}</div>`}
      <div class="options">${q.opts.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}</div>`;
    if (isEn && DB.profile.autoAudio) setTimeout(() => playAudio(q.word.id), 120);
    return;
  }

  if (q.kind === "listen") {
    body.innerHTML = `
      <p class="q-prompt">听发音，选出正确的单词</p>
      <button class="spk-big" data-spk="${q.word.id}">🔊</button>
      <div class="options">${q.opts.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}</div>`;
    setTimeout(() => playAudio(q.word.id), 250);
    return;
  }

  if (q.kind === "reveal") {
    body.innerHTML = `
      <p class="q-prompt">先在心里回想意思，再翻开答案</p>
      <div class="q-card reveal-card">
        <div class="q-word-line" style="justify-content:center">
          <div class="rc-word">${esc(q.word.word)}</div>
          <button class="spk-inline" data-spk="${q.word.id}">🔊</button>
        </div>
        ${q.word.phonetic ? `<div class="rc-ph">${esc(q.word.phonetic)}</div>` : ""}
        <div class="rc-body" hidden>
          <div class="rc-cn">${esc(q.word.meaning)}</div>
          <div class="rc-tip">这次记得怎么样？</div>
          <div class="self-grade">
            <button class="sg-bad" data-grade="0">😵<br>没记住</button>
            <button class="sg-good" data-grade="1">🤔<br>有点模糊</button>
            <button class="sg-easy" data-grade="2">😎<br>记住了</button>
          </div>
        </div>
      </div>`;
    check.textContent = "显示答案"; check.disabled = false; check.className = "btn btn-blue btn-block";
    $("#skipBtn").style.display = "none";
    if (DB.profile.autoAudio) setTimeout(() => playAudio(q.word.id), 150);
    return;
  }

  if (q.kind === "spell") {
    body.innerHTML = `
      <p class="q-prompt">根据释义拼出单词</p>
      <div class="q-cn">${esc(q.word.meaning)}</div>
      <div class="spell-wrap">
        <input id="spellInput" class="spell-input" autocomplete="off" autocorrect="off"
               autocapitalize="off" spellcheck="false" placeholder="输入英文单词">
        <div class="spell-hint">${q.word.word.length} 个字母${q.word.word.includes(" ") ? "，含空格" : ""}</div>
      </div>`;
    setTimeout(() => { const el = $("#spellInput"); if (el) el.focus(); }, 200);
    $("#spellInput").addEventListener("input", e => {
      check.disabled = !e.target.value.trim();
    });
    return;
  }
}

/* 选择答案 */
$("#qbody").addEventListener("click", e => {
  ensureAudio();
  const spk = e.target.closest("[data-spk]");
  if (spk) { playAudio(Number(spk.dataset.spk), spk); return; }
  if (e.target.closest("#speakBtn")) {
    const q = session?.queue?.[session.i];
    if (q?.word) Buddy.showSpeech(q.word);
    return;
  }

  // 主动回忆自评
  const gbtn = e.target.closest("[data-grade]");
  if (gbtn && !gbtn.disabled) {
    const s = session, q = s?.queue?.[s.i];
    if (!s || !q || q.kind !== "reveal") return;
    const g = Number(gbtn.dataset.grade);
    const correct = g > 0;
    if (!correct) recordWrong(q.word.id, "reveal");
    gradeWord(q.word.id, g);
    if (!(s.newIds || []).includes(q.word.id)) s.reviewed.add(q.word.id);
    s.answered += 1;
    if (correct) s.correct += 1;
    s.xp += correct ? 10 : 2;
    s.checked = true;
    markDay(correct ? 1 : 0);
    $$("[data-grade]", $("#qbody")).forEach(b => b.disabled = true);
    gbtn.classList.add("sel");
    showFeedback(correct, q);
    Buddy.onAnswer(correct, q);
    return;
  }

  const opt = e.target.closest(".opt");
  if (!opt || opt.disabled) return;
  $$(".opt", $("#qbody")).forEach(o => o.classList.remove("sel"));
  opt.classList.add("sel");
  session.pick = Number(opt.dataset.k);
  $("#checkBtn").disabled = false;
});

/* 检查 / 继续 */
$("#checkBtn").addEventListener("click", () => {
  const s = session;
  const q = s.queue[s.i];
  if (!q) return;
  if (q.kind === "card") return advance(true);

  // 主动回忆：第一次点击只翻开答案，由下面三个自评按钮判分
  if (q.kind === "reveal" && !s.revealed) {
    s.revealed = true;
    const rb = $(".rc-body", $("#qbody"));
    if (rb) rb.hidden = false;
    $("#checkBtn").style.display = "none";
    ensureAudio();
    return;
  }

  if (s.checked) return advance(false);   // 第二次点击：继续
  const correct = isCorrect(q);
  s.checked = true;
  s.answered += 1;
  if (correct) s.correct += 1;
  markDay(correct ? 1 : 0);

  const wordId = q.word.id;
  if (!s.firstTry[wordId]) s.firstTry[wordId] = correct;
  if (q.kind === "spell") {
    const el = $("#spellInput");
    el.classList.add(correct ? "ok" : "bad");
    el.disabled = true;
  } else {
    $$(".opt", $("#qbody")).forEach(o => {
      const k = Number(o.dataset.k);
      o.disabled = true;
      if (k === s.pick && !correct) o.classList.add("bad");
      if (q.opts[k] === q.answer) o.classList.add("ok");
    });
  }

  if (!correct) recordWrong(wordId, q.kind);
  gradeWord(wordId, correct ? (s.retried[wordId] ? 1 : (q.kind === "spell" ? 2 : 1)) : 0);
  if (!(s.newIds || []).includes(wordId)) s.reviewed.add(wordId);   // 复习过的不同词数
  if (correct) s.xp += 10; else s.xp += 2;

  showFeedback(correct, q);
  Buddy.onAnswer(correct, q);
  if (!correct && !s.retried[wordId]) {
    // 同词最多追加一次重试（换个题型），避免连续答错无限刷题
    s.retried[wordId] = true;
    const retry = q.kind === "spell" ? makeChoice(q.word, "en2cn") : { kind: "spell", word: q.word };
    s.queue.splice(Math.min(s.i + 2, s.queue.length), 0, retry);
    s.total = s.queue.length;
  }
});

$("#skipBtn").addEventListener("click", () => {
  const q = session.queue[session.i];
  if (!q || q.kind === "card") return;
  gradeWord(q.word.id, 0);
  markDay(0);
  if (!(session.newIds || []).includes(q.word.id)) session.reviewed.add(q.word.id);
  session.answered += 1;
  advance(false, true);
});

function isCorrect(q) {
  if (q.kind === "spell") return norm($("#spellInput").value) === norm(q.word.word);
  if (q.kind === "listen" || q.kind === "choice") return session.pick != null && q.opts[session.pick] === q.answer;
  return false;
}
const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function showFeedback(ok, q) {
  sfx(ok ? "ok" : "bad");
  const fb = $("#feedback");
  fb.className = `feedback ${ok ? "good" : "bad"} show`;
  const line = Buddy.line(ok ? "correct" : "wrong");
  $("#fbTitle").textContent = ok ? "答对了！" : "再看一眼";
  $("#fbAnswer").textContent = ok
    ? (q.kind === "card" ? "" : `${q.word.word} · ${q.word.meaning}`)
    : `${q.word.word}${q.word.phonetic ? " " + q.word.phonetic : ""} · ${q.word.meaning}`;
  speakKind(ok ? "correct" : "wrong", line);
  const check = $("#checkBtn");
  check.textContent = "继续";
  check.className = "btn btn-blue btn-block";
  check.disabled = false;
  check.style.display = "";
  $("#skipBtn").style.display = "none";
  if (ok) $("#qbody").classList.add("celebrate");
  else $("#qbody").classList.add("shake");
}

function advance(fromCard, skipped) {
  const s = session;
  const q = s.queue[s.i];
  if (q.kind === "card" && !s.newSeen.has(q.word.id)) {
    const st = stateOf(q.word.id);
    if (st.status === "new") { st.status = "learning"; st.due = addDays(today(), 1); }
    s.newSeen.add(q.word.id);
    dayRec().new += 1;
    save();
  }
  s.checked = false;
  s.revealed = false;
  s.pick = null;
  s.i += 1;
  $("#feedback").className = "feedback";
  $("#qbody").classList.remove("shake", "celebrate");
  $("#skipBtn").style.display = "block";
  if (fromCard || skipped) { /* 已计分 */ }
  renderQuestion();
}

function markDay(correct) {
  const d = dayRec();
  d.total += 1;
  d.correct += correct;
  save();
}

/* ---------- 结束 ---------- */
function finishSession() {
  const s = session;
  const acc = s.answered ? Math.round(s.correct / s.answered * 100) : 100;
  const newDone = s.newSeen.size;
  const revDone = [...s.reviewed].filter(id => !s.newSeen.has(id)).length;

  DB.profile.totalXp += s.xp;
  const d = dayRec();
  d.xp += s.xp;
  d.rev += revDone;
  markActive();
  save(true);

  $("#resTitle").textContent = s.title === "今日学习" ? "今日打卡完成！" : "训练完成！";
  $("#resXp").textContent = s.xp;
  $("#resAcc").textContent = acc + "%";
  $("#resNew").textContent = newDone;
  $("#resRev").textContent = revDone;
  $("#resStreak").textContent = DB.profile.streak;
  $("#lesson").classList.remove("open");
  $("#result").classList.add("open");
  if (s.special) {
    DB.profile.specialDone = DB.profile.specialDone || {};
    DB.profile.specialDone[`${s.special.unit}-${s.special.kind}`] = true;
    save(true);
  }
  confetti();
  sfx("done");
  if (s.title === "今日学习") speakKind("finish");
  Buddy.onSessionEnd(s);
  session = null;
  renderHome();
}

$("#resDone").onclick = () => {
  $("#result").classList.remove("open");
  showPage("home");
};

$("#quitBtn").onclick = () => {
  if (!session) return;
  if (!confirm("确定退出当前学习？已答的题会保留进度。")) return;
  session = null;
  $("#lesson").classList.remove("open");
  renderHome();
};

/* ---------- 错词本 ---------- */
function renderWrong() {
  const list = wrongWords();
  $("#wrongCount").textContent = list.length;
  $("#drillBtn").disabled = !list.length;
  $("#wrongList").innerHTML = list.length
    ? list.map(w => {
      const by = DB.states[w.id].wrongBy || {};
      const tags = Object.entries(by).filter(([, v]) => v > 0)
        .map(([k, v]) => `<span class="w-type t-${k}">${TYPE_LABEL[k] || k} ${v}</span>`).join("");
      return `
      <div class="word-row">
        <div class="w-txt">
          <div><span class="w-en">${esc(w.word)}</span><span class="w-ph">${esc(w.phonetic)}</span></div>
          <div class="w-cn">${esc(w.meaning)}</div>
          ${tags ? `<div class="w-types">${tags}</div>` : ""}
        </div>
        <span class="w-badge">再对 ${DB.states[w.id].wrong} 次</span>
        <button class="spk" data-spk="${w.id}">🔊</button>
      </div>`;
    }).join("")
    : `<div class="empty"><span class="emoji">🎯</span>还没有错词<br>答错的单词会自动收录到这里</div>`;
}
$("#wrongList").addEventListener("click", e => {
  const b = e.target.closest("[data-spk]");
  if (b) playAudio(Number(b.dataset.spk), b);
});
$("#drillBtn").onclick = () => startDrill("all");
$("#drillTypes")?.addEventListener("click", e => {
  const b = e.target.closest("[data-drill]");
  if (b) startDrill(b.dataset.drill);
});
$("#sprintBtn").onclick = startSprint;

/* ---------- 统计 ---------- */
function renderStats() {
  const learned = learnedCount(), mastered = masteredCount(), due = dueWords().length;
  const totalXp = DB.profile.totalXp;
  const todayRec = DB.days[today()] || { total: 0 };
  $("#statCards").innerHTML = `
    <div class="s-card"><b>${learned}</b><span>已学单词</span></div>
    <div class="s-card"><b>${mastered}</b><span>已掌握</span></div>
    <div class="s-card"><b>${due}</b><span>今日待复习</span></div>
    <div class="s-card"><b>${todayRec.total}</b><span>今日答题</span></div>
    <div class="s-card"><b>${DB.profile.streak}</b><span>连续打卡（天）</span></div>
    <div class="s-card"><b>${totalXp}</b><span>累计 XP</span></div>`;

  const learning = learned - mastered;
  const untouched = WORDS.length - learned;
  const pct = Math.round(mastered / WORDS.length * 100);
  $("#masterRing").innerHTML = `
    <div class="donut" style="background:conic-gradient(var(--green) 0 ${pct}%, #b8e986 ${pct}% ${Math.round(learned / WORDS.length * 100)}%, #eee 0)">
      <div><b>${pct}%</b><small>已掌握</small></div>
    </div>
    <div class="legend">
      <div><i style="background:var(--green)"></i>已掌握<span class="v">${mastered}</span></div>
      <div><i style="background:#b8e986"></i>学习中<span class="v">${learning}</span></div>
      <div><i style="background:#eee"></i>未学习<span class="v">${untouched}</span></div>
    </div>`;

  renderHeatmap();
}

function renderHeatmap() {
  const weeks = 16;
  const t = new Date();
  // 找到本周周一
  const dow = (t.getDay() + 6) % 7;
  const thisMon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - dow);
  const start = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() - (weeks - 1) * 7);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const ds = dateStr(d);
    const rec = DB.days[ds];
    const n = rec ? rec.total : 0;
    const lvl = n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 45 ? 3 : 4;
    cells.push(`<div class="hm-cell l${lvl} ${d > t ? "future" : ""}" title="${ds} · ${n} 题"></div>`);
  }
  $("#heatmap").innerHTML = cells.join("");
  $("#heatLegend").innerHTML = `少 <span class="hm-cell l0"></span><span class="hm-cell l1"></span><span class="hm-cell l2"></span><span class="hm-cell l3"></span><span class="hm-cell l4"></span> 多`;
}

/* ---------- 设置 ---------- */
function renderSettings() {
  const p = DB.profile;
  $("#dailyNew").value = p.dailyNew;
  $("#dailyNewVal").textContent = p.dailyNew;
  $("#reviewCap").value = p.reviewCap;
  $("#reviewCapVal").textContent = p.reviewCap;
  $("#autoAudio").checked = p.autoAudio;
  $("#sfxOn").checked = p.sfx;
  $("#voiceOn").checked = p.voice !== false;
  $("#learnerName").value = p.name || "ZOE";
  $$("#themeSeg button").forEach(b => b.classList.toggle("on", b.dataset.theme === (p.theme || "auto")));
  updateOfflineState();
}
function updateOfflineState() {
  const el = $("#offlineState"), hint = $("#offlineHint");
  if (!el) return;
  const say = (text, cls, h) => {
    el.textContent = text; el.className = "offline-badge " + cls;
    if (hint) { hint.textContent = h; hint.style.display = h ? "" : "none"; }
  };
  if (!("serviceWorker" in navigator)) {
    say("不支持", "warn", "当前浏览器不支持离线缓存，建议用 Safari / Chrome 打开。");
    return;
  }
  if (!window.isSecureContext) {
    say("未启用（需 HTTPS）", "warn",
      "当前是局域网 http 地址，浏览器不提供离线缓存。想要装成完全离线的 App，请用 deploy-vercel.command 部署出 https 地址后再添加到主屏幕。");
    return;
  }
  navigator.serviceWorker.getRegistration().then(r => {
    say(r ? "已启用" : "未启用", r ? "ok" : "warn",
      r ? "网页与用过的音频已缓存，断网也能继续学。" : "首次打开后会自动启用。");
  }).catch(() => say("未知", "warn", ""));
}
$("#dailyNew").addEventListener("input", e => {
  DB.profile.dailyNew = Number(e.target.value);
  $("#dailyNewVal").textContent = e.target.value;
  save(true);
});
$("#reviewCap").addEventListener("input", e => {
  DB.profile.reviewCap = Number(e.target.value);
  $("#reviewCapVal").textContent = e.target.value;
  save(true);
});
$("#autoAudio").addEventListener("change", e => { DB.profile.autoAudio = e.target.checked; save(true); });
$("#sfxOn").addEventListener("change", e => {
  DB.profile.sfx = e.target.checked; save(true);
  if (e.target.checked) { ensureAudio(); sfx("ok"); }
});
$("#voiceOn").addEventListener("change", e => {
  DB.profile.voice = e.target.checked; save(true);
  if (e.target.checked) sayZh("语音鼓励已打开");
});
$("#learnerName").addEventListener("input", e => {
  DB.profile.name = e.target.value.trim() || "ZOE";
  save();
});
$("#reportBtn").addEventListener("click", () => Buddy.openReport());
$("#reportClose").addEventListener("click", () => $("#report").classList.remove("open"));
$("#themeSeg").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  DB.profile.theme = b.dataset.theme;
  save(true); applyTheme(); renderSettings();
});

$("#exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(DB)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ket-progress-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("已导出备份文件");
};
$("#importBtn").onclick = () => $("#importFile").click();
$("#importFile").addEventListener("change", e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data.states || !data.profile) throw new Error("格式不对");
      DB = Object.assign(freshDB(), data);
      save(true);
      renderHome(); renderSettings();
      toast("进度已导入");
    } catch (err) { toast("导入失败：文件格式不对"); }
  };
  r.readAsText(f);
  e.target.value = "";
});
$("#resetBtn").onclick = () => {
  if (!confirm("确定清空全部学习进度？此操作不可撤销。")) return;
  if (!confirm("真的确定？建议先导出备份。")) return;
  DB = freshDB(); save(true);
  renderHome(); renderSettings();
  toast("已重置");
};

/* ---------- 小工具 ---------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
const pick = a => a[Math.floor(Math.random() * a.length)];
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- 启动 ---------- */
async function boot() {
  try {
    const res = await fetch("words.json", { cache: "no-cache" });
    WORDS = await res.json();
  } catch (e) {
    $("#boot").innerHTML = `<p style="padding:30px;text-align:center;line-height:1.8">
      词库载入失败。<br>请确认通过本地服务器打开（不要直接双击 html）。<br><br>
      在电脑终端执行：<br><code>cd ket-app && python3 -m http.server 8000</code></p>`;
    return;
  }
  DB = loadDB();
  DB.profile.streak = computeStreak();
  Buddy.init();
  applyTheme();
  $("#userName").textContent = DB.profile.name || "ZOE";
  renderHome();
  showPage("home");
  setTimeout(() => $("#boot").classList.add("hide"), 250);
  if (DB.profile.autoAudio) preloadNextAudio();
  ["correct-1", "wrong-1"].forEach(f => { const a = new Audio(); a.src = `audio/voice/${f}.mp3`; a.preload = "auto"; });
}

function computeStreak() {
  // 若中断超过一天，显示 0（不改写历史）
  const last = DB.profile.lastActive;
  if (!last) return 0;
  if (last === today() || last === addDays(today(), -1)) return DB.profile.streak;
  return 0;
}

function preloadNextAudio() {
  const next = freshWords(3);
  next.forEach(w => { const a = new Audio(); a.src = `audio/${w.id}.mp3`; a.preload = "auto"; });
}

/* Service Worker */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).catch(() => {}));
}

boot();
