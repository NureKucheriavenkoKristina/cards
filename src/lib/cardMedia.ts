import type { Card, CardMedia, CardMediaSide, CardMediaType } from "@/assets/data/cards";
import {
  canPlayMediaUrl,
  extractVideoEmbedUrl,
  isSupabaseStorageUrl,
} from "@/src/lib/resolveMediaPlaybackUrl";
import { supabase } from "@/src/lib/supabase";

export type { CardMedia, CardMediaSide, CardMediaType };

export const CARD_MEDIA_TYPES: CardMediaType[] = ["image", "audio", "video"];

const DEFAULT_MEDIA_ORDER: CardMediaType[] = ["image", "audio", "video"];

export type CardMediaSideForm = {
  /** Display order on this side (study, list, PDF). */
  order: CardMediaType[];
  urls: Record<CardMediaType, string>;
};

export type CardMediaForm = Record<CardMediaSide, CardMediaSideForm>;

export function emptyCardMediaForm(): CardMediaForm {
  const emptyUrls: Record<CardMediaType, string> = { image: "", audio: "", video: "" };
  const side = (): CardMediaSideForm => ({
    order: [...DEFAULT_MEDIA_ORDER],
    urls: { ...emptyUrls },
  });
  return { front: side(), back: side() };
}

export function normalizeCardMediaRows(rows: unknown): CardMedia[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is CardMedia => {
      if (!row || typeof row !== "object") return false;
      const r = row as Partial<CardMedia>;
      return (
        typeof r.media_id === "string" &&
        typeof r.card_id === "string" &&
        (r.side === "front" || r.side === "back") &&
        (r.media_type === "image" || r.media_type === "audio" || r.media_type === "video") &&
        typeof r.url === "string" &&
        typeof r.position === "number"
      );
    })
    .sort((a, b) => a.position - b.position);
}

export function getCardMediaForSide(
  card: Pick<Card, "card_media">,
  side: CardMediaSide,
): CardMedia[] {
  return normalizeCardMediaRows(card.card_media).filter((item) => item.side === side);
}

function sideFormFromRows(rows: CardMedia[], side: CardMediaSide): CardMediaSideForm {
  const items = rows.filter((r) => r.side === side).sort((a, b) => a.position - b.position);
  const urls: Record<CardMediaType, string> = { image: "", audio: "", video: "" };
  const orderFromDb = items.map((i) => i.media_type);
  for (const item of items) {
    urls[item.media_type] = item.url;
  }
  const order = [...orderFromDb];
  for (const type of CARD_MEDIA_TYPES) {
    if (!order.includes(type)) order.push(type);
  }
  return { order, urls };
}

export function cardMediaRowsToForm(rows: unknown): CardMediaForm {
  const list = normalizeCardMediaRows(rows);
  return {
    front: sideFormFromRows(list, "front"),
    back: sideFormFromRows(list, "back"),
  };
}

function sideFormsEqual(a: CardMediaSideForm, b: CardMediaSideForm): boolean {
  if (a.order.join() !== b.order.join()) return false;
  return CARD_MEDIA_TYPES.every((type) => a.urls[type] === b.urls[type]);
}

export function hasMediaFormChanges(a: CardMediaForm, b: CardMediaForm): boolean {
  return !sideFormsEqual(a.front, b.front) || !sideFormsEqual(a.back, b.back);
}

export function hasMediaFormContent(form: CardMediaForm): boolean {
  return hasMediaFormSideContent(form, "front") || hasMediaFormSideContent(form, "back");
}

export function hasMediaFormSideContent(
  form: CardMediaForm,
  side: CardMediaSide,
): boolean {
  return CARD_MEDIA_TYPES.some((type) => form[side].urls[type].trim().length > 0);
}

/** Non-empty URLs that pass {@link getMediaUrlValidationIssue}. */
export function hasValidMediaFormSideContent(
  form: CardMediaForm,
  side: CardMediaSide,
): boolean {
  return CARD_MEDIA_TYPES.some((type) => {
    const url = form[side].urls[type].trim();
    if (!url) return false;
    return getMediaUrlValidationIssue(url, type) === null;
  });
}

export type MediaUrlIssueReason = "invalid_format" | "unsupported" | "wrong_field";

export type MediaUrlIssue = {
  side: CardMediaSide;
  mediaType: CardMediaType;
  url: string;
  reason: MediaUrlIssueReason;
  /** When reason is `wrong_field` — which field the URL likely belongs in. */
  suggestedKind?: CardMediaType;
};

export function isValidHttpMediaUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Best-effort guess from URL shape (YouTube → video, .mp3 → audio, etc.). `null` if unclear. */
export function detectMediaUrlKind(url: string): CardMediaType | null {
  const trimmed = url.trim();
  if (!trimmed || !isValidHttpMediaUrl(trimmed)) return null;

  if (extractVideoEmbedUrl(trimmed)) return "video";
  if (/youtube\.com|youtu\.be|vimeo\.com/i.test(trimmed)) return "video";

  const lower = trimmed.toLowerCase();
  const path = lower.split("?")[0] ?? "";

  if (/\.(mp3|m4a|wav|ogg|aac|flac|opus)(\?|$)/i.test(path)) return "audio";
  if (/\.(mp4|mov|m4v|avi|mkv)(\?|$)/i.test(path)) return "video";
  if (/[?&](format|type|ext)=([^&#]*\.)?(mp4|webm|mov|m4v|mkv)/i.test(lower)) return "video";
  if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(path)) return "image";

  if (isSupabaseStorageUrl(trimmed)) {
    if (/\/images\//i.test(trimmed) || /\/covers\//i.test(trimmed)) return "image";
    if (/-audio\./i.test(trimmed)) return "audio";
  }

  return null;
}

export function getMediaUrlKindMismatch(
  url: string,
  expected: CardMediaType,
): CardMediaType | null {
  const detected = detectMediaUrlKind(url);
  if (!detected || detected === expected) return null;
  return detected;
}

function analyzeMediaUrl(url: string, mediaType: CardMediaType): Omit<MediaUrlIssue, "side"> | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!isValidHttpMediaUrl(trimmed)) {
    return { mediaType, url: trimmed, reason: "invalid_format" };
  }

  const suggestedKind = getMediaUrlKindMismatch(trimmed, mediaType);
  if (suggestedKind) {
    return { mediaType, url: trimmed, reason: "wrong_field", suggestedKind };
  }

  if (mediaType === "image") return null;
  if (mediaType === "video" && extractVideoEmbedUrl(trimmed)) return null;
  if (!canPlayMediaUrl(trimmed, mediaType)) {
    return { mediaType, url: trimmed, reason: "unsupported" };
  }
  return null;
}

export function getMediaUrlValidationIssue(
  url: string,
  mediaType: CardMediaType,
): MediaUrlIssueReason | null {
  return analyzeMediaUrl(url, mediaType)?.reason ?? null;
}

export function getMediaUrlIssueForField(
  url: string,
  mediaType: CardMediaType,
  side: CardMediaSide,
): MediaUrlIssue | null {
  const analyzed = analyzeMediaUrl(url, mediaType);
  if (!analyzed) return null;
  return { side, ...analyzed };
}

export function getCardMediaUrlIssues(form: CardMediaForm): MediaUrlIssue[] {
  const issues: MediaUrlIssue[] = [];
  for (const side of ["front", "back"] as const) {
    for (const mediaType of CARD_MEDIA_TYPES) {
      const url = form[side].urls[mediaType].trim();
      const analyzed = analyzeMediaUrl(url, mediaType);
      if (analyzed) issues.push({ side, ...analyzed });
    }
  }
  return issues;
}

export function isCardMediaFormUrlsValid(form: CardMediaForm): boolean {
  return getCardMediaUrlIssues(form).length === 0;
}

export function mediaUrlWrongFieldMessageKey(
  currentField: CardMediaType,
  suggestedKind: CardMediaType,
): string {
  return `mediaUrlWrong_${currentField}_to_${suggestedKind}`;
}

export function mediaUrlInvalidFormatMessageKey(field: CardMediaType): string {
  if (field === "image") return "mediaUrlImageInvalidFormat";
  if (field === "audio") return "mediaUrlAudioInvalidFormat";
  return "mediaUrlVideoInvalidFormat";
}

export function mediaUrlUnsupportedMessageKey(field: CardMediaType): string {
  if (field === "image") return "mediaUrlImageUnsupported";
  if (field === "audio") return "mediaUrlAudioUnsupported";
  return "mediaUrlVideoUnsupported";
}

export function mediaUrlIssueMessageKey(issue: MediaUrlIssue): string {
  if (issue.reason === "wrong_field" && issue.suggestedKind) {
    return mediaUrlWrongFieldMessageKey(issue.mediaType, issue.suggestedKind);
  }
  if (issue.reason === "invalid_format") {
    return mediaUrlInvalidFormatMessageKey(issue.mediaType);
  }
  return mediaUrlUnsupportedMessageKey(issue.mediaType);
}

export function mediaLoadErrorMessageKey(url: string, kind: CardMediaType): string {
  const mismatch = getMediaUrlKindMismatch(url, kind);
  if (mismatch) return mediaUrlWrongFieldMessageKey(kind, mismatch);
  if (kind === "image") return "cardImageLoadError";
  if (kind === "audio") return "cardAudioLoadError";
  return "cardVideoLoadError";
}

export function mediaFormToInsertRows(
  cardId: string,
  form: CardMediaForm,
): Array<Pick<CardMedia, "card_id" | "side" | "media_type" | "url" | "position">> {
  return (["front", "back"] as CardMediaSide[]).flatMap((side) => {
    const { order, urls } = form[side];
    let position = 1;
    return order.flatMap((mediaType) => {
      const url = urls[mediaType].trim();
      if (!url) return [];
      const row = {
        card_id: cardId,
        side,
        media_type: mediaType,
        url,
        position,
      };
      position += 1;
      return [row];
    });
  });
}

export function swapCardMediaFormSides(form: CardMediaForm): CardMediaForm {
  return {
    front: { order: [...form.back.order], urls: { ...form.back.urls } },
    back: { order: [...form.front.order], urls: { ...form.front.urls } },
  };
}

export function moveMediaInForm(
  form: CardMediaForm,
  side: CardMediaSide,
  mediaType: CardMediaType,
  direction: -1 | 1,
): CardMediaForm {
  const order = [...form[side].order];
  const idx = order.indexOf(mediaType);
  const swapIdx = idx + direction;
  if (idx < 0 || swapIdx < 0 || swapIdx >= order.length) return form;
  [order[idx], order[swapIdx]] = [order[swapIdx], order[idx]];
  return {
    ...form,
    [side]: { ...form[side], order },
  };
}

/** Preview / study: filled media in display order. */
export function orderedMediaFromForm(
  form: CardMediaForm,
  side: CardMediaSide,
): { kind: CardMediaType; url: string }[] {
  return form[side].order
    .map((kind) => ({ kind, url: form[side].urls[kind].trim() }))
    .filter((item) => item.url.length > 0);
}

export async function replaceCardMedia(cardId: string, form: CardMediaForm): Promise<void> {
  const { error: deleteError } = await supabase.from("card_media").delete().eq("card_id", cardId);
  if (deleteError) throw deleteError;

  const rows = mediaFormToInsertRows(cardId, form);
  if (!rows.length) return;

  const { error: insertError } = await supabase.from("card_media").insert(rows);
  if (insertError) throw insertError;
}
