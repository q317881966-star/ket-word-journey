/* ================= 学习伙伴「小绿龙」 ================= */
const Buddy = (() => {
  const HATS = {
    none:  { name: "不戴", price: 0, emoji: "✨" },
    cap:   { name: "运动帽", price: 80,  emoji: "🧢" },
    crown: { name: "小皇冠", price: 200, emoji: "👑" },
    wiz:   { name: "魔法帽", price: 150, emoji: "🎩" },
  };
  const SCARFS = {
    none:  { name: "不戴", price: 0, emoji: "✨" },
    red:   { name: "红围巾", price: 60,  emoji: "🧣" },
    blue:  { name: "蓝围巾", price: 60,  emoji: "🧣" },
    rainbow: { name: "彩虹围巾", price: 180, emoji: "🌈" },
  };
  const BGS = {
    none:  { name: "草地", price: 0, cls: "bg-grass", emoji: "🌱" },
    forest:{ name: "森林", price: 100, cls: "bg-forest", emoji: "🌲" },
    space: { name: "太空", price: 160, cls: "bg-space", emoji: "🚀" },
    sea:   { name: "海边", price: 120, cls: "bg-sea", emoji: "🌊" },
  };

  const ACHIEVEMENTS = [
    { id: "first", icon: "🐣", name: "破壳而出", desc: "学会第一个单词", reward: 20, need: () => learnedCount() >= 1 },
    { id: "w10", icon: "🌱", name: "小试牛刀", desc: "学会 10 个单词", reward: 30, need: () => learnedCount() >= 10 },
    { id: "w50", icon: "🌿", name: "渐入佳境", desc: "学会 50 个单词", reward: 50, need: () => learnedCount() >= 50 },
    { id: "w100", icon: "🌳", name: "百词斩", desc: "学会 100 个单词", reward: 80, need: () => learnedCount() >= 100 },
    { id: "w300", icon: "🏔️", name: "词汇登山者", desc: "学会 300 个单词", reward: 120, need: () => learnedCount() >= 300 },
    { id: "w500", icon: "🚀", name: "半程火箭", desc: "学会 500 个单词", reward: 200, need: () => learnedCount() >= 500 },
    { id: "w1000", icon: "👑", name: "千词王者", desc: "学会 1000 个单词", reward: 300, need: () => learnedCount() >= 1000 },
    { id: "streak3", icon: "🔥", name: "三日不断", desc: "连续打卡 3 天", reward: 30, need: () => DB.profile.streak >= 3 },
    { id: "streak7", icon: "🔥", name: "一周坚持", desc: "连续打卡 7 天", reward: 60, need: () => DB.profile.streak >= 7 },
    { id: "streak30", icon: "🏆", name: "月度冠军", desc: "连续打卡 30 天", reward: 200, need: () => DB.profile.streak >= 30 },
    { id: "perfect", icon: "💯", name: "全对一次", desc: "一次练习 10 题以上全对", reward: 50, need: () => (DB.profile.counters.perfect || 0) >= 1 },
    { id: "spell50", icon: "✍️", name: "拼写高手", desc: "拼写题累计答对 50 次", reward: 80, need: () => (DB.profile.counters.spell || 0) >= 50 },
    { id: "review200", icon: "🔁", name: "复习达人", desc: "累计复习 200 次", reward: 100, need: () => (DB.profile.counters.review || 0) >= 200 },
    { id: "chest7", icon: "🎁", name: "开箱达人", desc: "开满 7 次宝箱", reward: 80, need: () => (DB.profile.counters.chest || 0) >= 7 },
    { id: "speak10", icon: "🎤", name: "小小播音员", desc: "跟读 10 次", reward: 50, need: () => (DB.profile.counters.speak || 0) >= 10 },
    { id: "match100", icon: "🧩", name: "配对高手", desc: "累计配对 100 对", reward: 100, need: () => (DB.profile.counters.gamePairs || 0) >= 100 },
  ];

  const LINES = {
    correct: ["太厉害了，{n}！", "完全正确，{n} 真棒！", "小绿龙惊呆了！", "这题难不倒你！", "{n} 越来越厉害了！", "答对啦，给你一颗小星星 ⭐"],
    wrong: ["没关系，{n}，我们再记一次～", "差一点点，小绿龙陪你再来！", "这个单词有点调皮，抓住它！", "别灰心，记住它下次就会啦！", "深呼吸，我们再看一遍～"],
    idle: ["今天也要加油呀，{n}！", "小绿龙在等你一起闯关～", "学 10 个新词，我就长大一点！", "{n}，我们出发吧！"],
    chest: ["哇！宝箱里有好东西！", "开箱成功！继续加油～"],
    levelup: ["我长大啦！谢谢 {n}！", "升级成功！小绿龙变强了！"],
  };

  const pickLine = arr => arr[Math.floor(Math.random() * arr.length)].replace(/\{n\}/g, learnerName());

  function learnerName() {
    return (DB?.profile?.name || "ZOE").trim() || "ZOE";
  }

  /** 补齐老用户的字段 */
  function init() {
    const p = DB.profile;
    p.name = p.name || "ZOE";
    p.stars = p.stars || 0;
    p.buddy = Object.assign({ owned: [], equipHat: "none", equipScarf: "none", equipBg: "none", lastStage: 1 }, p.buddy || {});
    p.achievements = p.achievements || [];
    p.chestDate = p.chestDate || null;
    p.counters = Object.assign({ perfect: 0, spell: 0, review: 0, chest: 0, speak: 0 }, p.counters || {});
    save();
    // 首次进入也检查一次（老用户可能已满足成就条件）
    setTimeout(() => checkAchievements(), 900);
  }

  /* ---------- 成长阶段 ---------- */
  function stage() {
    const n = learnedCount();
    if (n < 1) return 1;       // 蛋
    if (n < 100) return 2;     // 幼龙
    if (n < 500) return 3;     // 少年龙
    return 4;                  // 飞龙
  }
  const STAGE_NAME = { 1: "小龙蛋", 2: "小绿龙", 3: "少年龙", 4: "飞龙" };
  function stageProgress() {
    const n = learnedCount();
    if (n < 1) return { cur: n, target: 1, text: "学会第 1 个单词就能孵出来" };
    if (n < 100) return { cur: n, target: 100, text: `再学 ${100 - n} 个词进化成少年龙` };
    if (n < 500) return { cur: n, target: 500, text: `再学 ${500 - n} 个词进化成飞龙` };
    return { cur: n, target: n, text: "已经是最强形态啦！" };
  }

  /* ---------- 小恐龙 SVG ---------- */
  function dragonSVG() {
    const s = stage();
    if (s === 1) return eggSVG();
    const wing = s >= 4
      ? `<path d="M52 128 Q18 92 34 70 Q46 92 60 104z" fill="#4CAF50" opacity=".9"/>
         <path d="M168 128 Q202 92 186 70 Q174 92 160 104z" fill="#4CAF50" opacity=".9"/>`
      : "";
    const horns = s >= 3
      ? `<path d="M88 46 l6 -18 8 16z" fill="#FFC800"/><path d="M132 46 l-6 -18 -8 16z" fill="#FFC800"/>`
      : "";
    const spikes = s >= 3
      ? `<path d="M104 62 l6 -12 6 12z" fill="#4CAF50"/><path d="M96 72 l-8 -10 12 -2z" fill="#4CAF50"/><path d="M124 72 l8 -10 -12 -2z" fill="#4CAF50"/>`
      : "";
    return `
    <svg viewBox="0 0 220 210" class="dragon" aria-label="小绿龙">
      ${wing}
      <ellipse cx="110" cy="192" rx="58" ry="11" fill="rgba(0,0,0,.10)"/>
      <path d="M62 152 Q28 150 24 124 Q38 134 52 136" fill="#4CAF50"/>
      <ellipse cx="86" cy="183" rx="17" ry="9" fill="#4CAF50"/>
      <ellipse cx="134" cy="183" rx="17" ry="9" fill="#4CAF50"/>
      <ellipse cx="110" cy="140" rx="52" ry="48" fill="#6EDB3A"/>
      <ellipse cx="110" cy="150" rx="34" ry="31" fill="#D7FFB8"/>
      <ellipse cx="59" cy="142" rx="10" ry="15" fill="#6EDB3A" transform="rotate(18 59 142)"/>
      <ellipse cx="161" cy="142" rx="10" ry="15" fill="#6EDB3A" transform="rotate(-18 161 142)"/>
      ${spikes}
      <ellipse cx="110" cy="82" rx="45" ry="41" fill="#6EDB3A"/>
      ${horns}
      <circle cx="94" cy="78" r="11" fill="#fff"/><circle cx="96" cy="80" r="5.2" fill="#26282b"/>
      <circle cx="126" cy="78" r="11" fill="#fff"/><circle cx="128" cy="80" r="5.2" fill="#26282b"/>
      <circle cx="92" cy="76" r="1.8" fill="#fff"/><circle cx="124" cy="76" r="1.8" fill="#fff"/>
      <ellipse cx="77" cy="95" rx="7.5" ry="4.2" fill="#ff9fb3" opacity=".65"/>
      <ellipse cx="143" cy="95" rx="7.5" ry="4.2" fill="#ff9fb3" opacity=".65"/>
      <path d="M101 96 q9 9 18 0" stroke="#2f6a00" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      ${hatSVG()}
      ${scarfSVG()}
    </svg>`;
  }

  function eggSVG() {
    return `
    <svg viewBox="0 0 220 210" class="dragon egg">
      <ellipse cx="110" cy="188" rx="46" ry="9" fill="rgba(0,0,0,.10)"/>
      <path d="M110 34 C74 34 56 92 56 128 C56 166 80 186 110 186 C140 186 164 166 164 128 C164 92 146 34 110 34z" fill="#FFF8E7" stroke="#EBD9B4" stroke-width="3"/>
      <path d="M74 104 q12 12 24 0 q12 12 24 0 q12 12 24 0" stroke="#7ED321" stroke-width="6" fill="none" stroke-linecap="round" opacity=".85"/>
      <path d="M82 140 q10 10 20 0 q10 10 20 0" stroke="#7ED321" stroke-width="6" fill="none" stroke-linecap="round" opacity=".55"/>
      <ellipse cx="92" cy="78" rx="6" ry="9" fill="#fff" opacity=".8"/>
      <text x="110" y="120" text-anchor="middle" font-size="22">🥚</text>
    </svg>`;
  }

  function hatSVG() {
    const h = DB.profile.buddy.equipHat;
    if (h === "cap") return `<path d="M78 46 q32 -22 64 0 l4 8 l-72 0z" fill="#1CB0F6"/><path d="M138 54 q22 2 22 10 l-24 0z" fill="#1899D6"/>`;
    if (h === "crown") return `<path d="M84 46 l8 -22 8 14 10 -20 10 20 8 -14 8 22z" fill="#FFC800" stroke="#E5A900" stroke-width="2"/>`;
    if (h === "wiz") return `<path d="M110 6 L142 54 L78 54 Z" fill="#7C4DFF"/><path d="M78 54 l64 0 l4 8 l-72 0z" fill="#5E35B1"/><circle cx="110" cy="20" r="3" fill="#FFC800"/>`;
    return "";
  }
  function scarfSVG() {
    const s = DB.profile.buddy.equipScarf;
    const c = s === "red" ? "#FF4B4B" : s === "blue" ? "#1CB0F6" : s === "rainbow" ? "url(#rainbow)" : null;
    if (!c) return "";
    return `<defs><linearGradient id="rainbow" x1="0" x2="1">
      <stop offset="0" stop-color="#FF4B4B"/><stop offset=".3" stop-color="#FFC800"/>
      <stop offset=".6" stop-color="#58CC02"/><stop offset="1" stop-color="#1CB0F6"/>
    </linearGradient></defs>
    <path d="M72 112 q38 18 76 0 l0 14 q-38 18 -76 0z" fill="${c}"/>
    <path d="M136 122 l10 26 l-12 0 l-6 -22z" fill="${c}"/>`;
  }

  /* ---------- 星星 ---------- */
  function addStars(n) {
    DB.profile.stars = Math.max(0, (DB.profile.stars || 0) + n);
    const el = $("#starBalance");
    if (el) el.textContent = `⭐ ${DB.profile.stars}`;
    save();
    return DB.profile.stars;
  }

  /* ---------- 页面渲染 ---------- */
  function render() {
    const p = DB.profile;
    const s = stage();
    const pr = stageProgress();
    const bg = BGS[p.buddy.equipBg] || BGS.none;
    $("#buddyStage").className = `buddy-stage ${bg.cls}`;
    $("#buddyStage").innerHTML = `
      <div class="buddy-bubble">${esc(pickLine(LINES.idle))}</div>
      <div class="buddy-art">${dragonSVG()}</div>
      <div class="buddy-name">${esc(learnerName())} 的 ${STAGE_NAME[s]}</div>`;

    const pct = s === 1 ? 0 : Math.min(100, Math.round(pr.cur / pr.target * 100));
    $("#buddyInfo").innerHTML = `
      <div class="card buddy-info-card">
        <div class="row"><span>⭐ 我的星星</span><b>${p.stars || 0}</b></div>
        <div class="row" style="display:block">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span>成长进度</span><b>${pr.cur} / ${pr.target}</b>
          </div>
          <div class="progress"><i style="width:${pct}%"></i></div>
          <p class="fine" style="text-align:left;margin:8px 0 0">${pr.text}</p>
        </div>
      </div>`;

    $("#starBalance").textContent = `⭐ ${p.stars || 0}`;
    renderShop();
    renderAchievements();
  }

  function itemCard(slot, id, item, equipped, owned) {
    const isNone = id === "none";
    let btn;
    if (isNone) btn = equipped ? `<span class="shop-tag on">使用中</span>` : `<button class="btn btn-ghost btn-sm" data-equip="${slot}:none">使用</button>`;
    else if (equipped) btn = `<span class="shop-tag on">使用中</span>`;
    else if (owned) btn = `<button class="btn btn-blue btn-sm" data-equip="${slot}:${id}">换上</button>`;
    else btn = `<button class="btn btn-green btn-sm" data-buy="${slot}:${id}">⭐ ${item.price}</button>`;
    return `<div class="shop-item ${equipped ? "equipped" : ""}">
      <div class="shop-emoji">${item.emoji || "🌿"}</div>
      <div class="shop-meta"><b>${item.name}</b>${isNone ? "" : `<small>${owned ? "已拥有" : item.price + " 星"}</small>`}</div>
      ${btn}
    </div>`;
  }

  function renderShop() {
    const b = DB.profile.buddy;
    const owned = id => b.owned.includes(id);
    const blocks = [
      ["帽子", "hat", HATS, b.equipHat],
      ["围巾", "scarf", SCARFS, b.equipScarf],
      ["场景", "bg", BGS, b.equipBg],
    ];
    $("#shop").innerHTML = blocks.map(([label, slot, list, eq]) => `
      <div class="shop-group">
        <div class="shop-label">${label}</div>
        ${Object.entries(list).map(([id, it]) => itemCard(slot, id, it, eq === id, owned(id))).join("")}
      </div>`).join("");
  }

  function renderAchievements() {
    const done = DB.profile.achievements;
    $("#achievementCount").textContent = `${done.length} / ${ACHIEVEMENTS.length}`;
    $("#achievements").innerHTML = ACHIEVEMENTS.map(a => `
      <div class="ach ${done.includes(a.id) ? "unlocked" : ""}" title="${a.desc}">
        <span class="ach-icon">${done.includes(a.id) ? a.icon : "🔒"}</span>
        <b>${a.name}</b>
        <small>${a.desc}</small>
      </div>`).join("");
  }

  /* ---------- 商店交互 ---------- */
  document.addEventListener("click", e => {
    const buy = e.target.closest("[data-buy]");
    if (buy) {
      const [slot, id] = buy.dataset.buy.split(":");
      const item = ({ hat: HATS, scarf: SCARFS, bg: BGS })[slot][id];
      if (!item) return;
      if ((DB.profile.stars || 0) < item.price) return toast("星星还不够，再学几个单词吧！");
      if (!confirm(`用 ${item.price} 颗星星买「${item.name}」？`)) return;
      addStars(-item.price);
      DB.profile.buddy.owned.push(id);
      equip(slot, id);
      sfx("ok");
      toast(`买到啦！已给伙伴换上「${item.name}」`);
      return;
    }
    const eq = e.target.closest("[data-equip]");
    if (eq) {
      const [slot, id] = eq.dataset.equip.split(":");
      equip(slot, id);
      sfx("ok");
    }
  });

  function equip(slot, id) {
    const b = DB.profile.buddy;
    if (slot === "hat") b.equipHat = id;
    if (slot === "scarf") b.equipScarf = id;
    if (slot === "bg") b.equipBg = id;
    save();
    render();
  }

  /* ---------- 答题钩子 ---------- */
  function onAnswer(correct, q) {
    const p = DB.profile;
    const word = q?.word;
    if (correct) {
      addStars(2);
      if (q?.kind === "spell") p.counters.spell = (p.counters.spell || 0) + 1;
      if (word && !(session?.newIds || []).includes(word.id)) p.counters.review = (p.counters.review || 0) + 1;
    }
    save();
    checkAchievements();
  }

  function onSessionEnd(s) {
    if (s.answered >= 10 && s.correct === s.answered) {
      DB.profile.counters.perfect = (DB.profile.counters.perfect || 0) + 1;
    }
    addStars(10);
    const before = DB.profile.buddy.lastStage || 1;
    const now = stage();
    if (now > before) {
      DB.profile.buddy.lastStage = now;
      toast(`🎉 进化成功！现在是「${STAGE_NAME[now]}」！`);
      sfx("done");
      speakKind("levelup");
    }
    save();
    checkAchievements();
  }

  /* ---------- 成就 ---------- */
  let achTimer = null;
  function checkAchievements() {
    if (achTimer) return;
    achTimer = setTimeout(() => {
      achTimer = null;
      const done = DB.profile.achievements;
      const newly = ACHIEVEMENTS.filter(a => !done.includes(a.id) && a.need());
      if (!newly.length) return;
      newly.forEach(a => {
        done.push(a.id);
        addStars(a.reward);
        queueUnlock(a);
      });
      save();
      renderAchievements();
    }, 300);
  }

  const unlockQueue = [];
  let unlockBusy = false;
  function queueUnlock(a) {
    unlockQueue.push(a);
    if (!unlockBusy) showNextUnlock();
  }
  function showNextUnlock() {
    const a = unlockQueue.shift();
    if (!a) { unlockBusy = false; return; }
    unlockBusy = true;
    const box = document.createElement("div");
    box.className = "unlock-overlay";
    box.innerHTML = `
      <div class="unlock-card">
        <div class="unlock-icon">${a.icon}</div>
        <h2>获得成就！</h2>
        <h3>${a.name}</h3>
        <p>${a.desc}</p>
        <div class="unlock-reward">⭐ +${a.reward}</div>
        <button class="btn btn-green btn-block">太棒了</button>
      </div>`;
    document.body.appendChild(box);
    sfx("done");
    confetti();
    box.querySelector("button").onclick = () => {
      box.remove();
      showNextUnlock();
    };
  }

  /* ---------- 每日宝箱 ---------- */
  function chestAvailable() {
    return DB.profile.chestDate !== today();
  }
  function renderChest() {
    const host = $("#chest");
    if (!host) return;
    if (!chestAvailable()) { host.innerHTML = ""; return; }
    host.innerHTML = `
      <div class="chest-card" id="chestCard">
        <div class="chest-art">🎁</div>
        <div class="chest-txt"><b>今日宝箱</b><span>点一下，看看里面有什么</span></div>
        <button class="btn btn-yellow btn-sm" id="openChest">开启</button>
      </div>`;
    $("#openChest").onclick = openChest;
  }
  function openChest() {
    if (!chestAvailable()) return;
    const r = Math.random();
    let msg;
    if (r < 0.55) {
      const n = 20 + Math.floor(Math.random() * 5) * 10;
      addStars(n);
      msg = `宝箱里有 ${n} 颗星星！⭐`;
    } else if (r < 0.8) {
      const pool = [...Object.keys(HATS), ...Object.keys(SCARFS)].filter(id => id !== "none" && !DB.profile.buddy.owned.includes(id));
      if (pool.length) {
        const id = pool[Math.floor(Math.random() * pool.length)];
        DB.profile.buddy.owned.push(id);
        const item = HATS[id] || SCARFS[id];
        msg = `宝箱里有一件「${item.name}」！去伙伴页换上吧`;
      } else {
        addStars(50);
        msg = "宝箱里有 50 颗星星！⭐";
      }
    } else {
      addStars(60);
      msg = "稀有宝箱！60 颗星星！⭐⭐";
    }
    DB.profile.chestDate = today();
    DB.profile.counters.chest = (DB.profile.counters.chest || 0) + 1;
    save(true);
    sfx("done");
    confetti();
    speakKind("chest");
    toast(msg);
    renderChest();
    checkAchievements();
    if (currentPage() === "buddy") render();
  }

  /* ---------- 跟读发音评测 ---------- */
  const SRClass = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  let mediaRecorder = null, chunks = [], recordedUrl = null;
  let sr = null;

  const normSpeech = s => (s || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  function similarity(said, target) {
    const a = normSpeech(said), b = normSpeech(target);
    if (!a) return 0;
    if (a === b) return 100;
    return Math.max(0, Math.round((1 - levenshtein(a, b) / Math.max(a.length, b.length)) * 100));
  }
  const scoreStars = sc => sc >= 90 ? 5 : sc >= 75 ? 4 : sc >= 55 ? 3 : sc >= 35 ? 2 : 1;
  const scoreLevel = sc => sc >= 90 ? "great" : sc >= 70 ? "good" : "try";
  function scorePraise(sc, heard) {
    if (!heard) return "没听清你说的，嘴巴离麦克风近一点再读一次～";
    if (sc >= 100) return "完美！和标准音一模一样！";
    if (sc >= 90) return "太标准了，发音很棒！";
    if (sc >= 75) return "很棒，已经很接近了！";
    if (sc >= 55) return "不错，再清楚一点就更好了";
    if (sc >= 35) return "我听到的是这样，靠近麦克风再试一次吧～";
    return "可能没听清，慢一点、大声一点再读一次～";
  }

  /** 跟读奖励：每天最多 30 星，防止刷星 */
  function rewardSpeech(stars) {
    const p = DB.profile, t = today();
    p.counters.speak = (p.counters.speak || 0) + 1;
    p.speakDaily = p.speakDaily || { date: "", count: 0, stars: 0 };
    if (p.speakDaily.date !== t) p.speakDaily = { date: t, count: 0, stars: 0 };
    const canReward = p.speakDaily.stars < 30;
    if (canReward) { addStars(stars); p.speakDaily.stars += stars; }
    save();
    checkAchievements();
    return canReward ? stars : 0;
  }

  function showSpeech(word) {
    const hasSR = !!SRClass();
    const canRec = !!navigator.mediaDevices?.getUserMedia && !!window.MediaRecorder;
    if (!hasSR && !canRec) return toast("这台设备不支持语音功能");

    $("#speechPanel")?.remove();
    const panel = document.createElement("div");
    panel.id = "speechPanel";
    panel.className = "speech-panel";
    panel.innerHTML = `
      <div class="speech-head">
        <b>🎤 跟读评测</b>
        <button class="icon-btn" id="speechClose">✕</button>
      </div>
      <div class="speech-word">${esc(word.word)} <small>${esc(word.phonetic)}</small></div>
      <div class="speech-actions">
        <button class="btn btn-blue btn-sm" id="speechListen">🔊 听标准音</button>
        <button class="btn btn-green btn-sm" id="speechRec">${hasSR ? "🎤 按住读" : "🎤 按住录音"}</button>
      </div>
      <div class="speech-status" id="speechStatus">${hasSR ? "按住麦克风，清楚地读出这个单词，松开后自动打分" : "按住麦克风读一遍，再回放对比"}</div>
      <div id="speechResult"></div>
      <div class="speech-actions" id="speechPlayRow" hidden>
        <button class="btn btn-ghost btn-sm" id="speechPlay">▶ 回放我的</button>
        <button class="btn btn-green btn-sm" id="speechGood">👍 读得不错</button>
        <button class="btn btn-ghost btn-sm" id="speechAgain">🔁 再来</button>
      </div>`;
    $("#qbody").appendChild(panel);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });

    const status = $("#speechStatus");
    const recBtn = $("#speechRec");
    $("#speechClose").onclick = () => { stopAll(); panel.remove(); };
    $("#speechListen").onclick = () => playAudio(word.id);

    /* --- 方式一：系统语音识别打分 --- */
    if (hasSR) {
      const startSR = () => {
        try {
          sr = new (SRClass())();
        } catch { return fallback(); }
        sr.lang = "en-GB";
        sr.interimResults = false;
        sr.maxAlternatives = 3;
        let handled = false;
        sr.onresult = e => {
          handled = true;
          const alts = [...e.results[0]].map(r => r.transcript);
          let best = { t: "", s: -1 };
          alts.forEach(t => { const sc = similarity(t, word.word); if (sc > best.s) best = { t, s: sc }; });
          showScore(best.t, best.s);
        };
        sr.onerror = err => {
          if (handled) return;
          handled = true;
          if (err.error === "no-speech") {
            status.textContent = "没听到声音，靠近麦克风再按一次～";
          } else {
            status.textContent = "系统识别暂时不可用，已切换到录音回放模式";
            fallback();
          }
        };
        sr.onend = () => { recBtn.textContent = hasSR ? "🎤 按住读" : "🎤 按住录音"; };
        status.textContent = "正在听…读完松开";
        recBtn.textContent = "🔴 松开结束";
        try { sr.start(); } catch { fallback(); }
      };

      function showScore(heard, score) {
        const stars = scoreStars(score);
        const got = rewardSpeech(stars);
        sfx(score >= 70 ? "ok" : "bad");
        $("#speechResult").innerHTML = `
          <div class="speech-result">
            <div class="score-badge" data-level="${scoreLevel(score)}">${score}<small>分</small></div>
            <p class="said">我听到的是：<b>${heard ? esc(heard) : "（没听清）"}</b></p>
            <p class="enc">${scorePraise(score, heard)}</p>
            <p class="fine">${got ? `获得 ⭐ ${got} 颗星星` : "今天的跟读星星已经拿满啦，明天继续"}</p>
            <button class="btn btn-blue btn-sm" id="speechRetry">🔁 再读一次</button>
          </div>`;
        status.textContent = "";
        $("#speechRetry").onclick = () => {
          $("#speechResult").innerHTML = "";
          status.textContent = "按住麦克风，再读一次";
        };
      }

      recBtn.addEventListener("pointerdown", e => { e.preventDefault(); startSR(); });
      recBtn.addEventListener("pointerup", () => { try { sr?.stop(); } catch {} });
      recBtn.addEventListener("pointerleave", () => { try { sr?.stop(); } catch {} });
      return;
    }

    /* --- 方式二：降级为录音回放 --- */
    fallback();

    function fallback() {
      recBtn.textContent = "🎤 按住录音";
      $("#speechPlayRow").hidden = true;
      $("#speechAgain").onclick = () => { recordedUrl = null; $("#speechPlayRow").hidden = true; status.textContent = "再按一次麦克风，大胆读出来～"; };
      $("#speechPlay").onclick = () => {
        if (!recordedUrl) return;
        new Audio(recordedUrl).play().catch(() => toast("回放失败"));
      };
      $("#speechGood").onclick = () => {
        const got = rewardSpeech(3);
        status.textContent = got ? "太棒了！奖励 3 颗星星 ⭐" : "今天的跟读星星已经拿满啦";
        sfx("ok");
      };
      if (recBtn.dataset.bound) return;
      recBtn.dataset.bound = "1";
      const start = async (e) => {
        e.preventDefault();
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          chunks = [];
          mediaRecorder = new MediaRecorder(stream);
          mediaRecorder.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
          mediaRecorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            if (!chunks.length) return;
            const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
            if (recordedUrl) URL.revokeObjectURL(recordedUrl);
            recordedUrl = URL.createObjectURL(blob);
            $("#speechPlayRow").hidden = false;
            status.textContent = "录好啦！回放听听，也可以直接点「读得不错」";
            recBtn.textContent = "🎤 按住录音";
          };
          mediaRecorder.start();
          recBtn.textContent = "🔴 松开结束";
          status.textContent = "正在录音…";
          setTimeout(() => { if (mediaRecorder?.state === "recording") stopAll(); }, 6000);
        } catch {
          toast("需要允许麦克风权限");
        }
      };
      recBtn.addEventListener("pointerdown", start);
      recBtn.addEventListener("pointerup", stopAll);
      recBtn.addEventListener("pointerleave", stopAll);
    }
  }
  function stopAll() {
    try { sr?.stop(); } catch {}
    if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  }

  /* ---------- 家长周报 ---------- */
  function openReport() {
    const box = $("#report");
    const body = $("#reportBody");
    const days = [];
    const now = new Date();
    const dow = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    let newSum = 0, revSum = 0, total = 0, correct = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const ds = dateStr(d);
      const rec = DB.days[ds] || { new: 0, rev: 0, total: 0, correct: 0 };
      if (d <= now) { newSum += rec.new || 0; revSum += rec.rev || 0; total += rec.total || 0; correct += rec.correct || 0; }
      days.push({ ds, rec, future: d > now, label: ["一", "二", "三", "四", "五", "六", "日"][i] });
    }
    const acc = total ? Math.round(correct / total * 100) : 0;
    const maxTotal = Math.max(1, ...days.map(d => d.rec.total || 0));
    const wrongTop = WORDS.filter(w => DB.states[w.id]?.wrong > 0)
      .sort((a, b) => (DB.states[b.id].wrong || 0) - (DB.states[a.id].wrong || 0))
      .slice(0, 10);

    body.innerHTML = `
      <p class="report-sub">${learnerName()} 的本周学习报告 · ${dateStr(monday).slice(5)} 至 ${dateStr(now).slice(5)}</p>
      <div class="stat-cards">
        <div class="s-card"><b>${newSum}</b><span>本周新词</span></div>
        <div class="s-card"><b>${revSum}</b><span>本周复习</span></div>
        <div class="s-card"><b>${acc}%</b><span>本周正确率</span></div>
        <div class="s-card"><b>${DB.profile.streak}</b><span>连续打卡</span></div>
      </div>
      <div class="section-title"><span>每天答题量</span></div>
      <div class="week-bars">
        ${days.map(d => `
          <div class="week-bar">
            <div class="wb-fill ${d.future ? "future" : ""}" style="height:${d.rec.total ? Math.max(8, d.rec.total / maxTotal * 100) : 4}%"></div>
            <small>${d.label}</small>
            <span>${d.future ? "" : d.rec.total || 0}</span>
          </div>`).join("")}
      </div>
      <div class="section-title"><span>还需要加强的词</span></div>
      ${wrongTop.length ? `<div class="word-list">${wrongTop.map(w => `
        <div class="word-row">
          <div class="w-txt"><div><span class="w-en">${esc(w.word)}</span><span class="w-ph">${esc(w.phonetic)}</span></div>
          <div class="w-cn">${esc(w.meaning)}</div></div>
          <span class="w-badge">错 ${DB.states[w.id].wrong || 0} 次</span>
        </div>`).join("")}</div>` : `<div class="empty"><span class="emoji">🌟</span>这周没有反复出错的词</div>`}
      <div class="section-title"><span>给家长的建议</span></div>
      <div class="card"><p class="fine" style="text-align:left;line-height:1.8;margin:8px 0">
        ${reportAdvice(newSum, revSum, acc, wrongTop.length)}
      </p></div>`;
    box.classList.add("open");
  }
  function reportAdvice(newSum, revSum, acc, wrongCount) {
    const tips = [];
    if (newSum < 30) tips.push("这周新词量偏少，可以陪孩子每天固定 10–15 分钟。");
    else tips.push("新词节奏不错，保持每天 10 个左右最稳。");
    if (revSum < newSum * 2) tips.push("复习量略低，记忆靠的是重复，优先完成每天的到期复习。");
    if (acc && acc < 60) tips.push("正确率偏低，建议先放慢新词速度，把错词本练熟。");
    if (wrongCount > 5) tips.push("错词较集中，可以让孩子用「考前冲刺」多练两轮。");
    return tips.join("<br>");
  }

  /* ---------- 游戏入口图标：三种小绿龙造型 ---------- */
  function gameIcon(mode) {
    const base = `
      <ellipse cx="24" cy="29" rx="16" ry="14.5" fill="#6EDB3A"/>
      <circle cx="18" cy="27" r="4.4" fill="#fff"/><circle cx="19" cy="28" r="2.2" fill="#26282b"/>
      <circle cx="30" cy="27" r="4.4" fill="#fff"/><circle cx="31" cy="28" r="2.2" fill="#26282b"/>
      <ellipse cx="13" cy="34" rx="3" ry="1.8" fill="#ff9fb3" opacity=".6"/>
      <ellipse cx="35" cy="34" rx="3" ry="1.8" fill="#ff9fb3" opacity=".6"/>
      <path d="M21 34 q3 3 6 0" stroke="#2f6a00" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    let prop = "";
    if (mode === "pair") prop = `
      <rect x="5" y="7" width="12" height="15" rx="2.5" fill="#fff" stroke="#1CB0F6" stroke-width="2" transform="rotate(-10 11 14)"/>
      <rect x="31" y="5" width="12" height="15" rx="2.5" fill="#fff" stroke="#58CC02" stroke-width="2" transform="rotate(10 37 12)"/>
      <text x="11" y="18" font-size="8" text-anchor="middle" fill="#1CB0F6" font-weight="bold">A</text>
      <text x="37" y="16" font-size="8" text-anchor="middle" fill="#58CC02" font-weight="bold">文</text>`;
    if (mode === "listen") prop = `
      <path d="M8 25 a16 16 0 0 1 32 0" fill="none" stroke="#1CB0F6" stroke-width="4" stroke-linecap="round"/>
      <rect x="4" y="23" width="8" height="13" rx="4" fill="#1CB0F6"/>
      <rect x="36" y="23" width="8" height="13" rx="4" fill="#1CB0F6"/>`;
    if (mode === "daily") prop = `
      <path d="M33 5 h11 v5 a5.5 5.5 0 0 1 -11 0z" fill="#FFC800" stroke="#E5A900" stroke-width="1.5"/>
      <rect x="36.5" y="15" width="4" height="6" fill="#E5A900"/>
      <rect x="32" y="20" width="13" height="3.5" rx="1.75" fill="#E5A900"/>
      <circle cx="38.5" cy="5" r="1.6" fill="#fff" opacity=".7"/>`;
    return `<svg viewBox="0 0 48 48" class="bicon">${base}${prop}</svg>`;
  }

  /* ---------- 小工具 ---------- */
  const currentPage = () => document.querySelector(".page.active")?.id.replace("page-", "") || "home";

  return {
    init, render, onAnswer, onSessionEnd, checkAchievements,
    chestAvailable, renderChest, openChest,
    showSpeech, openReport, stage, stageName: s => STAGE_NAME[s],
    line: kind => pickLine(LINES[kind] || LINES.idle),
    name: learnerName, addStars,
    avatar: () => dragonSVG(),
    gameIcon,
  };
})();
