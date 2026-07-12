// Online katman: Supabase üzerinden skor tablosu ve
// Taş Kağıt Makas için gerçek zamanlı eşleşme (Realtime kanalları).
// config.js boşsa her fonksiyon sessizce devre dışı kalır.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

let client = null;

export function onlineEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

async function getClient() {
  if (!onlineEnabled()) return null;
  if (!client) {
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
    );
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

// ==================== KULLANICI ADI (SAHİPLİKLİ) ====================
// İsim ilk kez kaydedilirken bu tarayıcıya özel gizli bir anahtar üretilir
// ve isim Supabase'te o anahtara kilitlenir. Aynı ismi başka biri alamaz;
// skorlar da yalnızca ismin sahibinden kabul edilir.

const NAME_KEY = "eloyun_kullanici_adi";
const TOKEN_KEY = "eloyun_sahip_anahtari";

function getToken() {
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t =
      (crypto.randomUUID && crypto.randomUUID()) ||
      Math.random().toString(36).slice(2) + Date.now();
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

export function getUserName() {
  return localStorage.getItem(NAME_KEY) || "";
}

/**
 * İsmi sahiplenmeyi dener.
 * Dönüş: { ok, reason } — reason: alindi | zaten_senin | dolu | gecersiz | yerel | hata
 */
export async function claimUserName(name) {
  const temiz = String(name).trim().slice(0, 16);
  if (temiz.length < 2) return { ok: false, reason: "gecersiz" };

  // Online kapalıysa yalnızca yerel kaydet (skor tablosu zaten yok)
  if (!onlineEnabled()) {
    localStorage.setItem(NAME_KEY, temiz);
    return { ok: true, reason: "yerel" };
  }

  try {
    const sb = await getClient();
    const { data, error } = await sb.rpc("isim_al", {
      p_isim: temiz,
      p_token: getToken(),
    });
    if (error) throw error;
    if (data === "alindi" || data === "zaten_senin") {
      localStorage.setItem(NAME_KEY, temiz);
      return { ok: true, reason: data };
    }
    return { ok: false, reason: data }; // dolu | gecersiz
  } catch (err) {
    console.warn("İsim kaydı başarısız:", err.message || err);
    return { ok: false, reason: "hata" };
  }
}

// ==================== SKOR TABLOSU ====================
// oyun değerleri: parmak_sureli | parmak_sonsuz | puzzle | tkm_online

export async function submitScore(oyun, skor) {
  const isim = getUserName();
  if (!onlineEnabled() || !isim) return false;
  try {
    const sb = await getClient();
    const { data, error } = await sb.rpc("skor_ekle", {
      p_isim: isim,
      p_token: getToken(),
      p_oyun: oyun,
      p_skor: skor,
    });
    if (error) throw error;
    return data === true;
  } catch (err) {
    console.warn("Skor gönderilemedi:", err.message || err);
    return false;
  }
}

/** İlgili oyun için ilk 10'u döner: [{isim, skor}] */
export async function fetchTop10(oyun) {
  if (!onlineEnabled()) return null;
  try {
    const sb = await getClient();
    const { data, error } = await sb
      .from("liderler")
      .select("isim, skor")
      .eq("oyun", oyun)
      .order("skor", { ascending: oyun === "puzzle" })
      .limit(10);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn("Skor tablosu alınamadı:", err.message || err);
    return null;
  }
}

// ==================== TKM ONLINE AĞI ====================
// Eşleşme iki yolla olur:
//  - Hızlı eşleşme: 'tkm-lobi' kanalında bekleyenler kimliklerine göre
//    sıralanıp ikişerli eşlenir; iki taraf da aynı oda adını hesaplar.
//  - Oda kodu: 4 haneli kod; iki oyuncu aynı 'tkm-oda-KOD' kanalına girer.
// Oda içinde hamleler broadcast mesajlarıyla taşınır.

export class RpsNet {
  constructor() {
    this.myId =
      (crypto.randomUUID && crypto.randomUUID()) ||
      Math.random().toString(36).slice(2) + Date.now();
    this.lobby = null;
    this.room = null;
    this.opponent = null;
    this.handlers = {};
    this.paired = false;
  }

  on(event, fn) { this.handlers[event] = fn; }
  emit(event, data) { this.handlers[event]?.(data); }

  /** Lobide bekleyip otomatik rakip bulur. */
  async quickMatch(name, onStatus) {
    const sb = await getClient();
    if (!sb) throw new Error("Online özellikler yapılandırılmamış");

    onStatus?.("Rakip aranıyor…");
    this.lobby = sb.channel("tkm-lobi", {
      config: { presence: { key: this.myId } },
    });

    this.lobby.on("presence", { event: "sync" }, () => {
      if (this.paired) return;
      const state = this.lobby.presenceState();
      const ids = Object.keys(state).sort();
      const i = ids.indexOf(this.myId);
      if (i === -1) return;
      const partner = i % 2 === 0 ? ids[i + 1] : ids[i - 1];
      if (!partner) {
        onStatus?.(`Rakip aranıyor… (lobide ${ids.length} kişi)`);
        return;
      }
      this.paired = true;
      const roomId = "tkm-" + [this.myId, partner].sort().join("~");
      const eski = this.lobby;
      this.lobby = null;
      eski.unsubscribe();
      onStatus?.("Rakip bulundu, odaya giriliyor…");
      this.joinRoomChannel(sb, roomId, name).catch((e) =>
        this.emit("error", e)
      );
    });

    await new Promise((res, rej) =>
      this.lobby.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await this.lobby.track({ name });
          res();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          rej(new Error("Lobiye bağlanılamadı"));
        }
      })
    );
  }

  /** Oda kurar, 4 haneli kodu döner. */
  async createRoom(name) {
    const sb = await getClient();
    if (!sb) throw new Error("Online özellikler yapılandırılmamış");
    const code = String(Math.floor(1000 + Math.random() * 9000));
    await this.joinRoomChannel(sb, "tkm-oda-" + code, name);
    return code;
  }

  /** Koda göre odaya katılır. */
  async joinRoom(code, name) {
    const sb = await getClient();
    if (!sb) throw new Error("Online özellikler yapılandırılmamış");
    await this.joinRoomChannel(sb, "tkm-oda-" + String(code).trim(), name);
  }

  async joinRoomChannel(sb, roomId, name) {
    this.room = sb.channel(roomId, {
      config: {
        presence: { key: this.myId },
        broadcast: { self: false },
      },
    });

    this.room.on("presence", { event: "sync" }, () => {
      const state = this.room.presenceState();
      const others = Object.keys(state).filter((k) => k !== this.myId);
      if (others.length > 0 && !this.opponent) {
        this.opponent = {
          id: others[0],
          name: state[others[0]][0]?.name || "Rakip",
        };
        this.emit("opponent", this.opponent);
      }
    });

    this.room.on("presence", { event: "leave" }, ({ key }) => {
      if (this.opponent && key === this.opponent.id) {
        this.emit("opponent_left");
      }
    });

    this.room.on("broadcast", { event: "msg" }, ({ payload }) => {
      if (payload?.from !== this.myId) this.emit("msg", payload);
    });

    await new Promise((res, rej) =>
      this.room.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await this.room.track({ name });
          res();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          rej(new Error("Odaya bağlanılamadı"));
        }
      })
    );
  }

  send(data) {
    this.room?.send({
      type: "broadcast",
      event: "msg",
      payload: { from: this.myId, ...data },
    });
  }

  leave() {
    this.paired = true; // sync tetiklenirse eşleşmesin
    try { this.lobby?.unsubscribe(); } catch {}
    try { this.room?.unsubscribe(); } catch {}
    this.lobby = null;
    this.room = null;
    this.opponent = null;
    this.handlers = {};
  }
}
