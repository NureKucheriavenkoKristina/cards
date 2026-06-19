import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

import {
  isSupabaseStorageUrl,
  resolveImageCandidateUrls,
} from "@/src/lib/resolveMediaPlaybackUrl";

function supabaseDownloadHeaders(url: string): Record<string, string> | undefined {
  if (!isSupabaseStorageUrl(url)) return undefined;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) return undefined;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function hashUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i += 1) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function extensionFromUrl(url: string): string {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return "png";
  if (path.endsWith(".webp")) return "webp";
  if (path.endsWith(".gif")) return "gif";
  return "jpg";
}

/** Download remote image to cache — works when RN `Image` fails on redirects (Drive, Pixabay). */
export async function downloadImageToCache(sourceUrl: string): Promise<string | null> {
  if (Platform.OS === "web") return null;

  const candidates = resolveImageCandidateUrls(sourceUrl);
  if (candidates.length === 0) return null;

  for (const remoteUrl of candidates) {
    const trimmed = remoteUrl.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) continue;

    const path = `${FileSystem.cacheDirectory}card-img-${hashUrl(trimmed)}.${extensionFromUrl(trimmed)}`;

    try {
      const existing = await FileSystem.getInfoAsync(path);
      if (existing.exists && "size" in existing && existing.size != null && existing.size > 0) {
        return path;
      }

      const result = await FileSystem.downloadAsync(trimmed, path, {
        headers: supabaseDownloadHeaders(trimmed),
      });
      if (result.status >= 200 && result.status < 300) {
        return result.uri;
      }

      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    }
  }

  return null;
}
