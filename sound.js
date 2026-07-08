// El Puzzle — iki elin baş ve işaret parmaklarıyla ekranda bir çerçeve
// kurulur; çimdik yapınca o bölge fotoğraflanıp 3×3 karıştırılır.
// Parçalar çimdikle sürüklenip bırakıldığı en yakın yuvayla takas edilir.
// Rekor: en kısa bitirme süresi.

import { drawWireframe } from "./hand.js";
import { store } from "./store.js";

const GRID = 3;
const MIN_WINDOW = 120;      // px (ölçekle çarpılır)
const START_COOLDOWN = 0.8;  // sn

export class PuzzleGame {
  constructor(env) {
    this.env = env; // { canvas, ctx, video, sfx, onRecordsChanged }
    this.title = "El Puzzle";
    this.drawsOwnBackground = true;
  }

  enter() {
    this.mode = "WINDOW"; // WINDOW | PUZZLE | SOLVED
    this.windowRect = null;
    this.snap = null;
    this.order = null;
    this.slotRects = null;
    this.tileW = 0;
    this.tileH = 0;
    this.dragging = false;
    this.dragSlot = null;
    this.prevPinch = false;
    this.cooldown = 0;
    this.startTime = 0;
    this.elapsed = 0;
    this.moves = 0;
    this.newRecord = false;
    this.record = store.getPuzzleRecord();
  }

  exit() {}

  reset() {
    this.enter();
    // Elde kalan çimdik hemen yeni çekim tetiklemesin
    this.cooldown = 1.0;
  }

  onKey(key) {
    if (key === "r") this.reset();
  }

  onClick() {
    if (this.mode === "SOLVED") this.reset();
  }

  // ---------- yardımcılar ----------

  drawVideo(ctx, w, h, filter = null) {
    const video = this.env.video;
    ctx.save();
    if (filter && "filter" in ctx) ctx.filter = filter;
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
  }

  captureSnapshot(x, y, ww, hh, w, h) {
    const full = document.createElement("canvas");
    full.width = w;
    full.height = h;
    const fctx = full.getContext("2d");
    fctx.translate(w, 0);
    fctx.scale(-1, 1);
    fctx.drawImage(this.env.video, 0, 0, w, h);

    const snap = document.createElement("canvas");
    snap.width = ww;
    snap.height = hh;
    snap.getContext("2d").drawImage(full, x, y, ww, hh, 0, 0, ww, hh);
    return snap;
  }

  buildPuzzle(x, y, ww, hh, w, h) {
    this.tileW = Math.floor(ww / GRID);
    this.tileH = Math.floor(hh / GRID);
    const realW = this.tileW * GRID;
    const realH = this.tileH * GRID;

    this.snap = this.captureSnapshot(x, y, realW, realH, w, h);
    this.windowRect = [x, y, realW, realH];

    this.slotRects = [];
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        this.slotRects.push([x + c * this.tileW, y + r * this.tileH, this.tileW, this.tileH]);
      }
    }

    // Çözülmüş hâlde başlamasın
    const n = GRID * GRID;
    do {
      this.order = [...Array(n).keys()];
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
    } while (this.order.every((v, i) => v === i));

    this.mode = "PUZZLE";
    this.dragging = false;
    this.dragSlot = null;
    this.prevPinch = false;
    this.cooldown = START_COOLDOWN;
    this.startTime = performance.now() / 1000;
    this.elapsed = 0;
    this.moves = 0;
    this.env.sfx.snap();
  }

  drawTileAt(ctx, tileId, dx, dy, dw, dh) {
    const sc = tileId % GRID;
    const sr = Math.floor(tileId / GRID);
    ctx.drawImage(
      this.snap,
      sc * this.tileW, sr * this.tileH, this.tileW, this.tileH,
      dx, dy, dw, dh
    );
  }

  drawPuzzle(ctx, cursor = null) {
    for (let i = 0; i < this.slotRects.length; i++) {
      const [x, y, w, h] = this.slotRects[i];
      if (this.dragging && i === this.dragSlot) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        continue;
      }
      this.drawTileAt(ctx, this.order[i], x, y, w, h);
      ctx.strokeStyle = "rgba(230,230,230,0.7)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }

    // Sürüklenen parça imlecin altında
    if (this.dragging && this.dragSlot !== null && cursor) {
      const [, , w, h] = this.slotRects[this.dragSlot];
      const canvas = this.env.canvas;
      let dx = cursor.x - w / 2;
      let dy = cursor.y - h / 2;
      dx = Math.max(0, Math.min(dx, canvas.width - w));
      dy = Math.max(0, Math.min(dy, canvas.height - h));
      ctx.globalAlpha = 0.92;
      this.drawTileAt(ctx, this.order[this.dragSlot], dx, dy, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(dx, dy, w, h);
    }
  }

  nearestSlot(cursor) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < this.slotRects.length; i++) {
      const [x, y, w, h] = this.slotRects[i];
      const d = (cursor.x - (x + w / 2)) ** 2 + (cursor.y - (y + h / 2)) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ---------- ana döngü ----------

  update(dt, hands, w, h) {
    const { ctx, sfx } = this.env;
    const scale = h / 480;
    if (this.cooldown > 0) this.cooldown -= dt;

    // Arka plan: gri video
    this.drawVideo(ctx, w, h, "grayscale(1)");

    // Çerçeveyi güncelle (yalnızca WINDOW modunda)
    if (this.mode === "WINDOW" && hands.length >= 2) {
      const pts = [];
      for (const hand of hands.slice(0, 2)) {
        pts.push(hand.points[4], hand.points[8]); // baş + işaret
      }
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const xMin = Math.max(0, Math.min(...xs));
      const xMax = Math.min(w - 1, Math.max(...xs));
      const yMin = Math.max(0, Math.min(...ys));
      const yMax = Math.min(h - 1, Math.max(...ys));
      if (xMax - xMin >= MIN_WINDOW * scale && yMax - yMin >= MIN_WINDOW * scale) {
        this.windowRect = [xMin, yMin, xMax - xMin, yMax - yMin];
      }
    }

    if (this.mode === "WINDOW") {
      if (this.windowRect) {
        const [x, y, ww, hh] = this.windowRect;
        // Pencere içi renkli
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, ww, hh);
        ctx.clip();
        this.drawVideo(ctx, w, h);
        ctx.restore();

        ctx.strokeStyle = "#ffb03a";
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 7]);
        ctx.strokeRect(x, y, ww, hh);
        ctx.setLineDash([]);
      }

      const anyPinch = hands.some((hd) => hd.pinch);
      if (this.windowRect && anyPinch && this.cooldown <= 0) {
        const [x, y, ww, hh] = this.windowRect.map(Math.round);
        if (ww >= GRID * 20 && hh >= GRID * 20) {
          this.buildPuzzle(x, y, ww, hh, w, h);
        }
      }
    }

    else if (this.mode === "PUZZLE") {
      this.elapsed = performance.now() / 1000 - this.startTime;

      // Öncelik çimdik yapan elde
      let active = hands.find((hd) => hd.pinch) || hands[0] || null;

      this.drawPuzzle(ctx, this.dragging ? active?.cursor : null);

      if (active && this.cooldown <= 0) {
        const { cursor, pinch } = active;

        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, 7, 0, Math.PI * 2);
        ctx.stroke();

        // Çimdik başladı → parça seç
        if (pinch && !this.prevPinch) {
          for (let i = 0; i < this.slotRects.length; i++) {
            const [x, y, ww, hh] = this.slotRects[i];
            if (cursor.x >= x && cursor.x < x + ww && cursor.y >= y && cursor.y < y + hh) {
              this.dragging = true;
              this.dragSlot = i;
              sfx.snap();
              break;
            }
          }
        }

        // Çimdik bırakıldı → en yakın yuvayla takas
        if (!pinch && this.prevPinch && this.dragging && this.dragSlot !== null) {
          const target = this.nearestSlot(cursor);
          if (target !== null && target !== this.dragSlot) {
            [this.order[this.dragSlot], this.order[target]] =
              [this.order[target], this.order[this.dragSlot]];
            this.moves++;
            sfx.pop();
          }
          this.dragging = false;
          this.dragSlot = null;

          if (this.order.every((v, i) => v === i)) {
            this.elapsed = performance.now() / 1000 - this.startTime;
            this.newRecord = store.submitPuzzleTime(this.elapsed);
            this.record = store.getPuzzleRecord();
            this.mode = "SOLVED";
            if (this.newRecord) sfx.record(); else sfx.win();
            this.env.onRecordsChanged?.();
          }
        }

        this.prevPinch = pinch;
      } else if (!active) {
        this.prevPinch = false;
      }
    }

    else if (this.mode === "SOLVED") {
      this.drawPuzzle(ctx, null);
      const [x, y, ww, hh] = this.windowRect;
      ctx.strokeStyle = "#5be38a";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 3, y - 3, ww + 6, hh + 6);
    }

    // Eller her modda ince iskelet
    for (const hand of hands) drawWireframe(ctx, hand);

    this.drawHud(ctx, w, h, scale);
  }

  drawHud(ctx, w, h, scale) {
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // Üst şerit
    ctx.fillStyle = "rgba(18,16,31,.8)";
    ctx.fillRect(0, 0, w, 46 * scale);

    ctx.font = `500 ${15 * scale}px 'IBM Plex Sans', sans-serif`;
    ctx.fillStyle = "#f2efe6";

    let info = "";
    if (this.mode === "WINDOW") {
      info = "İki elini aç, çerçeveyi kur → çimdikle puzzle'ı başlat";
    } else if (this.mode === "PUZZLE") {
      info = `Süre ${this.elapsed.toFixed(1)} sn · Hamle ${this.moves} — parçayı çimdikle taşı`;
    } else {
      info = `Tamamlandı! Süre ${this.elapsed.toFixed(1)} sn · Hamle ${this.moves}`;
    }
    ctx.fillText(info, 16, 23 * scale);

    ctx.textAlign = "right";
    ctx.font = `500 ${13 * scale}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = "#ffb03a";
    ctx.fillText(
      this.record !== null ? `REKOR ${Number(this.record).toFixed(1)} sn` : "REKOR —",
      w - 16, 23 * scale
    );

    if (this.mode === "SOLVED") {
      ctx.textAlign = "center";
      ctx.font = `800 ${44 * scale}px 'Bricolage Grotesque', sans-serif`;
      ctx.fillStyle = "#5be38a";
      ctx.fillText("PUZZLE TAMAMLANDI!", w / 2, h - 90 * scale);
      if (this.newRecord) {
        ctx.font = `600 ${22 * scale}px 'IBM Plex Sans', sans-serif`;
        ctx.fillStyle = "#ffe14d";
        ctx.fillText("🏆 YENİ REKOR!", w / 2, h - 52 * scale);
      }
      ctx.font = `500 ${15 * scale}px 'IBM Plex Sans', sans-serif`;
      ctx.fillStyle = "#d8d4ec";
      ctx.fillText("Yeniden oynamak için R'ye bas veya ekrana dokun", w / 2, h - 22 * scale);
    }
  }
}
