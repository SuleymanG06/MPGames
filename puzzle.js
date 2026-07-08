// El izleme: MediaPipe Tasks Vision (hand_landmarker) sarmalayıcısı.
// Görüntü ayna gibi (selfie) gösterildiği için tüm koordinatlar ve
// el etiketi (sol/sağ) burada aynalanmış hâle çevrilir; oyunlar
// hiçbir dönüşümle uğraşmaz.

import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

let landmarker = null;
let lastVideoTime = -1;
let lastHands = [];

// Parmak eklem bağlantıları (iskelet çizimi için)
export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export async function initHandLandmarker(onStatus) {
  if (landmarker) return;
  onStatus?.("El modeli indiriliyor…");
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

/**
 * O anki video karesinden elleri çıkarır.
 * Dönen her el: { label, points[21]{x,y}, pinch, pinchDist, cursor{x,y}, size }
 * Koordinatlar canvas pikseli cinsinden ve AYNALANMIŞTIR.
 */
export function detectHands(video, w, h) {
  if (!landmarker || video.readyState < 2) return lastHands;

  // Aynı kareyi iki kez işlemeyelim
  if (video.currentTime === lastVideoTime) return lastHands;
  lastVideoTime = video.currentTime;

  const res = landmarker.detectForVideo(video, performance.now());
  const hands = [];
  const handedList = res.handednesses || res.handedness || [];

  if (res.landmarks) {
    for (let i = 0; i < res.landmarks.length; i++) {
      const lms = res.landmarks[i];
      const points = lms.map((lm) => ({
        x: (1 - lm.x) * w, // ayna
        y: lm.y * h,
      }));

      // Model, ham (aynalanmamış) kare üzerinde tahmin yapar;
      // ekranı aynaladığımız için etiketi ters çeviriyoruz.
      let label = "Unknown";
      const cat = handedList[i]?.[0];
      if (cat) {
        label =
          cat.categoryName === "Left" ? "Right" :
          cat.categoryName === "Right" ? "Left" : "Unknown";
      }

      const size = Math.hypot(points[0].x - points[9].x, points[0].y - points[9].y);
      const pinchDist = Math.hypot(points[4].x - points[8].x, points[4].y - points[8].y);

      hands.push({
        label,
        points,
        size,
        pinchDist,
        pinch: pinchDist < Math.max(26, size * 0.4),
        cursor: {
          x: (points[4].x + points[8].x) / 2,
          y: (points[4].y + points[8].y) / 2,
        },
      });
    }
  }

  lastHands = hands;
  return hands;
}

/** Parmakların açık/kapalı durumundan Taş / Kağıt / Makas çıkarımı. */
export function detectGesture(hand) {
  const p = hand.points;

  // Baş parmak: uç, IP eklemine göre serçe köküne (17) daha uzaksa açıktır.
  // Elin yönünden bağımsız çalışır (sol/sağ, ters açı fark etmez).
  const dTip = Math.hypot(p[4].x - p[17].x, p[4].y - p[17].y);
  const dIp = Math.hypot(p[3].x - p[17].x, p[3].y - p[17].y);
  const thumbOpen = dTip > dIp * 1.08;

  const indexOpen = p[8].y < p[6].y;
  const middleOpen = p[12].y < p[10].y;
  const ringOpen = p[16].y < p[14].y;
  const pinkyOpen = p[20].y < p[18].y;

  if (!thumbOpen && !indexOpen && !middleOpen && !ringOpen && !pinkyOpen) return "Taş";
  if (thumbOpen && indexOpen && middleOpen && ringOpen && pinkyOpen) return "Kağıt";
  if (!thumbOpen && indexOpen && middleOpen && !ringOpen && !pinkyOpen) return "Makas";
  return "Bilinmiyor";
}

/** İnce beyaz iskelet çizimi (puzzle görünümü). */
export function drawWireframe(ctx, hand, color = "rgba(255,255,255,0.9)") {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1;
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(hand.points[a].x, hand.points[a].y);
    ctx.lineTo(hand.points[b].x, hand.points[b].y);
    ctx.stroke();
  }
  for (const pt of hand.points) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
