/**
 * Guidage de placement pour les défis caméra : dit à la personne, à la voix et à l'écran, si on la voit, ce qui manque
 * et quand elle est bien placée (avec un bip). Pur, sans React, testé (tests/placement-guide.test.ts).
 *
 * Entrée : les images analysées par le module de pose (≈ 15 par seconde), y compris « personne vu ».
 * Sortie : au plus un message à la fois ; la voix ne répète pas la même consigne avant quelques secondes.
 */
import { THRESH, type Pose, type Pt } from './repCounter';

export type GuideFrame = { found: boolean; ts: number; pose?: Pose };
export type GuideStatus = 'searching' | 'partial' | 'ready';
export type GuideOutput = {
  status: GuideStatus;
  /** Texte à afficher (absent = ne rien changer). */
  text?: string;
  kind?: 'info' | 'bad' | 'good';
  /** Phrase à dire (absent = se taire). */
  say?: string;
  /** Vrai à l'instant où la personne devient bien placée : jouer le bip. */
  beep?: boolean;
};

export const GUIDE = {
  /** Temps sans personne avant de le dire. */
  missMs: 1200,
  /** Corps entier vu en continu pendant ce temps = bien placé. */
  readyMs: 700,
  /** Corps perdu pendant ce temps = plus bien placé. */
  lostMs: 1500,
  /** Même consigne pas répétée avant… */
  repeatMs: 7000,
  /** Deux consignes différentes espacées d'au moins… */
  gapMs: 2500,
  /** Marge au bord de l'image : un point plus près du bord = la personne est coupée. */
  edge: 0.03,
} as const;

export const PHRASES = {
  nobody: 'Je ne te vois pas. Pose le téléphone debout au sol, écran vers toi, à deux mètres, et mets-toi de profil.',
  legs: 'Je ne vois pas tes jambes. Éloigne un peu le téléphone.',
  arms: 'Je ne vois pas ton bras. Tourne-toi bien de profil, côté téléphone.',
  torso: 'Je ne vois pas ton buste. Mets-toi bien face à l’écran, de profil.',
  edge: 'Tu sors de l’image. Recule un peu le téléphone.',
  ready: 'C’est bon, je te vois en entier. Bras tendus, et descends quand tu veux.',
  lost: 'Je ne te vois plus en entier.',
} as const;

type Missing = keyof Pick<typeof PHRASES, 'legs' | 'arms' | 'torso' | 'edge'>;

const ok = (q: Pt) => q.c >= THRESH.minConfidence;

/** Ce qui empêche de compter, ou null si tout le corps utile est visible. */
export function whatIsMissing(p: Pose): Missing | null {
  if (!ok(p.shoulder) || !ok(p.hip)) return 'torso';
  if (!ok(p.elbow) || !ok(p.wrist)) return 'arms';
  if (!ok(p.ankle) && !ok(p.knee)) return 'legs';
  const seen = [p.shoulder, p.elbow, p.wrist, p.hip, p.knee, p.ankle].filter(ok);
  if (seen.some((q) => q.x < GUIDE.edge || q.x > 1 - GUIDE.edge || q.y < GUIDE.edge || q.y > 1 - GUIDE.edge)) return 'edge';
  return null;
}

export class PlacementGuide {
  status: GuideStatus = 'searching';
  private startTs: number | null = null;
  private lastSeenFull: number | null = null;
  private fullSince: number | null = null;
  private lastFound: number | null = null;
  private lastSaid: { text: string; ts: number } | null = null;
  private lastText: string | null = null;

  reset() {
    this.status = 'searching';
    this.startTs = null;
    this.lastSeenFull = null;
    this.fullSince = null;
    this.lastFound = null;
    this.lastSaid = null;
    this.lastText = null;
  }

  get ready() {
    return this.status === 'ready';
  }

  private speakable(text: string, ts: number): string | undefined {
    const l = this.lastSaid;
    if (l && l.text === text && ts - l.ts < GUIDE.repeatMs) return undefined;
    if (l && l.text !== text && ts - l.ts < GUIDE.gapMs) return undefined;
    this.lastSaid = { text, ts };
    return text;
  }

  private show(out: GuideOutput, text: string, kind: 'info' | 'bad' | 'good', ts: number): GuideOutput {
    if (text !== this.lastText) {
      this.lastText = text;
      out.text = text;
      out.kind = kind;
    }
    const say = this.speakable(text, ts);
    if (say) out.say = say;
    return out;
  }

  update(f: GuideFrame): GuideOutput {
    const ts = f.ts;
    if (this.startTs == null) this.startTs = ts;
    const missing = f.found && f.pose ? whatIsMissing(f.pose) : null;
    const full = f.found && !!f.pose && missing == null;
    if (f.found) this.lastFound = ts;

    if (full) {
      this.lastSeenFull = ts;
      if (this.fullSince == null) this.fullSince = ts;
    } else {
      this.fullSince = null;
    }

    const out: GuideOutput = { status: this.status };

    if (this.status === 'ready') {
      if (full) return out;
      if (this.lastSeenFull != null && ts - this.lastSeenFull < GUIDE.lostMs) return out; // courte perte tolérée
      this.status = out.status = f.found ? 'partial' : 'searching';
      this.lastSaid = null; // toujours annoncé : la personne doit savoir qu'on ne compte plus
      return this.show(out, PHRASES.lost, 'bad', ts);
    }

    if (full) {
      if (ts - (this.fullSince ?? ts) >= GUIDE.readyMs) {
        this.status = out.status = 'ready';
        out.beep = true;
        // la phrase « c'est bon » passe toujours, même juste après une autre consigne
        this.lastSaid = null;
        return this.show(out, PHRASES.ready, 'good', ts);
      }
      return out;
    }

    if (f.found && missing) {
      this.status = out.status = 'partial';
      return this.show(out, PHRASES[missing], 'bad', ts);
    }

    // personne : on attend un peu avant de le dire (la caméra démarre, la personne se met en place)
    this.status = out.status = 'searching';
    const since = this.lastFound ?? this.startTs;
    if (ts - since >= GUIDE.missMs) return this.show(out, PHRASES.nobody, 'bad', ts);
    return out;
  }
}
