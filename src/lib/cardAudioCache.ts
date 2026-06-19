import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import { resolveMediaPlaybackUrl } from "@/src/lib/resolveMediaPlaybackUrl";

/** Remote card_media URL → local URI (blob: or file://) for instant playback after upload. */
const playbackByRemoteUrl = new Map<string, string>();

function cacheKey(remoteUrl: string): string {
  return remoteUrl.trim();
}

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) {
    h = (h * 31 + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/** Cached local URI, otherwise direct stream URL (Supabase, Drive, etc.). */
export function getCardAudioPlaybackUri(remoteUrl: string): string | null {
  const key = cacheKey(remoteUrl);
  if (!key) return null;
  return getCachedCardAudioPlaybackUri(key) ?? resolveMediaPlaybackUrl(key, "audio");
}

export function getCachedCardAudioPlaybackUri(remoteUrl: string): string | null {
  return playbackByRemoteUrl.get(cacheKey(remoteUrl)) ?? null;
}

/** Native: reuse file copied by the document picker. */
export function registerCardAudioLocalPlayback(remoteUrl: string, localUri: string): void {
  playbackByRemoteUrl.set(cacheKey(remoteUrl), localUri);
}

/** Web blob + native cache file from bytes already read for upload. */
export async function registerCardAudioFromBuffer(
  remoteUrl: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<string> {
  const key = cacheKey(remoteUrl);
  if (Platform.OS === "web") {
    const blobUrl = URL.createObjectURL(new Blob([data], { type: contentType }));
    playbackByRemoteUrl.set(key, blobUrl);
    return blobUrl;
  }

  const ext = contentType.includes("wav")
    ? "wav"
    : contentType.includes("ogg")
      ? "ogg"
      : contentType.includes("mp4") || contentType.includes("m4a")
        ? "m4a"
        : "mp3";
  const file = new File(Paths.cache, `card-audio-${hashUrl(key)}.${ext}`);
  if (!file.exists) {
    file.create({ intermediates: true, idempotent: true });
  }
  const writer = file.writableStream().getWriter();
  await writer.write(new Uint8Array(data));
  await writer.close();
  playbackByRemoteUrl.set(key, file.uri);
  return file.uri;
}
