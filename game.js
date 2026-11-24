/* ================= 单词配对小游戏 ================= */
const Game = (() => {
  const DURATION = 60;
  const PAIRS = 8;
  let G = null;

  function ensureProfile() {
    const p = DB.profile;
    p.gameBest = p.gameBest || { pairs: 0, time: 0 };
    p.gameDaily = p.gameDaily || { date: "", count: 0 };
    p.counters = p.counters || {};
    p.counters.gamePairs = p.counters.gamePairs || 0;
  }

  /** 选 8 个可以放进卡片的词：优先已学、释义不要太长 */
  function pickWords(n) {
    const learned = WORDS.filter(w => isLearned(w.id));
    const base = learned.length >= n ? learned : WORDS.slice(0, 24);
    const short = base.filter(w => w.meaning.length <= 16 && w.word.length <= 20);
    const pool = short.length >= n ? short : base;
    return shuffle(pool).slice(0, n);
  }

  function start() {
    ensureProfile();
    const ws = pickWords(PAIRS);
    if (ws.length < 4) return toast("先学几个单词再来玩吧");
    const cards = [];
    ws.forEach(w => {
      cards.push({ pid: w.id, kind: "en", text: w.word });
      cards.push({ pid: w.id, kind: "cn", text: w.meaning });
    });
    G = {
      cards: shuffle(cards), total: ws.length, sel: [], matched: 0,
      time: DURATION, combo: 0, maxCombo: 0, over: false, timer: null, locked: false,
    };
    $("#game").classList.add("open");
    $("#gameOver").innerHTML = "";
    $("#gameOver").classList.remove("show");
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
  }

  function renderGrid() {
    const grid = $("#gameGrid");
    grid.innerHTML = G.cards.map((c, i) => `
      <button class="gcard ${c.kind}" data-i="${i}">
        <span>${esc(c.text)}</span>
      </button>`).join("");
  }

  function updateHUD() {
    if (!G) return;
    $("#gameTimer").textContent = Math.max(0, G.time);
    $("#gameTimer").classList.toggle("low", G.time <= 10);
    $("#gameProgress").textContent = `${G.matched} / ${G.total} 对`;
    const c = $("#gameCombo");
    c.textContent = G.combo >= 2 ? `🔥 连击 x${G.combo}` : "";
  }

  function paint(i, cls) {
    $(`.gcard[data-i="${i}"]`)?.classList.add(cls);
  }
  function unpaint(i, cls) {
    $(`.gcard[data-i="${i}"]`)?.classList.remove(cls);
  }

  function onCard(i) {
    if (!G || G.over || G.locked) return;
    const card = G.cards[i];
    if (card.matched || G.sel.includes(i)) return;

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
        paint(a, "matched");
        paint(i, "matched");
        G.matched += 1;
        G.combo += 1;
        G.maxCombo = Math.max(G.maxCombo, G.combo);
        if (G.combo >= 3) {
          G.time = Math.min(99, G.time + 2);
          floatText("+2 秒");
        }
        sfx("ok");
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
        unpaint(a, "wrong");
        unpaint(i, "wrong");
        unpaint(a, "sel");
        unpaint(i, "sel");
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

  function finish(clear) {
    if (!G || G.over) return;
    G.over = true;
    clearInterval(G.timer);
    const p = DB.profile;

    // 每日前 5 局全额，之后固定 5 星，避免刷星星
    const t = today();
    if (p.gameDaily.date !== t) p.gameDaily = { date: t, count: 0 };
    p.gameDaily.count += 1;
    const full = p.gameDaily.count <= 5;
    let stars = G.matched * 4 + (clear ? 10 + Math.floor(G.time / 3) : 0);
    if (!full) stars = 5;
    if (stars > 0) Buddy.addStars(stars);

    p.counters.gamePairs = (p.counters.gamePairs || 0) + G.matched;
    const best = p.gameBest;
    const newRecord = G.matched > best.pairs || (G.matched === best.pairs && clear && G.time > best.time);
    if (newRecord) p.gameBest = { pairs: G.matched, time: G.matched === best.pairs ? Math.max(G.time, best.time) : G.time };
    save(true);
    Buddy.checkAchievements();

    const go = $("#gameOver");
    go.innerHTML = `
      <div class="go-card">
        <div class="go-icon">${clear ? "🎉" : "⏰"}</div>
        <h2>${clear ? "全部配对成功！" : "时间到！"}</h2>
        <p>配对 <b>${G.matched} / ${G.total}</b> 对${clear ? ` · 剩余 ${G.time} 秒` : ""} · 最高连击 x${G.maxCombo}</p>
        <div class="go-stars">⭐ +${stars}</div>
        ${newRecord ? `<p class="go-record">🏅 新纪录！</p>` : ""}
        ${!full ? `<p class="fine">今天已经玩了好几局，星星减半啦，明天再来赚更多</p>` : ""}
        <button class="btn btn-green btn-block" id="gameAgain">再玩一次</button>
        <button class="btn btn-ghost btn-block" id="gameBack">回到首页</button>
      </div>`;
    go.classList.add("show");
    sfx(clear ? "done" : "bad");
    if (clear) confetti();
    $("#gameAgain").onclick = start;
    $("#gameBack").onclick = close;
  }

  function close() {
    if (!G) return;
    clearInterval(G.timer);
    G = null;
    $("#game").classList.remove("open");
    $("#gameOver").classList.remove("show");
    renderEntry();
  }

  function renderEntry() {
    ensureProfile();
    const b = DB.profile.gameBest || { pairs: 0, time: 0 };
    const el = $("#gameSub");
    if (el) el.textContent = b.pairs
      ? `最佳：${b.pairs} 对 · 剩余 ${b.time} 秒`
      : "限时 60 秒，配对 8 个单词";
  }

  /* ---------- 事件（等 DOM 与公共函数就绪后再绑定） ---------- */
  function bind() {
    document.getElementById("gameGrid").addEventListener("click", e => {
      const c = e.target.closest(".gcard");
      if (c) onCard(Number(c.dataset.i));
    });
    document.getElementById("gameQuit").addEventListener("click", () => {
      if (G && !G.over && G.matched > 0 && !confirm("退出这一局？本局成绩不会保存。")) return;
      close();
    });
    document.getElementById("playGame").addEventListener("click", start);
  }
  document.addEventListener("DOMContentLoaded", bind);

  return { start, close, renderEntry, ensureProfile };
})();
