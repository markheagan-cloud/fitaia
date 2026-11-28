/**
 * Compteur de pompes « zéro erreur » à partir de points de pose (Apple Vision / tout détecteur 2D).
 * Règles : une rep = descente jusqu'à ≤ 90° aux coudes PUIS remontée bras tendus (≥ 160°), corps aligné (hanche sur la ligne épaule-cheville).
 * Hystérésis + lissage pour éviter les faux comptes ; chaque refus a une raison lisible.
 */
export type Pt = { x: number; y: number; c: number }; // c = confiance 0–1
export type Pose = {
  shoulder: Pt; elbow: Pt; wrist: Pt; hip: Pt; knee: Pt; ankle: Pt; // côté filmé (profil)
};

export type RepEvent =
  | { type: 'rep'; count: number }
  | { type: 'rejected'; reason: string; why?: 'depth' | 'align' }
  | { type: 'posture' }
  | { type: 'tracking'; ok: boolean; reason?: string };

export const THRESH = {
  minConfidence: 0.35,
  elbowDown: 95, // angle coude ≤ 95° mesuré = position basse validée (90° demandés, 5° de marge pour l'estimation 2D de la caméra)
  elbowUp: 160, // angle coude ≥ 160° = bras tendus
  alignMaxDeg: 18, // écart max hanche / ligne épaule-cheville
  smooth: 0.5, // lissage exponentiel des angles
  attemptMax: 135, // une descente qui ne passe pas sous 135° n'est pas une tentative (on ajuste ses mains) : ni comptée ni reprochée
  plankMaxTilt: 40, // ligne épaule → pieds à moins de 40° de l'horizontale = en position de pompe (debout ou à genoux redressé = non)
  postureFrames: 20, // ≈ 1,3 s hors position avant de le dire
} as const;

/** Inclinaison (°) de la ligne épaule → pieds par rapport à l'horizontale (0 = allongé, 90 = debout). Coordonnées non écrasées. */
export function bodyTilt(p: Pose): number {
  const f = footOf(p) ?? p.ankle;
  const dx = Math.abs(f.x - p.shoulder.x), dy = Math.abs(f.y - p.shoulder.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export type P3 = { x: number; y: number; z: number };
export type Pose3 = Record<'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle', P3>;

/** Angle en 3D (positions en mètres) : juste même si la personne n'est pas parfaitement de profil. */
export function angle3(a: P3, b: P3, c: P3): number {
  const u = [a.x - b.x, a.y - b.y, a.z - b.z], v = [c.x - b.x, c.y - b.y, c.z - b.z];
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const m = Math.hypot(u[0], u[1], u[2]) * Math.hypot(v[0], v[1], v[2]) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

export function angle(a: Pt, b: Pt, c: Pt): number {
  const abx = a.x - b.x, aby = a.y - b.y, cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const m = Math.hypot(abx, aby) * Math.hypot(cbx, cby) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

/** Écart (°) entre la hanche et la ligne épaule→cheville : 0 = parfaitement gainé. */
export function alignmentDeviation(p: Pose): number {
  return Math.abs(180 - angle(p.shoulder, p.hip, footOf(p) ?? p.ankle));
}

/** Point bas du corps pour juger l'alignement : la cheville, sinon le genou (souvent mieux vu au ras du sol). */
export function footOf(p: Pose): Pt | null {
  if (p.ankle.c >= THRESH.minConfidence) return p.ankle;
  if (p.knee.c >= THRESH.minConfidence) return p.knee;
  return null;
}

/** Corrige l'écrasement de l'image : les coordonnées normalisées n'ont pas la même échelle en x et en y. */
export function unsquash(p: Pose, aspect: number): Pose {
  const f = (q: Pt): Pt => ({ x: q.x * aspect, y: q.y, c: q.c });
  return { shoulder: f(p.shoulder), elbow: f(p.elbow), wrist: f(p.wrist), hip: f(p.hip), knee: f(p.knee), ankle: f(p.ankle) };
}

export class PushupCounter {
  count = 0;
  private phase: 'up' | 'down' = 'up';
  private reachedBottom = false;
  private minElbow = 180;
  private elbowS = 180;
  private badFrames = 0;
  private offPlank = 0;

  reset() {
    this.count = 0; this.phase = 'up'; this.reachedBottom = false; this.minElbow = 180; this.elbowS = 180; this.badFrames = 0; this.offPlank = 0;
  }

  /** En position de pompe (corps allongé) sur la dernière image analysée. */
  get inPosition() {
    return this.offPlank === 0;
  }

  /**
   * À appeler à chaque image (10–30 Hz). `p` : points de l'image (visibilité, posture) ;
   * `p3` (facultatif, MediaPipe) : mêmes points en 3D, utilisés pour les angles du coude et l'alignement.
   */
  update(p: Pose, p3?: Pose3): RepEvent[] {
    const ev: RepEvent[] = [];
    const pts = [p.shoulder, p.elbow, p.wrist, p.hip];
    if (pts.some((q) => q.c < THRESH.minConfidence) || !footOf(p)) {
      this.badFrames++;
      if (this.badFrames === 5) ev.push({ type: 'tracking', ok: false, reason: 'Je ne vois pas tout ton corps : recule un peu, de profil.' });
      return ev;
    }
    if (this.badFrames >= 5) ev.push({ type: 'tracking', ok: true });
    this.badFrames = 0;

    // Debout, assis ou en train de s'installer : rien ne compte et la descente en cours est oubliée.
    if (bodyTilt(p) > THRESH.plankMaxTilt) {
      this.offPlank++;
      // dit au bout de ≈ 1,3 s, puis redit toutes les ≈ 8 s tant que la personne n'est pas en position
      if (this.offPlank === THRESH.postureFrames || (this.offPlank > THRESH.postureFrames && (this.offPlank - THRESH.postureFrames) % 120 === 0)) ev.push({ type: 'posture' });
      this.phase = 'up'; this.reachedBottom = false; this.minElbow = 180; this.elbowS = 180;
      return ev;
    }
    this.offPlank = 0;

    const raw = p3 ? angle3(p3.shoulder, p3.elbow, p3.wrist) : angle(p.shoulder, p.elbow, p.wrist);
    this.elbowS = this.elbowS * THRESH.smooth + raw * (1 - THRESH.smooth);
    const e = this.elbowS;
    const foot3 = p3 ? (p.ankle.c >= THRESH.minConfidence ? p3.ankle : p3.knee) : null;
    const dev = p3 && foot3 ? Math.abs(180 - angle3(p3.shoulder, p3.hip, foot3)) : alignmentDeviation(p);
    const aligned = dev <= THRESH.alignMaxDeg;

    if (this.phase === 'up') {
      if (e < THRESH.elbowUp - 15) {
        this.phase = 'down';
        this.minElbow = e;
        this.reachedBottom = e <= THRESH.elbowDown;
      }
    } else {
      this.minElbow = Math.min(this.minElbow, e);
      if (e <= THRESH.elbowDown) this.reachedBottom = true;
      if (e >= THRESH.elbowUp) {
        // remontée terminée : on juge la rep
        if (!this.reachedBottom) {
          // petite flexion (on ajuste ses mains) : pas une tentative, on ne la reproche pas
          if (this.minElbow <= THRESH.attemptMax) ev.push({ type: 'rejected', why: 'depth', reason: 'Pas comptée : descends jusqu’à 90° aux coudes (' + Math.round(this.minElbow) + '° atteint).' });
        } else if (!aligned) ev.push({ type: 'rejected', why: 'align', reason: 'Pas comptée : garde le corps gainé et aligné.' });
        else {
          this.count++;
          ev.push({ type: 'rep', count: this.count });
        }
        this.phase = 'up';
        this.reachedBottom = false;
        this.minElbow = 180;
      }
    }
    return ev;
  }
}

// ── Squats ──────────────────────────────────────────────────────────────────────────────────────
export const SQUAT = { kneeDown: 95, kneeUp: 165, torsoMaxLean: 50 } as const;

/** Angle du tronc par rapport à la verticale (0 = droit). */
export function torsoLean(p: Pose): number {
  const dx = p.shoulder.x - p.hip.x, dy = p.shoulder.y - p.hip.y;
  return Math.abs((Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI);
}

/** Une rep = genoux pliés à ≤ 95° PUIS jambes tendues (≥ 165°), tronc pas trop penché (≤ 50°). */
export class SquatCounter {
  count = 0;
  private phase: 'up' | 'down' = 'up';
  private reachedBottom = false;
  private minKnee = 180;
  private kneeS = 180;
  private leaned = false;
  private badFrames = 0;

  reset() {
    this.count = 0; this.phase = 'up'; this.reachedBottom = false; this.minKnee = 180; this.kneeS = 180; this.leaned = false; this.badFrames = 0;
  }

  update(p: Pose): RepEvent[] {
    const ev: RepEvent[] = [];
    const pts = [p.shoulder, p.hip, p.knee, p.ankle];
    if (pts.some((q) => q.c < THRESH.minConfidence)) {
      this.badFrames++;
      if (this.badFrames === 5) ev.push({ type: 'tracking', ok: false, reason: 'Je ne vois pas tes jambes : recule, de profil, pieds visibles.' });
      return ev;
    }
    if (this.badFrames >= 5) ev.push({ type: 'tracking', ok: true });
    this.badFrames = 0;
    const raw = angle(p.hip, p.knee, p.ankle);
    this.kneeS = this.kneeS * THRESH.smooth + raw * (1 - THRESH.smooth);
    const k = this.kneeS;
    if (torsoLean(p) > SQUAT.torsoMaxLean) this.leaned = true;
    if (this.phase === 'up') {
      if (k < SQUAT.kneeUp - 15) {
        this.phase = 'down';
        this.minKnee = k;
        this.reachedBottom = k <= SQUAT.kneeDown;
        this.leaned = torsoLean(p) > SQUAT.torsoMaxLean;
      }
    } else {
      this.minKnee = Math.min(this.minKnee, k);
      if (k <= SQUAT.kneeDown) this.reachedBottom = true;
      if (k >= SQUAT.kneeUp) {
        if (!this.reachedBottom) ev.push({ type: 'rejected', reason: 'Pas comptée : descends jusqu’à 95° aux genoux (' + Math.round(this.minKnee) + '° atteint).' });
        else if (this.leaned) ev.push({ type: 'rejected', reason: 'Pas comptée : garde le buste plus droit.' });
        else {
          this.count++;
          ev.push({ type: 'rep', count: this.count });
        }
        this.phase = 'up';
        this.reachedBottom = false;
        this.leaned = false;
      }
    }
    return ev;
  }
}

// ── Gainage ─────────────────────────────────────────────────────────────────────────────────────
export const PLANK = { alignMaxDeg: 15, graceMs: 1500 } as const;

export type PlankEvent = { type: 'hold'; seconds: number; ok: boolean; reason?: string } | { type: 'done'; seconds: number };

/** Chronomètre de gainage : le temps ne compte que quand le corps est aligné ; 1,5 s de tolérance avant pause. */
export class PlankTimer {
  held = 0; // ms validées
  private lastTs: number | null = null;
  private badSince: number | null = null;
  private done = false;

  constructor(private targetSec: number) {}

  reset() {
    this.held = 0; this.lastTs = null; this.badSince = null; this.done = false;
  }

  update(p: Pose, ts: number): PlankEvent[] {
    if (this.done) return [];
    const pts = [p.shoulder, p.hip, p.ankle];
    const visible = pts.every((q) => q.c >= THRESH.minConfidence);
    const aligned = visible && alignmentDeviation(p) <= PLANK.alignMaxDeg;
    const dt = this.lastTs == null ? 0 : Math.max(0, Math.min(200, ts - this.lastTs));
    this.lastTs = ts;
    let ok = aligned;
    if (aligned) this.badSince = null;
    else {
      if (this.badSince == null) this.badSince = ts;
      ok = ts - this.badSince < PLANK.graceMs; // tolérance courte
    }
    if (ok) this.held += dt;
    const seconds = Math.floor(this.held / 1000);
    if (seconds >= this.targetSec) {
      this.done = true;
      return [{ type: 'done', seconds }];
    }
    return [{ type: 'hold', seconds, ok, reason: !visible ? 'Je ne vois pas tout ton corps.' : !aligned ? 'Remonte les hanches, corps aligné.' : undefined }];
  }
}
