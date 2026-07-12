// Parmak Avı — düşen topları işaret parmağıyla patlatma oyunu.
// İki mod:
//   "sureli": 60 sn. Kırmızı: -1 puan ve -1 sn. Mor: +3/+5 sn.
//   "sonsuz": süre yok, 5 can. Toplar zamanla hızlanır. Kırmızı: -1 can.
//             Kalp topu: +1 can (en fazla 5).
// Her iki modda sarı tetik topu 5 saniyelik bonus yağmuru başlatır.

import { store } from "./store.js";

const GAME_TIME = 60;
const BONUS_DURATION = 5;
const MAX_LIVES = 5;
const TRAIL_LENGTH = 15;

export class DotsGame {
  constructor(env) {
    this.env = env; // { canvas, ctx, sfx, requestModeSelect }
    this.title = "Parmak Avı";
    this.needsModeSelect = true;
  }

  enter() {
    this.mode = null;
    this.running = false;
  }

  exit() {}

  start(mode) {
    this.mode = mode; // "sureli" | "sonsuz"
    this.running = true;
    this.gameOver = false;
    this.score = 0;
    this.lives = MAX_LIVES;
    this.elapsed = 0;
    this.remaining = GAME_TIME;
    this.dots = [];
    this.particles = [];
    this.bonusUntil = 0;
    this.prevBonus = false;
    this.redFlash = 0;
    this.spawnAcc = 0;
    this.leftTrail = [];
    this.rightTrail = [];
    this.record = store.getDotsRecord(mode);
    this.newRecord = false;
    this.recordSubmitted = false;
  }

  onKey(key) {
    if (key === "r") this.env.requestModeSelect();
  }

  onClick() {
    if (this.gameOver) this.env.requestModeSelect();
  }

  // ---------- yardımcılar ----------

  spawnDot(w, h, scale, bonusMode) {
    const R = 18 * scale;
    const minDist = R * 3;
    for (let tries = 0; tries < 30; tries++) {
      const x = 50 * scale + Math.random() * (w - 100 * scale);
      const y = 70 * scale;
      if (this.dots.some((d) => Math.hypot(d.x - x, d.y - y) < minDist)) continue;

      let type = "green";
      let extra = 0;
      if (bonusMode) {
        type = "yellow_bonus";
      } else {
        const r = Math.random();
        if (r < 0.74) type = "green";
        else if (r < 0.94) type = "red";
        else if (r < 0.97) type = "yellow_trigger";
        else {
          if (this.mode === "sureli") {
            type = "time_bonus";
            extra = Math.random() < 0.5 ? 3 : 5;
          } else {
            type = "heart";
          }
        }
      }
      this.dots.push({ x, y, type, extra });
      return;
    }
  }

  explosion(x, y, color, count = 16) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 7,
        vy: (Math.random() - 0.5) * 7,
        life: 0.35 + Math.random() * 0.3,
        r: 2 + Math.random() * 2,
        color,
      });
    }
  }

  floatText(x, y, text, color) {
    this.particles.push({ x, y, vx: 0, vy: -55, life: 0.8, r: 0, color, text });
  }

  dotSpeed(h) {
    // sn başına piksel
    const base = h * 0.34;
    if (this.mode === "sureli") return base;
    // Sonsuz: her 20 saniyede yaklaşık %25 hızlanır, en fazla 3 kat
    return base * Math.min(3, 1 + this.elapsed * 0.0125);
  }

  spawnRate() {
    const base = 2.1; // sn başına top
    if (this.mode === "sureli") return base;
    return Math.min(4.5, base * (1 + this.elapsed * 0.008));
  }

  // ---------- ana döngü ----------

  update(dt, hands, w, h) {
    const { ctx, sfx } = this.env;
    const scale = h / 480;

    if (!this.running) return; // mod seçimi bekleniyor

    if (!this.gameOver) {
      this.elapsed += dt;
      if (this.mode === "sureli") {
        this.remaining -= dt;
        if (this.remaining <= 0) {
          this.remaining = 0;
          this.endGame();
        }
      }
    }

    const now = performance.now() / 1000;
    const bonusMode = now < this.bonusUntil && !this.gameOver;

    // Bonus bitti: kalan bonus sarıları yeşile dön
    if (this.prevBonus && !bonusMode) {
      for (const d of this.dots) if (d.type === "yellow_bonus") d.type = "green";
    }
    this.prevBonus = bonusMode;

    if (bonusMode) {
      ctx.fillStyle = "rgba(255,225,80,0.07)";
      ctx.fillRect(0, 58 * scale, w, h);
    }

    // ---------- parmak uçları ----------
    const fingers = [];
    if (!this.gameOver) {
      let seenL = false, seenR = false;
      for (const hand of hands.slice(0, 2)) {
        const fx = hand.points[8].x;
        const fy = hand.points[8].y;
        fingers.push([fx, fy]);
        if (hand.label === "Left") {
          this.leftTrail.push([fx, fy]);
          if (this.leftTrail.length > TRAIL_LENGTH) this.leftTrail.shift();
          seenL = true;
        } else if (hand.label === "Right") {
          this.rightTrail.push([fx, fy]);
          if (this.rightTrail.length > TRAIL_LENGTH) this.rightTrail.shift();
          seenR = true;
        }
      }
      if (!seenL) this.leftTrail.length = 0;
      if (!seenR) this.rightTrail.length = 0;

      this.drawTrail(ctx, this.leftTrail);
      this.drawTrail(ctx, this.rightTrail);

      for (const [fx, fy] of fingers) {
        ctx.fillStyle = "#ffe14d";
        ctx.beginPath(); ctx.arc(fx, fy, 8 * scale, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#ffe14d";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(fx, fy, 13 * scale, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // ---------- toplar ----------
    if (!this.gameOver) {
      this.spawnAcc += dt * this.spawnRate();
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnDot(w, h, scale, bonusMode);
      }

      const R = 18 * scale;
      const touchDist = 30 * scale;
      const speed = this.dotSpeed(h);
      const kept = [];

      for (const dot of this.dots) {
        dot.y += speed * dt;
        const { x, y } = dot;

        const color = {
          green: "#3ddc5a",
          red: "#ff3b4e",
          yellow_trigger: "#ffe14d",
          yellow_bonus: "#ffe14d",
          time_bonus: "#e05aff",
          heart: "#ff6ea0",
        }[dot.type] || "#fff";

        if (dot.type === "heart") {
          this.drawHeart(ctx, x, y, R * 1.15, color);
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, R + 4, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
        }

        if (dot.type === "time_bonus") {
          ctx.fillStyle = "#fff";
          ctx.font = `600 ${13 * scale}px 'Nunito', sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`+${dot.extra}`, x, y + 1);
        }

        let touched = false;
        for (const [fx, fy] of fingers) {
          if (Math.hypot(fx - x, fy - y) < touchDist) {
            touched = true;
            this.hitDot(dot, sfx, bonusMode);
            break;
          }
        }
        if (!touched && y < h + R) kept.push(dot);
      }
      this.dots = kept;
    }

    // ---------- parçacıklar ----------
    this.updateParticles(ctx, dt, scale);

    if (this.redFlash > 0) {
      ctx.fillStyle = "rgba(255,0,40,0.1)";
      ctx.fillRect(0, 0, w, h);
      this.redFlash -= dt;
    }

    // ---------- HUD ----------
    if (!this.gameOver) {
      const bonusLeft = bonusMode ? this.bonusUntil - now : 0;
      this.drawHud(ctx, w, h, scale, bonusMode, bonusLeft);
    } else {
      this.drawGameOver(ctx, w, h, scale);
    }
  }

  hitDot(dot, sfx, bonusMode) {
    const { x, y } = dot;
    switch (dot.type) {
      case "green":
        this.score++;
        this.explosion(x, y, "#3ddc5a", 14);
        this.floatText(x, y - 12, "+1", "#3ddc5a");
        sfx.pop();
        break;
      case "red":
        this.explosion(x, y, "#ff3b4e", 14);
        this.redFlash = 0.18;
        sfx.bad();
        if (this.mode === "sureli") {
          this.score--;
          this.remaining = Math.max(0, this.remaining - 1);
          this.floatText(x, y - 12, "-1 PUAN", "#ff3b4e");
          this.floatText(x, y + 16, "-1 SN", "#ff8a3b");
          if (this.remaining <= 0) this.endGame();
        } else {
          this.lives--;
          this.floatText(x, y - 12, "-1 CAN", "#ff3b4e");
          if (this.lives <= 0) this.endGame();
        }
        break;
      case "yellow_trigger":
        this.score += 3;
        this.explosion(x, y, "#ffe14d", 24);
        this.floatText(x, y - 12, "+3 BONUS!", "#ffe14d");
        sfx.bonus();
        if (!bonusMode) this.bonusUntil = performance.now() / 1000 + BONUS_DURATION;
        break;
      case "yellow_bonus":
        this.score += 3;
        this.explosion(x, y, "#ffe14d", 20);
        this.floatText(x, y - 12, "+3", "#ffe14d");
        sfx.bonus();
        break;
      case "time_bonus":
        this.remaining += dot.extra;
        this.explosion(x, y, "#e05aff", 22);
        this.floatText(x, y - 12, `+${dot.extra} SN`, "#e05aff");
        sfx.heart();
        break;
      case "heart":
        if (this.lives < MAX_LIVES) {
          this.lives++;
          this.floatText(x, y - 12, "+1 CAN", "#ff6ea0");
        } else {
          this.score += 2;
          this.floatText(x, y - 12, "+2", "#ff6ea0");
        }
        this.explosion(x, y, "#ff6ea0", 20);
        sfx.heart();
        break;
    }
  }

  endGame() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.newRecord = store.submitDotsScore(this.mode, this.score);
    if (this.newRecord) this.env.sfx.record();
    else this.env.sfx.lose();
    this.env.onRecordsChanged?.();
  }

  updateParticles(ctx, dt, scale) {
    const kept = [];
    for (const p of this.particles) {
      p.x += p.vx * dt * 60 * 0.6;
      p.y += p.vy * dt * (p.text ? 1 : 0.6 * 60);
      p.life -= dt;
      if (p.life <= 0) continue;
      if (p.text) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.font = `700 ${17 * scale}px 'Nunito', sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.text, p.x, p.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * scale, 0, Math.PI * 2);
        ctx.fill();
      }
      kept.push(p);
    }
    this.particles = kept;
  }

  drawTrail(ctx, trail) {
    if (trail.length < 2) return;
    ctx.strokeStyle = "rgba(255,225,77,0.7)";
    for (let i = 1; i < trail.length; i++) {
      ctx.lineWidth = Math.max(1, (i / trail.length) * 4);
      ctx.beginPath();
      ctx.moveTo(trail[i - 1][0], trail[i - 1][1]);
      ctx.lineTo(trail[i][0], trail[i][1]);
      ctx.stroke();
    }
  }

  drawHeart(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.65);
    ctx.bezierCurveTo(x - s * 1.1, y - s * 0.25, x - s * 0.5, y - s, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.5, y - s, x + s * 1.1, y - s * 0.25, x, y + s * 0.65);
    ctx.fill();
  }

  drawHud(ctx, w, h, scale, bonusMode, bonusLeft) {
    const barH = 58 * scale;
    ctx.fillStyle = "rgba(18,16,31,.88)";
    ctx.fillRect(0, 0, w, barH);
    ctx.strokeStyle = bonusMode ? "#ffe14d" : "#45e0d8";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, barH); ctx.lineTo(w, barH); ctx.stroke();

    ctx.textBaseline = "middle";
    const midY = barH / 2;

    ctx.textAlign = "left";
    ctx.font = `600 ${20 * scale}px 'Nunito', sans-serif`;
    ctx.fillStyle = "#ffb03a";
    ctx.fillText(`SKOR ${this.score}`, 20, midY);

    // Rekor
    ctx.font = `500 ${13 * scale}px 'Nunito', sans-serif`;
    ctx.fillStyle = "#a49fc0";
    const recText = this.record !== null ? `REKOR ${this.record}` : "REKOR —";
    ctx.fillText(recText, 20 + ctx.measureText("SKOR 0000").width + 30 * scale, midY);

    // Orta: süre veya canlar
    ctx.textAlign = "center";
    if (this.mode === "sureli") {
      ctx.font = `600 ${20 * scale}px 'Nunito', sans-serif`;
      ctx.fillStyle = this.remaining < 10 ? "#ff5a6e" : "#f2efe6";
      ctx.fillText(`SÜRE ${Math.max(0, Math.ceil(this.remaining))}`, w / 2, midY);
    } else {
      const s = 9 * scale;
      const total = MAX_LIVES;
      const startX = w / 2 - ((total - 1) * s * 2.6) / 2;
      for (let i = 0; i < total; i++) {
        this.drawHeart(
          ctx,
          startX + i * s * 2.6,
          midY,
          s,
          i < this.lives ? "#ff5a6e" : "rgba(255,255,255,0.18)"
        );
      }
    }

    // Sağ: bonus veya hız göstergesi
    ctx.textAlign = "right";
    if (bonusMode) {
      ctx.font = `600 ${18 * scale}px 'Nunito', sans-serif`;
      ctx.fillStyle = "#ffe14d";
      ctx.fillText(`BONUS ${bonusLeft.toFixed(1)}`, w - 20, midY);
    } else if (this.mode === "sonsuz") {
      ctx.font = `500 ${14 * scale}px 'Nunito', sans-serif`;
      ctx.fillStyle = "#45e0d8";
      const mult = Math.min(3, 1 + this.elapsed * 0.0125);
      ctx.fillText(`HIZ x${mult.toFixed(2)}`, w - 20, midY);
    }
  }

  drawGameOver(ctx, w, h, scale) {
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.font = `800 ${52 * scale}px 'Caveat', cursive`;
    ctx.fillStyle = "#ff5a6e";
    ctx.fillText("OYUN BİTTİ", w / 2, h / 2 - 70 * scale);

    ctx.font = `600 ${30 * scale}px 'Nunito', sans-serif`;
    ctx.fillStyle = "#f2efe6";
    ctx.fillText(`Skor: ${this.score}`, w / 2, h / 2 - 14 * scale);

    ctx.font = `600 ${20 * scale}px 'Nunito', sans-serif`;
    if (this.newRecord) {
      ctx.fillStyle = "#ffe14d";
      ctx.fillText("🏆 YENİ REKOR!", w / 2, h / 2 + 30 * scale);
    } else {
      ctx.fillStyle = "#a49fc0";
      const rec = store.getDotsRecord(this.mode);
      ctx.fillText(rec !== null ? `Rekor: ${rec}` : "", w / 2, h / 2 + 30 * scale);
    }

    ctx.font = `500 ${16 * scale}px 'Nunito', sans-serif`;
    ctx.fillStyle = "#d8d4ec";
    ctx.fillText("Tekrar oynamak için R'ye bas veya ekrana dokun", w / 2, h / 2 + 72 * scale);
  }
}
