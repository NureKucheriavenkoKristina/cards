import type { Card } from "@/assets/data/cards";

/** Stored in `cards.card_extra` (jsonb). */
export type MediaKind = "image" | "audio" | "video";

/**
 * One gap: before / explanation in gap (front) / answer (back) / after.
 * `front_text` still stores `before[[hidden]]after` for search; gap text lives in `card_extra`.
 */
export type ClozeParts = {
  before: string;
  /** Shown inside the gap on the front side (hint / explanation). */
  gapFront: string;
  hidden: string;
  after: string;
};

export type CardExtra = {
  mediaFront?: MediaKind;
  mediaBack?: MediaKind;
  /** Shared id between the forward and reverse cards in a reversible pair. */
  pairId?: string;
  pairRole?: "forward" | "reverse";
  /** Structured cloze fields (preferred over raw [[ ]] in front_text). */
  cloze?: ClozeParts;
};

export type CardTypeName = "basic" | "cloze";

const CLOZE_GAP = /\[\[([^\]]*)\]\]/g;

/** Trims outer space for the editor input. */
export function clozeHiddenForEdit(hidden: string): string {
  return hidden.trim();
}

/** Visible empty-gap marker when no hint is set (ASCII-safe, all platforms). */
export const CLOZE_GAP_MARKER = "[…]";

/** Default cloze answer spacing: one space before and after the word(s). */
export function normalizeClozeHidden(hidden: string): string {
  const t = hidden.trim();
  if (!t) return "";
  return ` ${t} `;
}

/** Serializes to legacy single-gap `front_text` for search and old clients. */
export function buildClozeFrontText(parts: ClozeParts): string {
  const hidden = normalizeClozeHidden(parts.hidden);
  return `${parts.before}[[${hidden.trim()}]]${parts.after}`;
}

/** First `[[...]]` in text → structured parts (legacy cards). */
export function parseLegacyBracketCloze(frontText: string): ClozeParts | null {
  const re = /\[\[([^\]]*)\]\]/;
  const m = re.exec(frontText);
  if (!m) return null;
  return {
    before: frontText.slice(0, m.index),
    gapFront: "",
    hidden: m[1] ?? "",
    after: frontText.slice(m.index + m[0].length),
  };
}

export function getClozePartsFromCard(card: Card): ClozeParts | null {
  const extra = parseCardExtra(card.card_extra);
  if (extra.cloze?.hidden?.trim()) {
    const c = extra.cloze;
    const gf =
      typeof c.gapFront === "string" && c.gapFront.trim()
        ? c.gapFront.trim()
        : (card.back_text?.trim() ?? "");
    return {
      before: c.before,
      gapFront: gf,
      hidden: normalizeClozeHidden(c.hidden),
      after: c.after,
    };
  }
  if (normalizeCardType(card.card_type) !== "cloze") return null;
  const leg = parseLegacyBracketCloze(card.front_text);
  if (!leg) return null;
  return {
    ...leg,
    gapFront: card.back_text?.trim() ?? "",
  };
}

export function newPairId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export function parseCardExtra(raw: unknown): CardExtra {
  if (raw == null || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const extra: CardExtra = {};
  if (o.mediaFront === "image" || o.mediaFront === "audio" || o.mediaFront === "video") extra.mediaFront = o.mediaFront;
  if (o.mediaBack === "image" || o.mediaBack === "audio" || o.mediaBack === "video") extra.mediaBack = o.mediaBack;
  if (typeof o.pairId === "string" && o.pairId.trim()) extra.pairId = o.pairId.trim();
  if (o.pairRole === "forward" || o.pairRole === "reverse") extra.pairRole = o.pairRole;
  if (o.cloze && typeof o.cloze === "object") {
    const c = o.cloze as Record<string, unknown>;
    extra.cloze = {
      before: typeof c.before === "string" ? c.before : "",
      gapFront: typeof c.gapFront === "string" ? c.gapFront : "",
      hidden: typeof c.hidden === "string" ? c.hidden : "",
      after: typeof c.after === "string" ? c.after : "",
    };
  }
  return extra;
}

export function isReversiblePairCard(extra: CardExtra): boolean {
  return Boolean(extra.pairId?.trim());
}

/** Legacy DB values and old "double" layout map to basic for display. */
export function normalizeCardType(raw: string | null | undefined): CardTypeName {
  if (raw === "cloze") return "cloze";
  return "basic";
}

/** Guess media type from URL when not set in card_extra. */
export function inferMediaKind(url: string | null | undefined): MediaKind {
  if (!url?.trim()) return "image";
  const u = url.trim().toLowerCase().split("?")[0];
  if (/\.(mp3|m4a|wav|ogg|aac|flac|opus|webm)$/.test(u)) return "audio";
  if (/\.(mp4|mov|m4v|avi|mkv|webm)$/.test(u)) return "video";
  return "image";
}

export function effectiveMediaKind(
  url: string | null | undefined,
  explicit: MediaKind | undefined,
  side: "front" | "back",
  extra: CardExtra,
): MediaKind {
  if (!url?.trim()) return "image";
  const fromExtra = side === "front" ? extra.mediaFront : extra.mediaBack;
  return fromExtra ?? inferMediaKind(url);
}

export function hasClozeGaps(text: string): boolean {
  CLOZE_GAP.lastIndex = 0;
  return CLOZE_GAP.test(text);
}

export function isClozeLearnable(parts: ClozeParts | null | undefined): boolean {
  return Boolean(parts?.hidden?.trim());
}

/** Front gap should show hint text; answer is separate. */
export function isClozeGapComplete(parts: ClozeParts | null | undefined): boolean {
  return Boolean(parts?.hidden?.trim() && parts?.gapFront?.trim());
}

/** Strip [[ ]] for plain display (study back). */
export function clozeRevealText(raw: string): string {
  return raw.replace(CLOZE_GAP, "$1");
}
