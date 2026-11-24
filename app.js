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
      sfx: true, theme: "auto", created: today(),
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
    DB.states[id] = { ease: 2.5, interval: 0, due: "", reps: 0, lapses: 0, wrong: 0, status: "new" };
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
  return WORDS.filter(w => (DB.states[w.id]?.wrong || 0) > 0);
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
function sfx(kind) {
  if (!DB?.profile?.sfx) return;
  ensureAudio(); if (!actx) return;
  if (kind === "ok") { tone(784, .08); tone(1175, .13, "sine", .05, .07); }
  else if (kind === "bad") { tone(196, .18, "sawtooth", .04); }
  else if (kind === "done") { [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, "sine", .055, i * .11)); }
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
$("#tabs").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b) showPage(b.dataset.page);
});

/* ---------- 首页 ---------- */
function renderHome() {
  $("#streakNum").textContent = DB.profile.streak;
  $("#xpNum").textContent = DB.profile.totalXp;
  $("#masterNum").textContent = DB.profile.stars || 0;

  const due = dueWords().length;
  const newNeeded = Math.max(0, DB.profile.dailyNew - todayNewDone());
  const dailyDone = todayNewDone() >= DB.profile.dailyNew && due === 0;
  const total = learnedCount();
  const pct = Math.round(total / WORDS.length * 100);

  $("#todayCard").innerHTML = `
    <div class="home-buddy" id="homeBuddy" role="button">
      <div class="hb-art">${Buddy.avatar()}</div>
      <div class="hb-line">${esc(Buddy.line("idle"))}</div>
      <div class="hb-stars">⭐ ${DB.profile.stars || 0}</div>
    </div>
    <div class="today ${dailyDone ? "done" : ""}">
      <h2>${dailyDone ? "今日任务完成 🎉" : "今天的学习"}</h2>
      <p class="sub">${dailyDone ? "想多练几组？点下面的按钮继续复习。" : "完成新词和到期复习，就能守住连胜。"}</p>
      <div class="goals">
        <div class="goal ${newNeeded === 0 ? "full" : ""}">
          <div class="g-ico">✨</div>
          <div class="g-txt"><b>${Math.min(todayNewDone(), DB.profile.dailyNew)}/${DB.profile.dailyNew}</b><span>新词</span></div>
        </div>
        <div class="goal ${due === 0 ? "full" : ""}" data-due role="button" title="点此只做复习">
          <div class="g-ico">🔁</div>
          <div class="g-txt"><b>${due}</b><span>${due ? "到期复习 · 点击开练" : "到期复习"}</span></div>
        </div>
        <div class="ring" style="background:conic-gradient(var(--green) ${pct * 3.6}deg, var(--bg-2) 0)">
          <i>${pct}%</i>
        </div>
      </div>
      <button id="startDaily" class="btn ${dailyDone ? "btn-blue" : "btn-green"} btn-block">
        ${dailyDone ? "再练一轮" : "开始今日学习"}
      </button>
    </div>`;
  $("#startDaily").onclick = () => startDaily();
  $("#todayCard").querySelector(".goal[data-due]")?.addEventListener("click", startDueReview);
  $("#homeBuddy")?.addEventListener("click", () => showPage("buddy"));

  renderMap();
  Buddy.renderChest();
}

function renderMap() {
  const map = $("#map");
  const cur = WORDS.filter(w => !isLearned(w.id)).reduce((g, w) => Math.min(g, w.group), Infinity);
  const curGroup = cur === Infinity ? null : cur;
  const groups = Math.ceil(WORDS.length / 10);
  const maxG = curGroup ? Math.min(groups, curGroup + 6) : groups;
  $("#mapHint").textContent = `已学 ${learnedCount()} / ${WORDS.length}`;

  let html = "";
  const perRow = 3;
  for (let row = 0; row * perRow < maxG; row++) {
    const rev = row % 2 === 1;
    const nums = [0, 1, 2].map(i => row * perRow + i + 1);
    const order = rev ? [...nums].reverse() : nums;   // 视觉顺序：蛇形折返
    html += `<div class="map-row">`;
    order.forEach((g, idx) => {
      if (g > maxG) {
        html += `<span class="node ghost"></span>`;
      } else {
        const ws = groupWords(g);
        const learned = ws.every(w => isLearned(w.id));
        const anyDue = ws.some(w => {
          const s = DB.states[w.id];
          return s && s.status !== "new" && s.due && s.due <= today();
        });
        const isCur = g === curGroup;
        let cls = "node";
        if (learned && !anyDue) cls += " done";
        else if (learned && anyDue) cls += " reviewdue";
        else if (isCur) cls += " current";
        else if (g > (curGroup ?? groups)) cls += " locked";
        const label = learned && !anyDue ? "✓" : g;
        html += `<button class="${cls}" data-group="${g}">
          ${isCur ? `<span class="bubble">${anyDue ? "复习" : "开始"}</span>` : ""}
          ${label}
        </button>`;
      }
      if (idx < 2) html += `<span class="link${order[idx + 1] > maxG ? " ghost" : ""}"></span>`;
    });
    html += `</div>`;
    // 蛇形转弯处的竖向连接
    if ((row + 1) * perRow < maxG) {
      html += `<div class="vconn ${(row + 1) % 2 === 1 ? "right" : "left"}"></div>`;
    }
  }
  if (maxG < groups) {
    html += `<div class="map-more">🔒 后面还有 <b>${groups - maxG}</b> 关，学完当前关卡自动解锁</div>`;
  }
  map.innerHTML = html;
}

$("#map").addEventListener("click", e => {
  const b = e.target.closest(".node");
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
const KINDS_REVIEW = ["choice", "choice", "listen", "spell", "reveal", "reveal"];
function makeReviewQuestion(word) {
  const k = KINDS_REVIEW[Math.floor(Math.random() * KINDS_REVIEW.length)];
  if (k === "reveal") return { kind: "reveal", word };
  if (k === "choice") return makeChoice(word, Math.random() < .5 ? "en2cn" : "cn2en");
  if (k === "listen") {
    const opts = [word.word, ...distill(word, "word").map(w => w.word)];
    return { kind: "listen", word, opts: shuffle(opts), answer: word.word };
  }
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
function startDrill() {
  const ws = wrongWords();
  if (!ws.length) return toast("错词本是空的");
  beginSession(shuffle(ws).slice(0, 15).map(w => makeReviewQuestion(w)), "强化训练");
}
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
  $("#fbTitle").textContent = Buddy.line(ok ? "correct" : "wrong");
  $("#fbAnswer").textContent = ok
    ? (q.kind === "card" ? "" : `${q.word.word} · ${q.word.meaning}`)
    : `${q.word.word}${q.word.phonetic ? " " + q.word.phonetic : ""} · ${q.word.meaning}`;
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
  confetti();
  sfx("done");
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
    ? list.map(w => `
      <div class="word-row">
        <div class="w-txt">
          <div><span class="w-en">${esc(w.word)}</span><span class="w-ph">${esc(w.phonetic)}</span></div>
          <div class="w-cn">${esc(w.meaning)}</div>
        </div>
        <span class="w-badge">再对 ${DB.states[w.id].wrong} 次</span>
        <button class="spk" data-spk="${w.id}">🔊</button>
      </div>`).join("")
    : `<div class="empty"><span class="emoji">🎯</span>还没有错词<br>答错的单词会自动收录到这里</div>`;
}
$("#wrongList").addEventListener("click", e => {
  const b = e.target.closest("[data-spk]");
  if (b) playAudio(Number(b.dataset.spk), b);
});
$("#drillBtn").onclick = startDrill;
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
  renderHome();
  showPage("home");
  setTimeout(() => $("#boot").classList.add("hide"), 250);
  if (DB.profile.autoAudio) preloadNextAudio();
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
