// Taş Kağıt Makas — 5 puana ilk ulaşan kazanır.
// Not: Python prototipteki "oyuncu 4 puana gelince bilgisayar hile yapar"
// davranışı kaldırıldı; bilgisayar her zaman tamamen rastgele oynar.

import { detectGesture } from "./hand.js";

const WIN_SCORE = 5;
const MOVES = ["Taş", "Kağıt", "Makas"];
const EMOJI = { "Taş": "✊", "Kağıt": "✋", "Makas": "✌️", "Bilinmiyor": "❓", "-": "–" };

function beats(a, b) {
  return (
    (a === "Taş" && b === "Makas") ||
    (a === "Kağıt" && b === "Taş") ||
    (a === "Makas" && b === "Kağıt")
  );
}

export class RPSGame {
  constructor(env) {
    this.env = env; // { canvas, ctx, sfx }
    this.title = "Taş Kağıt Makas";
  }

  enter() {
    this.state = "waiting"; // waiting | countdown | result | finished
    this.countdownStart = 0;
    this.lastTickSecond = -1;
    this.playerChoice = "-";
    this.computerChoice = "-";
    this.resultText = "Başlamak için S'ye bas veya ekrana dokun";
    this.playerScore = 0;
    this.computerScore = 0;
    this.history = []; // son raundlar: "S" sen, "B" bilgisayar, "=" berabere
  }

  exit() {}

  startRound() {
    if (this.state !== "waiting" && this.state !== "result") return;
    this.state = "countdown";
    this.countdownStart = performance.now();
    this.lastTickSecond = -1;
    this.playerChoice = "-";
    this.computerChoice = "-";
    this.resultText = "Hazır ol…";
  }

  resetGame() {
    this.enter();
  }

  onKey(key) {
    if (key === "s") this.startRound();
    if (key === "r") this.resetGame();
  }

  onClick() {
    if (this.state === "finished") this.resetGame();
    else this.startRound();
  }

  update(dt, hands, w, h) {
    const { ctx, sfx } = this.env;

    // Anlık hareket
    let currentGesture = "Bilinmiyor";
    if (hands.length > 0) currentGesture = detectGesture(hands[0]);

    // El noktalarını çiz
    if (hands.length > 0) {
      const p = hands[0].points;
      ctx.fillStyle = "#5be38a";
      for (const pt of p) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#ffe14d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p[8].x, p[8].y, 12, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Geri sayım durumu
    if (this.state === "countdown") {
      const elapsed = (performance.now() - this.countdownStart) / 1000;
      const second = Math.floor(elapsed);

      if (elapsed < 3) {
        if (second !== this.lastTickSecond) {
          this.lastTickSecond = second;
          sfx.tick();
        }
        const num = String(3 - second);
        const scale = 1 + (1 - (elapsed % 1)) * 0.25;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.font = "800 130px 'Caveat', cursive";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.fillText(num, 4, 6);
        ctx.fillStyle = "#ffb03a";
        ctx.fillText(num, 0, 0);
        ctx.restore();
      } else {
        // An geldi: eller okunur
        sfx.go();
        this.playerChoice = currentGesture;
        this.computerChoice = MOVES[Math.floor(Math.random() * MOVES.length)];
        this.resolveRound();
      }
    }

    this.drawTopBar(ctx, w);
    this.drawBottomBar(ctx, w, h, currentGesture);

    if (this.state === "result" || this.state === "finished") {
      this.drawShowdown(ctx, w, h);
    }
    if (this.state === "finished") {
      this.drawFinished(ctx, w, h);
    }
  }

  resolveRound() {
    const { sfx } = this.env;
    const p = this.playerChoice;
    const c = this.computerChoice;

    if (p === "Bilinmiyor") {
      this.resultText = "El hareketi algılanamadı, tekrar dene";
      this.state = "result";
      sfx.bad();
      return;
    }

    if (p === c) {
      this.resultText = "Berabere";
      this.history.push("=");
    } else if (beats(p, c)) {
      this.resultText = "Sen kazandın!";
      this.playerScore++;
      this.history.push("S");
      sfx.pop();
    } else {
      this.resultText = "Bilgisayar kazandı";
      this.computerScore++;
      this.history.push("B");
      sfx.bad();
    }
    if (this.history.length > 9) this.history.shift();

    if (this.playerScore >= WIN_SCORE) {
      this.resultText = "Oyun bitti — kazandın! 🎉";
      this.state = "finished";
      sfx.win();
    } else if (this.computerScore >= WIN_SCORE) {
      this.resultText = "Oyun bitti — bilgisayar kazandı";
      this.state = "finished";
      sfx.lose();
    } else {
      this.state = "result";
    }
  }

  drawTopBar(ctx, w) {
    ctx.fillStyle = "rgba(18,16,31,.88)";
    ctx.fillRect(0, 0, w, 58);
    ctx.strokeStyle = "#45e0d8";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 58); ctx.lineTo(w, 58); ctx.stroke();

    ctx.textBaseline = "middle";
    ctx.font = "600 22px 'Nunito', sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffb03a";
    ctx.fillText(`Sen: ${this.playerScore}`, 20, 30);
    ctx.textAlign = "right";
    ctx.fillStyle = "#f2efe6";
    ctx.fillText(`Bilgisayar: ${this.computerScore}`, w - 20, 30);

    // Seri geçmişi (ortada küçük noktalar)
    ctx.textAlign = "center";
    ctx.font = "600 15px 'Nunito', sans-serif";
    if (this.history.length) {
      let x = w / 2 - (this.history.length - 1) * 9;
      for (const r of this.history) {
        ctx.fillStyle = r === "S" ? "#5be38a" : r === "B" ? "#ff5a6e" : "#a49fc0";
        ctx.fillText(r === "=" ? "○" : "●", x, 30);
        x += 18;
      }
    }
  }

  drawBottomBar(ctx, w, h, currentGesture) {
    ctx.fillStyle = "rgba(18,16,31,.88)";
    ctx.fillRect(0, h - 88, w, 88);
    ctx.strokeStyle = "#45e0d8";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, h - 88); ctx.lineTo(w, h - 88); ctx.stroke();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = "600 18px 'Nunito', sans-serif";
    ctx.fillStyle = "#5be38a";
    ctx.fillText(`Anlık hareket: ${currentGesture} ${EMOJI[currentGesture] || ""}`, 20, h - 58);

    ctx.fillStyle = "#f2efe6";
    ctx.font = "500 17px 'Nunito', sans-serif";
    ctx.fillText(this.resultText, 20, h - 26);

    let help = "";
    if (this.state === "waiting") help = "Başlamak için S / dokun";
    else if (this.state === "result") help = "Yeni raund için S / dokun";
    else if (this.state === "finished") help = "Yeniden başlamak için R / dokun";
    if (help) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffb03a";
      ctx.font = "600 16px 'Nunito', sans-serif";
      ctx.fillText(help, w - 20, h - 26);
    }
  }

  drawShowdown(ctx, w, h) {
    const text = `Sen ${EMOJI[this.playerChoice]}  ${this.playerChoice}   —   ${this.computerChoice}  ${EMOJI[this.computerChoice]} PC`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 26px 'Caveat', cursive";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(18,16,31,.75)";
    const bx = w / 2 - tw / 2 - 18;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(bx, 76, tw + 36, 46, 12);
      ctx.fill();
    } else {
      ctx.fillRect(bx, 76, tw + 36, 46);
    }
    ctx.fillStyle = "#f2efe6";
    ctx.fillText(text, w / 2, 99);
  }

  drawFinished(ctx, w, h) {
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, 58, w, h - 58 - 88);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 54px 'Caveat', cursive";
    ctx.fillStyle = this.playerScore >= WIN_SCORE ? "#5be38a" : "#ff5a6e";
    ctx.fillText(this.playerScore >= WIN_SCORE ? "KAZANDIN!" : "KAYBETTİN", w / 2, h / 2 - 20);
    ctx.font = "500 20px 'Nunito', sans-serif";
    ctx.fillStyle = "#f2efe6";
    ctx.fillText(`${this.playerScore} — ${this.computerScore}`, w / 2, h / 2 + 28);
  }
}
