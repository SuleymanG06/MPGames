// Rekor deposu. Şimdilik localStorage; ileride online skor tablosuna
// (ör. Supabase/Firebase) geçmek istersen yalnızca bu dosyayı değiştirmek yeter.

const KEYS = {
  dotsSureli: "eloyun_rekor_parmak_sureli",   // en yüksek puan
  dotsSonsuz: "eloyun_rekor_parmak_sonsuz",   // en yüksek puan
  puzzle: "eloyun_rekor_puzzle",              // en düşük süre (saniye)
};

function getNum(key) {
  const v = localStorage.getItem(key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const store = {
  getDotsRecord(mode) {
    return getNum(mode === "sonsuz" ? KEYS.dotsSonsuz : KEYS.dotsSureli);
  },

  /** Yeni skor rekorsa kaydeder, rekor kırıldıysa true döner. */
  submitDotsScore(mode, score) {
    const key = mode === "sonsuz" ? KEYS.dotsSonsuz : KEYS.dotsSureli;
    const cur = getNum(key);
    if (cur === null || score > cur) {
      localStorage.setItem(key, String(score));
      return cur !== null || score > 0; // ilk oyunda 0 puanla "rekor" kutlaması olmasın
    }
    return false;
  },

  getPuzzleRecord() {
    return getNum(KEYS.puzzle);
  },

  /** Yeni süre rekorsa (daha düşükse) kaydeder, rekor kırıldıysa true döner. */
  submitPuzzleTime(seconds) {
    const cur = getNum(KEYS.puzzle);
    if (cur === null || seconds < cur) {
      localStorage.setItem(KEYS.puzzle, seconds.toFixed(1));
      return cur !== null;
    }
    return false;
  },

  resetAll() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};
