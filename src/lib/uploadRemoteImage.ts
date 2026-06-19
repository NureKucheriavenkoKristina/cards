import { Platform } from "react-native";

import type { CardMediaForm, CardMediaSide } from "@/src/lib/cardMedia";
import { resolveImageCandidateUrls } from "@/src/lib/resolveMediaPlaybackUrl";
import { CARD_MEDIA_BUCKET } from "@/src/lib/uploadCardAudio";
import { supabase } from "@/src/lib/supabase";

export const REMOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Pixabay API `webformatURL` / `largeImageURL` — expire after ~24h. */
export function isExpiringPixabayUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, "");
    return host === "pixabay.com" && trimmed.includes("/get/");
  } catch {
    return false;
  }
}

export function buildDeckCoverStoragePath(userId: string, deckId?: string | null): string {
  const folder = deckId?.trim() || "pending";
  return `${userId}/covers/${folder}/${Date.now()}.jpg`;
}

export function buildCardImageStoragePath(
  userId: string,
  deckId: string,
  cardId: string | null | undefined,
  side: CardMediaSide,
): string {
  const cardFolder = cardId?.trim() || `pending/${Date.now()}`;
  return `${userId}/${deckId}/images/${cardFolder}/${side}.jpg`;
}

export type PersistRemoteImageResult =
  | { ok: true; publicUrl: string; storagePath: string }
  | { ok: false; error: string };

function guessImageContentType(url: string, headerType: string | null): string {
  const mime = (headerType ?? "").split(";")[0]?.trim().toLowerCase();
  if (mime && mime.startsWith("image/")) return mime;
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

export async function persistRemoteImageToStorage(params: {
  remoteUrl: string;
  storagePath: string;
}): Promise<PersistRemoteImageResult> {
  const remoteUrl = params.remoteUrl.trim();
  if (!remoteUrl) return { ok: false, error: "empty_url" };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, error: "not_authenticated" };
  }

  try {
    const candidates = resolveImageCandidateUrls(remoteUrl);
    let lastError = "fetch_failed";

    for (const candidate of candidates) {
      const res = await fetch(candidate);
      if (!res.ok) {
        lastError = `fetch_failed:${res.status}`;
        continue;
      }

      const data = await res.arrayBuffer();
      if (data.byteLength > REMOTE_IMAGE_MAX_BYTES) {
        return { ok: false, error: "too_large" };
      }

      const contentType = guessImageContentType(candidate, res.headers.get("content-type"));
      const body = Platform.OS === "web" ? new Blob([data], { type: contentType }) : data;

      const { error: uploadError } = await supabase.storage
        .from(CARD_MEDIA_BUCKET)
        .upload(params.storagePath, body, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        return { ok: false, error: uploadError.message };
      }

      const { data: urlData } = supabase.storage
        .from(CARD_MEDIA_BUCKET)
        .getPublicUrl(params.storagePath);
      const publicUrl = urlData.publicUrl?.trim();
      if (!publicUrl) {
        return { ok: false, error: "no_public_url" };
      }

      return { ok: true, publicUrl, storagePath: params.storagePath };
    }

    return { ok: false, error: lastError };
  } catch (e) {
    const message = e instanceof Error ? e.message : "upload_failed";
    return { ok: false, error: message };
  }
}

/** Pixabay links expire (~24h) — persist on card save if still temporary. */
export async function persistRemoteImagesInMediaForm(
  form: CardMediaForm,
  params: { userId: string; deckId: string; cardId?: string | null },
): Promise<{ ok: true; form: CardMediaForm } | { ok: false; error: string }> {
  const next: CardMediaForm = {
    front: { order: [...form.front.order], urls: { ...form.front.urls } },
    back: { order: [...form.back.order], urls: { ...form.back.urls } },
  };

  for (const side of ["front", "back"] as const) {
    const url = next[side].urls.image.trim();
    if (!url || !isExpiringPixabayUrl(url)) continue;

    const stored = await persistRemoteImageToStorage({
      remoteUrl: url,
      storagePath: buildCardImageStoragePath(
        params.userId,
        params.deckId,
        params.cardId,
        side,
      ),
    });
    if (!stored.ok) return { ok: false, error: stored.error };
    next[side].urls.image = stored.publicUrl;
  }

  return { ok: true, form: next };
}

/** @deprecated Use {@link persistRemoteImagesInMediaForm} */
export async function persistExpiringImagesInMediaForm(
  form: CardMediaForm,
  params: { userId: string; deckId: string; cardId?: string | null },
): Promise<{ ok: true; form: CardMediaForm } | { ok: false; error: string }> {
  return persistRemoteImagesInMediaForm(form, params);
}

export async function persistDeckCoverUrlIfNeeded(params: {
  coverUrl: string;
  userId: string;
  deckId?: string | null;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const trimmed = params.coverUrl.trim();
  if (!trimmed) return { ok: true, url: "" };
  if (!isExpiringPixabayUrl(trimmed)) return { ok: true, url: trimmed };

  const stored = await persistRemoteImageToStorage({
    remoteUrl: trimmed,
    storagePath: buildDeckCoverStoragePath(params.userId, params.deckId),
  });
  if (!stored.ok) return { ok: false, error: stored.error };
  return { ok: true, url: stored.publicUrl };
}
