// Uygulama akışı: menü ↔ oyun ekranı, kamera + model kurulumu,
// ortak oyun döngüsü ve rekor gösterimi.

import { initHandLandmarker, detectHands, HAND_CONNECTIONS } from "./hand.js";
import { sfx, setMuted, isMuted } from "./sound.js";
import { store } from "./store.js";
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
  $("record-dots").textContent = parts.length ? `Rekor: ${parts.join(" · ")}` : "Rekor: —";

  const p = store.getPuzzleRecord();
  $("record-puzzle").textContent = p !== null ? `En iyi: ${fmtSec(p)}` : "Rekor: —";

  $("mode-rec-sureli").textContent = s !== null ? `Rekorun: ${s} puan` : "Henüz rekor yok";
  $("mode-rec-sonsuz").textContent = e !== null ? `Rekorun: ${e} puan` : "Henüz rekor yok";
}

$("btn-reset-records").addEventListener("click", () => {
  if (confirm("Tüm rekorlar silinsin mi?")) {
    store.resetAll();
    refreshRecords();
  }
});

// ==================== KAMERA + MODEL ====================

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
  };
}

async function startGame(name) {
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
  screenGame.classList.add("hidden");
  screenMenu.classList.remove("hidden");
  refreshRecords();
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

// Sekme gizlenince kamerayı kapatma; sadece zaman sıçramasını önle
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) lastTs = performance.now();
});

// ==================== HERO EL ANİMASYONU ====================
// Menüdeki imza öğe: canlı el-landmark iskeleti.

function buildHeroHand() {
  const svg = $("hand-wire");
  if (!svg) return;

  const base = [
    [150, 320],
    [105, 295], [72, 265], [48, 235], [30, 205],        // baş parmak
    [112, 190], [105, 150], [100, 118], [96, 88],       // işaret
    [148, 182], [148, 135], [148, 100], [148, 66],      // orta
    [182, 188], [188, 145], [192, 112], [196, 80],      // yüzük
    [214, 205], [228, 172], [238, 146], [246, 120],     // serçe
  ];

  const NS = "http://www.w3.org/2000/svg";
  const lines = [];
  const dots = [];

  for (const [a, b] of HAND_CONNECTIONS) {
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("stroke", "rgba(69,224,216,0.65)");
    ln.setAttribute("stroke-width", "1.5");
    svg.appendChild(ln);
    lines.push([ln, a, b]);
  }
  base.forEach((_, i) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("r", i % 4 === 0 && i > 0 ? "5" : "3.5");
    c.setAttribute("fill", i % 4 === 0 && i > 0 ? "#ffb03a" : "#f2efe6");
    svg.appendChild(c);
    dots.push(c);
  });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fingers = [
    [1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20],
  ];

  function frame(t) {
    const pts = base.map((p) => [...p]);
    if (!reduce) {
      fingers.forEach((chain, fi) => {
        const sway = Math.sin(t / 900 + fi * 1.1) * 4;
        chain.forEach((idx, k) => {
          const f = (k + 1) / chain.length;
          pts[idx][0] += sway * f;
          pts[idx][1] += Math.sin(t / 700 + fi) * 2 * f;
        });
      });
    }
    for (const [ln, a, b] of lines) {
      ln.setAttribute("x1", pts[a][0]); ln.setAttribute("y1", pts[a][1]);
      ln.setAttribute("x2", pts[b][0]); ln.setAttribute("y2", pts[b][1]);
    }
    dots.forEach((c, i) => {
      c.setAttribute("cx", pts[i][0]);
      c.setAttribute("cy", pts[i][1]);
    });
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ==================== BAŞLANGIÇ ====================

refreshRecords();
buildHeroHand();
