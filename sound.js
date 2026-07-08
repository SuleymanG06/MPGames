// Küçük sentez ses efektleri (dosya yok, Web Audio ile üretilir).

let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setMuted(m) { muted = m; }
export function isMuted() { return muted; }

function tone({ freq = 440, freqEnd = null, dur = 0.12, type = "sine", gain = 0.18, when = 0 }) {
  if (muted) return;
  const a = ac();
  const t0 = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  pop()      { tone({ freq: 620, freqEnd: 980, dur: 0.09, type: "triangle", gain: 0.2 }); },
  bonus()    { tone({ freq: 720, freqEnd: 1400, dur: 0.16, type: "square", gain: 0.12 }); },
  heart()    { tone({ freq: 520, dur: 0.1, type: "sine" }); tone({ freq: 780, dur: 0.14, type: "sine", when: 0.09 }); },
  bad()      { tone({ freq: 220, freqEnd: 90, dur: 0.22, type: "sawtooth", gain: 0.14 }); },
  tick()     { tone({ freq: 880, dur: 0.06, type: "square", gain: 0.08 }); },
  go()       { tone({ freq: 1320, dur: 0.16, type: "square", gain: 0.1 }); },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.16, type: "triangle", when: i * 0.12, gain: 0.16 }));
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.18, type: "sawtooth", when: i * 0.13, gain: 0.1 }));
  },
  record() {
    [660, 880, 660, 880, 1320].forEach((f, i) => tone({ freq: f, dur: 0.12, type: "square", when: i * 0.09, gain: 0.12 }));
  },
  snap()     { tone({ freq: 300, freqEnd: 900, dur: 0.07, type: "triangle", gain: 0.15 }); },
};
