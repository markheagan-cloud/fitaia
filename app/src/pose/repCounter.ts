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
  | { type: 'rejected'; reason: string }
  | { type: 'tracking'; ok: boolean; reason?: string };

export const THRESH = {
  minConfidence: 0.35,
  elbowDown: 90, // angle coude ≤ 90° = position basse validée
  elbowUp: 160, // angle coude ≥ 160° = bras tendus
  alignMaxDeg: 18, // écart max hanche / ligne épaule-cheville
  smooth: 0.5, // lissage exponentiel des angles
} as const;

export function angle(a: Pt, b: Pt, c: Pt): number {
  const abx = a.x - b.x, aby = a.y - b.y, cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const m = Math.hypot(abx, aby) * Math.hypot(cbx, cby) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

/** Écart (°) entre la hanche et la ligne épaule→cheville : 0 = parfaitement gainé. */
export function alignmentDeviation(p: Pose): number {
  return Math.abs(180 - angle(p.shoulder, p.hip, p.ankle));
}

export class PushupCounter {
  count = 0;
  private phase: 'up' | 'down' = 'up';
  private reachedBottom = false;
  private minElbow = 180;
  private elbowS = 180;
  private badFrames = 0;

  reset() {
    this.count = 0; this.phase = 'up'; this.reachedBottom = false; this.minElbow = 180; this.elbowS = 180; this.badFrames = 0;
  }

  /** À appeler à chaque image (10–30 Hz). */
  update(p: Pose): RepEvent[] {
    const ev: RepEvent[] = [];
    const pts = [p.shoulder, p.elbow, p.wrist, p.hip, p.ankle];
    if (pts.some((q) => q.c < THRESH.minConfidence)) {
      this.badFrames++;
      if (this.badFrames === 5) ev.push({ type: 'tracking', ok: false, reason: 'Je ne vois pas tout ton corps : recule un peu, de profil.' });
      return ev;
    }
    if (this.badFrames >= 5) ev.push({ type: 'tracking', ok: true });
    this.badFrames = 0;

    const raw = angle(p.shoulder, p.elbow, p.wrist);
    this.elbowS = this.elbowS * THRESH.smooth + raw * (1 - THRESH.smooth);
    const e = this.elbowS;
    const aligned = alignmentDeviation(p) <= THRESH.alignMaxDeg;

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
        if (!this.reachedBottom) ev.push({ type: 'rejected', reason: 'Pas comptée : descends jusqu’à 90° aux coudes (' + Math.round(this.minElbow) + '° atteint).' });
        else if (!aligned) ev.push({ type: 'rejected', reason: 'Pas comptée : garde le corps gainé et aligné.' });
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
