/* ================= 单词游戏：配对 / 听音配对 / 每日挑战 ================= */
const Game = (() => {
  const MODES = {
    pair:   { name: "单词配对", desc: "英文 ↔ 中文，60 秒", time: 60, icon: "🔤" },
    listen: { name: "听音配对", desc: "听发音 ↔ 中文，75 秒", time: 75, icon: "🔊" },
    daily:  { name: "每日挑战", desc: "每天固定词组，一天一次", time: 75, icon: "🏆" },
  };
  const PAIRS = 6;
  let G = null;

  function ensureProfile() {
    const p = DB.profile;
    p.gameBest = p.gameBest || {};
    p.gameBest.pair = p.gameBest.pair || { pairs: 0, time: 0 };
    p.gameBest.listen = p.gameBest.listen || { pairs: 0, time: 0 };
    p.challenge = p.challenge || {};
    p.gameDaily = p.gameDaily || { date: "", count: 0 };
    p.counters = p.counters || {};
    p.counters.gamePairs = p.counters.gamePairs || 0;
  }

  /* ---------- 选词 ---------- */
  function pickWords(n, mode) {
    const learned = WORDS.filter(w => isLearned(w.id));
    let base = learned.length >= n ? learned : WORDS.slice(0, 24);
    if (mode === "daily") base = learned.length >= n ? learned : WORDS.slice(0, 40);
    const short = base.filter(w => w.meaning.length <= 16 && w.word.length <= 20);
    const pool = short.length >= n ? short : base;
    if (mode === "daily") return seededShuffle(pool, dateSeed()).slice(0, n);
    return shuffle(pool).slice(0, n);
  }
  const dateSeed = () => Number(today().replace(/-/g, ""));
  function seededShuffle(arr, seed) {
    const r = [...arr];
    let s = seed % 233280;
    const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }

  /* ---------- 菜单 ---------- */
  function openMenu() {
    ensureProfile();
    const old = $("#gameMenu");
    if (old) old.remove();
    const p = DB.profile;
    const menu = document.createElement("div");
    menu.id = "gameMenu";
    menu.className = "game-menu";
    menu.innerHTML = `
      <div class="gm-card">
        <div class="gm-head"><h2>选择玩法</h2><button class="icon-btn" id="gmClose">✕</button></div>
        ${Object.entries(MODES).map(([k, m]) => {
          let sub = m.desc;
          if (k === "pair" && p.gameBest.pair.pairs) sub = `最佳 ${p.gameBest.pair.pairs} 对 · 剩余 ${p.gameBest.pair.time} 秒`;
          if (k === "listen" && p.gameBest.listen.pairs) sub = `最佳 ${p.gameBest.listen.pairs} 对 · 剩余 ${p.gameBest.listen.time} 秒`;
          if (k === "daily") {
            const todayRec = p.challenge[today()];
            sub = todayRec ? `今日最佳 ${todayRec.score} 分` : "今天还没挑战";
          }
          return `<button class="gm-mode" data-mode="${k}">
            <span class="gm-ico">${m.icon}</span>
            <span class="gm-meta"><b>${m.name}</b><small>${sub}</small></span>
            <span class="gm-arrow">›</span>
          </button>`;
        }).join("")}
        <div id="dailyBoard" class="daily-board"></div>
      </div>`;
    document.body.appendChild(menu);
    renderBoard();
    $("#gmClose").onclick = () => menu.remove();
    menu.querySelectorAll(".gm-mode").forEach(btn => {
      btn.onclick = () => { menu.remove(); start(btn.dataset.mode); };
    });
    menu.addEventListener("click", e => { if (e.target === menu) menu.remove(); });
  }

  function renderBoard() {
    const host = $("#dailyBoard");
    if (!host) return;
    const rows = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const ds = dateStr(d);
      const rec = DB.profile.challenge[ds];
      if (rec) rows.push({ ds, ...rec });
    }
    rows.sort((a, b) => b.score - a.score);
    host.innerHTML = `
      <div class="board-title">🏆 最近 7 天挑战榜</div>
      ${rows.length ? rows.map((r, i) => `
        <div class="board-row">
          <span class="board-rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
          <span class="board-date">${r.ds.slice(5)}</span>
          <span class="board-score">${r.score} 分</span>
          <span class="board-pairs">${r.pairs} 对</span>
        </div>`).join("")
      : `<p class="fine">还没有挑战记录，今天来试试吧</p>`}`;
  }

  /* ---------- 开始一局 ---------- */
  function start(mode = "pair") {
    ensureProfile();
    const cfg = MODES[mode] || MODES.pair;
    const ws = pickWords(PAIRS, mode);
    if (ws.length < 4) return toast("先学几个单词再来玩吧");
    const left = ws.map(w => mode === "listen"
      ? { pid: w.id, kind: "audio", text: "🔊" }
      : { pid: w.id, kind: "en", text: w.word });
    const right = ws.map(w => ({ pid: w.id, kind: "cn", text: w.meaning }));
    G = {
      mode, cards: [...shuffle(left), ...shuffle(right)], total: ws.length, sel: [], matched: 0,
      time: cfg.time, combo: 0, maxCombo: 0, over: false, timer: null, locked: false,
    };
    $("#game").classList.add("open");
    $(".game-title").textContent = cfg.name;
    $("#gameOver").innerHTML = "";
    $("#gameOver").classList.remove("show");
    $(".game-hint").textContent = mode === "listen"
      ? "先点 🔊 听发音，再点对应的中文"
      : "先点一张英文卡，再点它对应的中文";
    renderGrid();
    updateHUD();
    $("#gameTimer").classList.remove("low");
    clearInterval(G.timer);
    G.timer = setInterval(() => {
      if (!G || G.over) return;
      G.time -= 1;
      updateHUD();
      if (G.time <= 0) finish(false);
    }, 1000);
    sfx("tap");
  }

  function renderGrid() {
    const cell = i => {
      const c = G.cards[i];
      return `<button class="gcard ${c.kind}" data-i="${i}"><span>${esc(c.text)}</span></button>`;
    };
    const left = Array.from({ length: G.total }, (_, k) => cell(k)).join("");
    const right = Array.from({ length: G.total }, (_, k) => cell(k + G.total)).join("");
    $("#gameGrid").innerHTML = `<div class="gcol">${left}</div><div class="gcol">${right}</div>`;
  }

  function updateHUD() {
    if (!G) return;
    $("#gameTimer").textContent = Math.max(0, G.time);
    $("#gameTimer").classList.toggle("low", G.time <= 10);
    $("#gameProgress").textContent = `${G.matched} / ${G.total} 对`;
    $("#gameCombo").textContent = G.combo >= 2 ? `🔥 连击 x${G.combo}` : "";
  }

  const paint = (i, cls) => $(`.gcard[data-i="${i}"]`)?.classList.add(cls);
  const unpaint = (i, cls) => $(`.gcard[data-i="${i}"]`)?.classList.remove(cls);

  function onCard(i) {
    if (!G || G.over || G.locked) return;
    const card = G.cards[i];
    if (card.matched || G.sel.includes(i)) return;
    if (card.kind === "audio") playAudio(card.pid);

    if (!G.sel.length) {
      G.sel = [i];
      paint(i, "sel");
      sfx("tap");
      return;
    }

    const a = G.sel[0];
    const A = G.cards[a];
    G.sel.push(i);
    paint(i, "sel");
    G.locked = true;

    const isPair = A.pid === card.pid && A.kind !== card.kind;
    if (isPair) {
      setTimeout(() => {
        A.matched = card.matched = true;
        [a, i].forEach(k => { unpaint(k, "sel"); paint(k, "matched"); });
        G.matched += 1;
        G.combo += 1;
        G.maxCombo = Math.max(G.maxCombo, G.combo);
        if (G.combo >= 3) {
          G.time = Math.min(120, G.time + 2);
          floatText("+2 秒");
        }
        sfx("ok");
        if (G.combo === 5) speakKind("game");
        G.sel = [];
        G.locked = false;
        updateHUD();
        if (G.matched >= G.total) finish(true);
      }, 200);
    } else {
      G.combo = 0;
      G.time = Math.max(0, G.time - 1);
      paint(a, "wrong");
      paint(i, "wrong");
      sfx("bad");
      setTimeout(() => {
        [a, i].forEach(k => { unpaint(k, "wrong"); unpaint(k, "sel"); });
        G.sel = [];
        G.locked = false;
        updateHUD();
      }, 450);
    }
  }

  function floatText(txt) {
    const el = document.createElement("div");
    el.className = "float-bonus";
    el.textContent = txt;
    $("#game").appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /* ---------- 结算 ---------- */
  function finish(clear) {
    if (!G || G.over) return;
    G.over = true;
    clearInterval(G.timer);
    const p = DB.profile;
    const mode = G.mode;

    // 每日前 5 局全额星星，之后固定 5 星
    const t = today();
    if (p.gameDaily.date !== t) p.gameDaily = { date: t, count: 0 };
    p.gameDaily.count += 1;
    const full = p.gameDaily.count <= 5;
    let stars = G.matched * 4 + (clear ? 10 + Math.floor(G.time / 3) : 0);
    if (!full) stars = 5;
    if (stars > 0) Buddy.addStars(stars);

    p.counters.gamePairs = (p.counters.gamePairs || 0) + G.matched;

    let recordText = "", score = 0;
    if (mode === "daily") {
      score = G.matched * 10 + (clear ? Math.max(0, G.time) : 0);
      const prev = p.challenge[t];
      if (!prev || score > prev.score) p.challenge[t] = { score, pairs: G.matched, time: G.time };
      // 只保留最近 14 天
      const keys = Object.keys(p.challenge).sort();
      while (keys.length > 14) delete p.challenge[keys.shift()];
      const bestToday = p.challenge[t];
      recordText = `今日最佳：${bestToday.score} 分`;
    } else {
      const best = p.gameBest[mode];
      const newRecord = G.matched > best.pairs || (G.matched === best.pairs && clear && G.time > best.time);
      if (newRecord) {
        p.gameBest[mode] = {
          pairs: G.matched,
          time: G.matched === best.pairs ? Math.max(G.time, best.time) : G.time,
        };
        recordText = "🏅 新纪录！";
      }
    }
    save(true);
    Buddy.checkAchievements();

    const go = $("#gameOver");
    go.innerHTML = `
      <div class="go-card">
        <div class="go-icon">${clear ? "🎉" : "⏰"}</div>
        <h2>${clear ? "全部配对成功！" : "时间到！"}</h2>
        <p>配对 <b>${G.matched} / ${G.total}</b> 对${clear ? ` · 剩余 ${G.time} 秒` : ""} · 最高连击 x${G.maxCombo}</p>
        ${mode === "daily" ? `<div class="go-score">${score} 分</div>` : ""}
        <div class="go-stars">⭐ +${stars}</div>
        ${recordText ? `<p class="go-record">${recordText}</p>` : ""}
        ${!full ? `<p class="fine">今天已经玩了好几局，星星减半啦</p>` : ""}
        <button class="btn btn-green btn-block" id="gameAgain">再玩一次</button>
        <button class="btn btn-blue btn-block" id="gameMenuBtn">换一种玩法</button>
        <button class="btn btn-ghost btn-block" id="gameBack">回到首页</button>
      </div>`;
    go.classList.add("show");
    sfx(clear ? "done" : "bad");
    if (clear) confetti();
    $("#gameAgain").onclick = () => start(mode);
    $("#gameMenuBtn").onclick = () => { close(); openMenu(); };
    $("#gameBack").onclick = close;
  }

  function close() {
    if (G) clearInterval(G.timer);
    G = null;
    $("#game").classList.remove("open");
    $("#gameOver").classList.remove("show");
    renderEntry();
  }

  function renderEntry() {
    ensureProfile();
    const b = DB.profile.gameBest.pair;
    const el = $("#gameSub");
    if (el) el.textContent = b.pairs ? `最佳 ${b.pairs} 对 · 剩余 ${b.time} 秒` : "3 种玩法：配对 / 听音 / 每日挑战";
  }

  /* ---------- 事件 ---------- */
  function bind() {
    document.getElementById("gameGrid").addEventListener("click", e => {
      const c = e.target.closest(".gcard");
      if (c) onCard(Number(c.dataset.i));
    });
    document.getElementById("gameQuit").addEventListener("click", () => {
      if (G && !G.over && G.matched > 0 && !confirm("退出这一局？本局成绩不会保存。")) return;
      close();
    });
    document.getElementById("playGame").addEventListener("click", openMenu);
  }
  document.addEventListener("DOMContentLoaded", bind);

  return { start, close, openMenu, renderEntry, ensureProfile, _state: () => G };
})();
