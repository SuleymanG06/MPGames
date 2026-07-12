// Taş Kağıt Makas — 5 puana ilk ulaşan kazanır.
// İki mod: bilgisayara karşı (çevrimdışı) ve gerçek rakibe karşı (online).
// Online modda hamleler Supabase Realtime kanalıyla taşınır (bkz. online.js).

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
    this.env = env; // { canvas, ctx, sfx, submitScore }
    this.title = "Taş Kağıt Makas";
    this.needsRpsSelect = true;
  }

  enter() {
    this.online = false;
    this.net = null;
    this.myName = "Sen";
    this.oppName = "Bilgisayar";
    this.state = "select"; // select | connect | waiting | countdown | reveal | result | finished | left
    this.round = 0;
    this.countdownStart = 0;
    this.lastTickSecond = -1;
    this.playerChoice = "-";
    this.computerChoice = "-";
    this.myMove = null;
    this.oppMove = null;
    this.resultText = "";
    this.statusText = "";
    this.playerScore = 0;
    this.computerScore = 0;
    this.history = [];
    this.winSubmitted = false;
  }

  exit() {
    this.net?.leave();
    this.net = null;
  }

  // ---------- mod başlatıcılar ----------

  startOffline() {
    this.online = false;
    this.oppName = "Bilgisayar";
    this.state = "waiting";
    this.resultText = "Başlamak için S'ye bas veya ekrana dokun";
  }

  /** net: RpsNet — bağlantı main.js'te kurulur, oyun burada devralır. */
  startOnline(net, myName) {
    this.online = true;
    this.net = net;
    this.myName = myName || "Sen";
    this.state = "connect";
    this.statusText = "Rakip bekleniyor…";
    this.resultText = "";

    net.on("opponent", (opp) => {
      this.oppName = opp.name;
      if (this.state === "connect") {
        this.state = "waiting";
        this.resultText = this.net?.isHost
          ? `${opp.name} geldi! Başlamak için S'ye bas`
          : `${opp.name} geldi! Oda sahibi başlatacak`;
        this.env.sfx.go();
      }
    });

    net.on("msg", (m) => this.onNetMsg(m));

    net.on("opponent_left", () => {
      if (this.state !== "finished") {
        this.state = "left";
        this.resultText = "Rakip oyundan ayrıldı";
        this.env.sfx.lose();
      }
    });

    net.on("error", (e) => {
      this.state = "left";
      this.resultText = "Bağlantı hatası: " + (e.message || e);
    });

    // Oda zaten doluysa (biz katılan taraf isek) opponent anında düşer
    if (net.opponent) {
      this.oppName = net.opponent.name;
      this.state = "waiting";
      this.resultText = this.net?.isHost
        ? `${this.oppName} ile eşleştin! Başlamak için S'ye bas`
        : `${this.oppName} ile eşleştin! Oda sahibi başlatacak`;
    }
  }

  onNetMsg(m) {
    if (m.t === "start") {
      if (m.round > this.round) this.beginCountdown(m.round);
    } else if (m.t === "move") {
      if (m.round === this.round) {
        this.oppMove = m.move;
        this.tryResolveOnline();
      }
    } else if (m.t === "rematch") {
      this.resetScores();
      this.state = "waiting";
      this.resultText = "Rövanş! Oda sahibi başlatacak";
    }
  }

  resetScores() {
    this.playerScore = 0;
    this.computerScore = 0;
    this.round = 0;
    this.history = [];
    this.playerChoice = "-";
    this.computerChoice = "-";
    this.winSubmitted = false;
  }

  // ---------- raund akışı ----------

  beginCountdown(round) {
    if (this.state === "countdown" && round === this.round) return;
    this.round = round;
    this.state = "countdown";
    this.countdownStart = performance.now();
    this.lastTickSecond = -1;
    this.playerChoice = "-";
    this.computerChoice = "-";
    this.myMove = null;
    this.oppMove = null;
    this.resultText = "Hazır ol…";
  }

  requestRound() {
    if (this.state !== "waiting" && this.state !== "result") return;
    if (this.online) {
      if (!this.net?.isHost) {
        this.resultText = "Raundu oda sahibi başlatır — bekle";
        return;
      }
      const next = this.round + 1;
      this.net?.send({ t: "start", round: next });
      this.beginCountdown(next);
    } else {
      this.beginCountdown(this.round + 1);
    }
  }

  requestRematch() {
    if (this.online) {
      if (!this.net?.isHost) {
        this.resultText = "Rövanşı oda sahibi başlatır — bekle";
        return;
      }
      this.net?.send({ t: "rematch" });
      this.resetScores();
      this.state = "waiting";
      this.resultText = "Rövanş! Başlamak için S'ye bas";
    } else {
      const on = this.online;
      this.enter();
      this.online = on;
      this.startOffline();
    }
  }

  onKey(key) {
    if (this.state === "select" || this.state === "connect") return;
    if (key === "s") this.requestRound();
    if (key === "r" && this.state === "finished") this.requestRematch();
  }

  onClick() {
    if (this.state === "select" || this.state === "connect" || this.state === "left") return;
    if (this.state === "finished") this.requestRematch();
    else this.requestRound();
  }

  // ---------- çözümleme ----------

  tryResolveOnline() {
    if (this.myMove === null || this.oppMove === null) return;
    if (this.state !== "reveal") return;

    this.playerChoice = this.myMove;
    this.computerChoice = this.oppMove;
    const me = this.myMove;
    const op = this.oppMove;
    const { sfx } = this.env;

    if (me === "Bilinmiyor" && op === "Bilinmiyor") {
      this.resultText = "İki el de algılanamadı — raund sayılmadı";
      this.state = "result";
      sfx.bad();
      return;
    }
    if (me === "Bilinmiyor") {
      this.resultText = "Elin algılanamadı — raund rakibin";
      this.computerScore++;
      this.history.push("B");
      sfx.bad();
    } else if (op === "Bilinmiyor") {
      this.resultText = "Rakibin eli algılanamadı — raund senin!";
      this.playerScore++;
      this.history.push("S");
      sfx.pop();
    } else if (me === op) {
      this.resultText = "Berabere";
      this.history.push("=");
    } else if (beats(me, op)) {
      this.resultText = "Sen kazandın!";
      this.playerScore++;
      this.history.push("S");
      sfx.pop();
    } else {
      this.resultText = `${this.oppName} kazandı`;
      this.computerScore++;
      this.history.push("B");
      sfx.bad();
    }
    if (this.history.length > 9) this.history.shift();
    this.checkMatchEnd();
  }

  resolveOffline() {
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
    this.checkMatchEnd();
  }

  checkMatchEnd() {
    const { sfx } = this.env;
    if (this.playerScore >= WIN_SCORE) {
      this.resultText = "Oyun bitti — kazandın! 🎉";
      this.state = "finished";
      sfx.win();
      if (this.online && !this.winSubmitted) {
        this.winSubmitted = true;
        this.env.submitScore?.("tkm_online", 1);
      }
    } else if (this.computerScore >= WIN_SCORE) {
      this.resultText = `Oyun bitti — ${this.oppName} kazandı`;
      this.state = "finished";
      sfx.lose();
    } else {
      this.state = "result";
    }
  }

  // ---------- ana döngü ----------

  update(dt, hands, w, h) {
    const { ctx, sfx } = this.env;

    let currentGesture = "Bilinmiyor";
    if (hands.length > 0) currentGesture = detectGesture(hands[0]);

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
        ctx.font = "700 150px 'Caveat', cursive";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(0,0,0,.35)";
        ctx.fillText(num, 4, 6);
        ctx.fillStyle = "#ffb03a";
        ctx.fillText(num, 0, 0);
        ctx.restore();
      } else {
        sfx.go();
        if (this.online) {
          this.myMove = currentGesture;
          this.state = "reveal";
          this.resultText = "Rakibin hamlesi bekleniyor…";
          this.net?.send({ t: "move", round: this.round, move: this.myMove });
          this.tryResolveOnline();
        } else {
          this.playerChoice = currentGesture;
          this.computerChoice = MOVES[Math.floor(Math.random() * MOVES.length)];
          this.resolveOffline();
        }
      }
    }

    this.drawTopBar(ctx, w);
    this.drawBottomBar(ctx, w, h, currentGesture);

    if (this.state === "connect") {
      this.drawCenterNote(ctx, w, h, this.statusText, "#ffe14d");
    } else if (this.state === "left") {
      this.drawCenterNote(ctx, w, h, this.resultText + " — menüye dönebilirsin", "#ff5a6e");
    }

    if (["result", "finished", "reveal"].includes(this.state)) {
      this.drawShowdown(ctx, w, h);
    }
    if (this.state === "finished") {
      this.drawFinished(ctx, w, h);
    }
  }

  // ---------- çizimler ----------

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
    ctx.fillText(`${this.online ? this.myName : "Sen"}: ${this.playerScore}`, 20, 30);
    ctx.textAlign = "right";
    ctx.fillStyle = "#f2efe6";
    ctx.fillText(`${this.oppName}: ${this.computerScore}`, w - 20, 30);

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
    const guest = this.online && this.net && !this.net.isHost;
    if (this.state === "waiting")
      help = guest ? "Oda sahibi başlatacak…" : "Başlamak için S / dokun";
    else if (this.state === "result")
      help = guest ? "Yeni raundu oda sahibi başlatır…" : "Yeni raund için S / dokun";
    else if (this.state === "finished")
      help = this.online
        ? (guest ? "Rövanşı oda sahibi başlatır…" : "Rövanş için R / dokun")
        : "Yeniden başlamak için R / dokun";
    if (help) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#ffb03a";
      ctx.font = "600 16px 'Nunito', sans-serif";
      ctx.fillText(help, w - 20, h - 26);
    }
  }

  drawCenterNote(ctx, w, h, text, color) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 34px 'Caveat', cursive";
    ctx.fillStyle = "rgba(18,16,31,.75)";
    const tw = ctx.measureText(text).width;
    ctx.fillRect(w / 2 - tw / 2 - 20, h / 2 - 34, tw + 40, 68);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
  }

  drawShowdown(ctx, w, h) {
    const opp = this.state === "reveal" ? "❓" : `${this.computerChoice}  ${EMOJI[this.computerChoice]}`;
    const text = `Sen ${EMOJI[this.playerChoice]}  ${this.playerChoice}   —   ${opp} ${this.oppName}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 30px 'Caveat', cursive";
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
    ctx.font = "700 64px 'Caveat', cursive";
    const won = this.playerScore >= WIN_SCORE;
    ctx.fillStyle = won ? "#5be38a" : "#ff5a6e";
    ctx.fillText(won ? "KAZANDIN!" : "KAYBETTİN", w / 2, h / 2 - 20);
    ctx.font = "500 20px 'Nunito', sans-serif";
    ctx.fillStyle = "#f2efe6";
    ctx.fillText(`${this.playerScore} — ${this.computerScore}`, w / 2, h / 2 + 28);
  }
}
