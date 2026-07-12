// Uygulama akışı: menü ↔ oyun ekranı, kamera + model kurulumu,
// ortak oyun döngüsü, rekor gösterimi ve menüdeki CANLI el iskeleti.

import { initHandLandmarker, detectHands, HAND_CONNECTIONS } from "./hand.js";
import { sfx, setMuted, isMuted } from "./sound.js";
import { store } from "./store.js";
import {
  onlineEnabled, getUserName, claimUserName,
  submitScore, fetchTop10, RpsNet,
} from "./online.js";
import { RPSGame } from "./rps.js";
import { DotsGame } from "./dots.js";
import { PuzzleGame } from "./puzzle.js";

const $ = (id) => document.getElementById(id);

const screenMenu = $("screen-menu");
const screenGame = $("screen-game");
const video = $("cam");
const canvas = $("game-canvas");
const ctx = canvas.getContext("2d");

const loadingEl = $("loading");
const loadingText = $("loading-text");
const errorBox = $("error-box");
const errorText = $("error-text");
const modeSelect = $("mode-select");

let game = null;
let stream = null;
let rafId = null;
let lastTs = 0;

// ==================== REKOR GÖSTERİMİ ====================

function fmtSec(v) { return `${Number(v).toFixed(1)} sn`; }

function refreshRecords() {
  const s = store.getDotsRecord("sureli");
  const e = store.getDotsRecord("sonsuz");
  const parts = [];
  if (s !== null) parts.push(`⏱ ${s}`);
  if (e !== null) parts.push(`♾ ${e}`);
  $("record-dots").textContent = parts.length ? `rekor: ${parts.join(" · ")}` : "rekor: —";

  const p = store.getPuzzleRecord();
  $("record-puzzle").textContent = p !== null ? `en iyi: ${fmtSec(p)}` : "rekor: —";

  $("mode-rec-sureli").textContent = s !== null ? `rekorun: ${s} puan` : "henüz rekor yok";
  $("mode-rec-sonsuz").textContent = e !== null ? `rekorun: ${e} puan` : "henüz rekor yok";
}

$("btn-reset-records").addEventListener("click", () => {
  if (confirm("Tüm rekorlar silinsin mi?")) {
    store.resetAll();
    refreshRecords();
  }
});

// ==================== KAMERA + MODEL (OYUN) ====================

async function setupCamera() {
  loadingText.textContent = "Kamera açılıyor…";
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  await new Promise((res) => {
    if (video.videoWidth > 0) return res();
    video.onloadedmetadata = () => res();
  });
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
}

// ==================== OYUN DÖNGÜSÜ ====================

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  const w = canvas.width;
  const h = canvas.height;

  if (!game.drawsOwnBackground) {
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.clearRect(0, 0, w, h);
  }

  const hands = detectHands(video, w, h);
  game.update(dt, hands, w, h);

  rafId = requestAnimationFrame(loop);
}

const GAMES = {
  rps: () => new RPSGame(env()),
  dots: () => new DotsGame(env()),
  puzzle: () => new PuzzleGame(env()),
};

function env() {
  return {
    canvas, ctx, video, sfx,
    requestModeSelect: showModeSelect,
    onRecordsChanged: refreshRecords,
    submitScore: async (oyun, skor) => {
      const ok = await submitScore(oyun, skor);
      if (ok) loadLeaderboard(currentLb);
    },
  };
}

async function startGame(name) {
  stopMenuHand(); // menüdeki canlı el kamerayı bırakmalı

  screenMenu.classList.add("hidden");
  screenGame.classList.remove("hidden");
  errorBox.classList.add("hidden");
  modeSelect.classList.add("hidden");
  loadingEl.classList.remove("hidden");

  try {
    await initHandLandmarker((msg) => (loadingText.textContent = msg));
    await setupCamera();
  } catch (err) {
    console.error(err);
    loadingEl.classList.add("hidden");
    errorText.textContent =
      err.name === "NotAllowedError"
        ? "Kamera izni verilmedi. Oyunlar kamerasız çalışamaz — tarayıcı ayarlarından izin verip tekrar dene."
        : `Kamera ya da el modeli başlatılamadı: ${err.message || err}`;
    errorBox.classList.remove("hidden");
    return;
  }

  loadingEl.classList.add("hidden");

  game = GAMES[name]();
  $("game-title").textContent = game.title;
  game.enter();

  if (game.needsModeSelect) showModeSelect();
  if (game.needsRpsSelect) showRpsSelect();

  lastTs = performance.now();
  rafId = requestAnimationFrame(loop);
}

function showModeSelect() {
  refreshRecords();
  if (game) game.running = false;
  modeSelect.classList.remove("hidden");
}

function backToMenu() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  game?.exit();
  game = null;
  stopCamera();
  modeSelect.classList.add("hidden");
  $("rps-select").classList.add("hidden");
  screenGame.classList.add("hidden");
  screenMenu.classList.remove("hidden");
  refreshRecords();
  loadLeaderboard(currentLb);
}

// ==================== OLAYLAR ====================

document.querySelectorAll(".card").forEach((card) => {
  const open = () => startGame(card.dataset.game);
  card.addEventListener("click", open);
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
  });
});

document.querySelectorAll(".mode-btn[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => {
    modeSelect.classList.add("hidden");
    game?.start(btn.dataset.mode);
  });
});

$("btn-back").addEventListener("click", backToMenu);
$("btn-error-back").addEventListener("click", backToMenu);

$("btn-mute").addEventListener("click", () => {
  setMuted(!isMuted());
  $("btn-mute").textContent = isMuted() ? "🔇" : "🔊";
});

window.addEventListener("keydown", (e) => {
  if (screenGame.classList.contains("hidden")) return;
  if (e.key === "Escape") { backToMenu(); return; }
  game?.onKey?.(e.key.toLowerCase());
});

canvas.addEventListener("pointerdown", (e) => {
  if (!game) return;
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
  game.onClick?.(x, y);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) lastTs = performance.now();
});

// ==================== KULLANICI ADI ====================

const nameInput = $("username");
const userHint = $("user-hint");

function refreshNameUI() {
  const name = getUserName();
  nameInput.value = name;
  if (name) {
    userHint.textContent = `hoş geldin, ${name}! skorların bu adla listelenecek`;
    userHint.classList.add("ok");
  } else {
    userHint.textContent = "skor tablosuna girmek ve online oynamak için gerekli";
    userHint.classList.remove("ok");
  }
}

async function saveName() {
  const btn = $("btn-save-name");
  btn.disabled = true;
  userHint.classList.remove("ok");
  userHint.textContent = "kontrol ediliyor…";

  const res = await claimUserName(nameInput.value);
  btn.disabled = false;

  if (res.ok) {
    refreshNameUI();
    if (res.reason === "alindi") userHint.textContent = `"${getUserName()}" artık senin! 🎉`;
    sfx.pop();
    // Yerel rekorları skor tablosuna taşı (isim artık veritabanında)
    if (res.reason === "alindi" || res.reason === "zaten_senin") {
      const gonderilecek = [];
      const s = store.getDotsRecord("sureli");
      if (s !== null && s > 0) gonderilecek.push(submitScore("parmak_sureli", s));
      const e2 = store.getDotsRecord("sonsuz");
      if (e2 !== null && e2 > 0) gonderilecek.push(submitScore("parmak_sonsuz", e2));
      const p = store.getPuzzleRecord();
      if (p !== null) gonderilecek.push(submitScore("puzzle", p));
      await Promise.all(gonderilecek);
    }
    loadLeaderboard(currentLb);
  } else if (res.reason === "dolu") {
    userHint.textContent = "bu isim başkası tarafından alınmış, farklı bir isim dene";
  } else if (res.reason === "gecersiz") {
    userHint.textContent = "en az 2, en çok 16 karakter olmalı";
  } else {
    userHint.textContent = "bağlantı sorunu — az sonra tekrar dene";
  }
}

$("btn-save-name").addEventListener("click", saveName);
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveName(); });

// ==================== İLK 10 SKOR TABLOSU ====================

const LB_META = {
  parmak_sureli: { title: "Parmak Avı · Süreli (puan)", fmt: (v) => String(Math.round(v)) },
  parmak_sonsuz: { title: "Parmak Avı · Sonsuz (puan)", fmt: (v) => String(Math.round(v)) },
  puzzle: { title: "El Puzzle · en iyi süre", fmt: (v) => Number(v).toFixed(1) + " sn" },
  tkm_online: { title: "TKM Online · galibiyet", fmt: (v) => String(Math.round(v)) },
};
let currentLb = "parmak_sureli";

async function loadLeaderboard(oyun) {
  currentLb = oyun;
  document.querySelectorAll(".lb-tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.lb === oyun)
  );
  $("lb-title").textContent = LB_META[oyun].title;
  const list = $("lb-list");
  const note = $("lb-note");

  if (!onlineEnabled()) {
    list.innerHTML = "";
    note.textContent =
      "Online skor tablosu henüz kurulmadı (config.js boş). Kurulum adımları README'de.";
    return;
  }

  list.innerHTML = "<li><span class='lb-name'>yükleniyor…</span></li>";
  note.textContent = "";
  const rows = await fetchTop10(oyun);

  if (rows === null) {
    list.innerHTML = "";
    note.textContent = "Skor tablosuna ulaşılamadı. Bağlantını kontrol et.";
    return;
  }
  if (rows.length === 0) {
    list.innerHTML = "";
    note.textContent = "Henüz skor yok — ilk sen ol! 🏁";
    return;
  }

  const me = getUserName();
  list.innerHTML = "";
  rows.forEach((r, i) => {
    const li = document.createElement("li");
    if (me && r.isim === me) li.classList.add("lb-me");
    li.innerHTML =
      `<span class="lb-rank">${i + 1}.</span>` +
      `<span class="lb-name"></span>` +
      `<span class="lb-score">${LB_META[oyun].fmt(r.skor)}</span>`;
    li.querySelector(".lb-name").textContent = r.isim;
    list.appendChild(li);
  });
}

document.querySelectorAll(".lb-tab").forEach((tab) =>
  tab.addEventListener("click", () => loadLeaderboard(tab.dataset.lb))
);

// ==================== TKM MOD PANELİ ====================

const rpsSelect = $("rps-select");
const rpsStatus = $("rps-status");

function showRpsSelect() {
  rpsStatus.textContent = onlineEnabled()
    ? ""
    : "Not: online modlar için site sahibinin Supabase kurulumu yapması gerekir (README).";
  rpsSelect.classList.remove("hidden");
}

function requireName() {
  const name = getUserName();
  if (!name) {
    rpsStatus.textContent =
      "Online oynamak için önce menüden kullanıcı adı kaydetmelisin.";
    return null;
  }
  return name;
}

async function startRpsOnline(kind) {
  if (!onlineEnabled()) {
    rpsStatus.textContent = "Online modlar kapalı: config.js doldurulmamış (README'ye bak).";
    return;
  }
  const name = requireName();
  if (!name) return;

  const net = new RpsNet();
  try {
    if (kind === "quick") {
      rpsStatus.textContent = "Rakip aranıyor…";
      await net.quickMatch(name, (s) => (rpsStatus.textContent = s));
      // eşleşme sync ile odaya taşınır; oyunu hemen devreye al
      rpsSelect.classList.add("hidden");
      game?.startOnline(net, name);
    } else if (kind === "create") {
      rpsStatus.textContent = "Oda kuruluyor…";
      const code = await net.createRoom(name);
      rpsStatus.textContent = `Oda kodun: ${code} — arkadaşın girince oyun başlar`;
      rpsSelect.classList.add("hidden");
      game?.startOnline(net, name);
      game.statusText = `Oda kodu: ${code} — rakip bekleniyor…`;
    } else if (kind === "join") {
      const code = $("rps-code").value.trim();
      if (code.length !== 4) {
        rpsStatus.textContent = "4 haneli oda kodunu gir.";
        return;
      }
      rpsStatus.textContent = "Odaya giriliyor…";
      await net.joinRoom(code, name);
      rpsSelect.classList.add("hidden");
      game?.startOnline(net, name);
    }
  } catch (err) {
    console.error(err);
    net.leave();
    rpsStatus.textContent = "Bağlanılamadı: " + (err.message || err);
  }
}

$("rps-cpu").addEventListener("click", () => {
  rpsSelect.classList.add("hidden");
  game?.startOffline();
});
$("rps-quick").addEventListener("click", () => startRpsOnline("quick"));
$("rps-create").addEventListener("click", () => startRpsOnline("create"));
$("rps-join").addEventListener("click", () => startRpsOnline("join"));

// ==================== HERO: CANLI EL İSKELETİ ====================
// Menüdeki 21 noktalı el, "Elini kameraya göster" denince
// gerçek elinin hareketini birebir taklit eder; el yokken
// kendi kendine hafifçe kıpırdar.

const VIEW_W = 300;
const VIEW_H = 340;

// Boşta duruş (açık el)
const IDLE_POSE = [
  [150, 320],
  [105, 295], [72, 265], [48, 235], [30, 205],        // baş parmak
  [112, 190], [105, 150], [100, 118], [96, 88],       // işaret
  [148, 182], [148, 135], [148, 100], [148, 66],      // orta
  [182, 188], [188, 145], [192, 112], [196, 80],      // yüzük
  [214, 205], [228, 172], [238, 146], [246, 120],     // serçe
];
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
const FINGERS = [
  [1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20],
];

let heroLines = [];
let heroDots = [];
let livePts = null;   // kameradan gelen hedef noktalar
let liveAt = 0;       // son canlı veri zamanı
let rendered = IDLE_POSE.map((p) => [...p]); // ekranda o an çizilen (yumuşatılmış)

let menuStream = null;
let menuTracking = false;
const heroBtn = $("btn-hero-cam");

function buildHeroHand() {
  const svg = $("hand-wire");
  if (!svg) return;
  const NS = "http://www.w3.org/2000/svg";

  for (const [a, b] of HAND_CONNECTIONS) {
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("stroke", "rgba(42,37,34,0.8)");
    ln.setAttribute("stroke-width", "2");
    ln.setAttribute("stroke-linecap", "round");
    svg.appendChild(ln);
    heroLines.push([ln, a, b]);
  }
  IDLE_POSE.forEach((_, i) => {
    const c = document.createElementNS(NS, "circle");
    const tip = FINGERTIPS.has(i);
    c.setAttribute("r", tip ? "5.5" : i === 0 ? "6" : "3.5");
    c.setAttribute("fill", tip ? "#d9482b" : i === 0 ? "#1f8a70" : "#2a2522");
    svg.appendChild(c);
    heroDots.push(c);
  });

  requestAnimationFrame(heroFrame);
}

function heroFrame(t) {
  // Hedef: canlı el (taze ise) yoksa boşta animasyon
  let target;
  if (livePts && performance.now() - liveAt < 400) {
    target = livePts;
  } else {
    target = IDLE_POSE.map((p) => [...p]);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) {
      FINGERS.forEach((chain, fi) => {
        const sway = Math.sin(t / 900 + fi * 1.1) * 4;
        chain.forEach((idx, k) => {
          const f = (k + 1) / chain.length;
          target[idx][0] += sway * f;
          target[idx][1] += Math.sin(t / 700 + fi) * 2 * f;
        });
      });
    }
  }

  // Yumuşat: canlı veriye hızlı, boşta duruşa yavaş dön
  const k = livePts && performance.now() - liveAt < 400 ? 0.5 : 0.12;
  for (let i = 0; i < rendered.length; i++) {
    rendered[i][0] += (target[i][0] - rendered[i][0]) * k;
    rendered[i][1] += (target[i][1] - rendered[i][1]) * k;
  }

  for (const [ln, a, b] of heroLines) {
    ln.setAttribute("x1", rendered[a][0]); ln.setAttribute("y1", rendered[a][1]);
    ln.setAttribute("x2", rendered[b][0]); ln.setAttribute("y2", rendered[b][1]);
  }
  heroDots.forEach((c, i) => {
    c.setAttribute("cx", rendered[i][0]);
    c.setAttribute("cy", rendered[i][1]);
  });

  requestAnimationFrame(heroFrame);
}

/** Kameradan gelen eli viewBox'a sığdırıp hedef nokta yapar. */
function feedLiveHand(hand) {
  const pts = hand.points;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const p of pts) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const bw = Math.max(1, xMax - xMin);
  const bh = Math.max(1, yMax - yMin);
  const s = Math.min((VIEW_W - 50) / bw, (VIEW_H - 50) / bh);
  const ox = (VIEW_W - bw * s) / 2 - xMin * s;
  const oy = (VIEW_H - bh * s) / 2 - yMin * s;

  livePts = pts.map((p) => [p.x * s + ox, p.y * s + oy]);
  liveAt = performance.now();
}

async function startMenuHand() {
  if (menuTracking) { stopMenuHand(); return; }
  try {
    heroBtn.disabled = true;
    heroBtn.textContent = "hazırlanıyor…";
    await initHandLandmarker(() => {});
    menuStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    video.srcObject = menuStream;
    await video.play();
    menuTracking = true;
    heroBtn.disabled = false;
    heroBtn.textContent = "✋ elini salla! (kapatmak için tıkla)";
    menuLoop();
  } catch (err) {
    console.error(err);
    heroBtn.disabled = false;
    heroBtn.textContent =
      err.name === "NotAllowedError" ? "kamera izni verilmedi 😕" : "kamera açılamadı 😕";
    setTimeout(() => {
      if (!menuTracking) heroBtn.textContent = "✋ Elini kameraya göster";
    }, 3000);
  }
}

function stopMenuHand() {
  menuTracking = false;
  if (menuStream) {
    menuStream.getTracks().forEach((t) => t.stop());
    menuStream = null;
    video.srcObject = null;
  }
  livePts = null;
  heroBtn.disabled = false;
  heroBtn.textContent = "✋ Elini kameraya göster";
}

function menuLoop() {
  if (!menuTracking) return;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const hands = detectHands(video, vw, vh);
  if (hands.length > 0) feedLiveHand(hands[0]);
  requestAnimationFrame(menuLoop);
}

heroBtn.addEventListener("click", startMenuHand);

// ==================== BAŞLANGIÇ ====================

window.__eloyunlariHazir = true;
refreshRecords();
refreshNameUI();
loadLeaderboard(currentLb);
buildHeroHand();
