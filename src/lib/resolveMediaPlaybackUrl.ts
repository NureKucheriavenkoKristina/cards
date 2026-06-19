import Constants from "expo-constants";

import type { MediaKind } from "@/src/lib/cardModel";

/** YouTube requires a valid https origin / Referer in WebViews (Error 153 without it). */
export function getAppEmbedOrigin(): string {
  const pkg =
    Constants.expoConfig?.android?.package ??
    Constants.expoConfig?.ios?.bundleIdentifier ??
    "com.cardly.app";
  return `https://${pkg}`;
}

/** Hosts that only work via embed player, not as direct file URLs in expo-av. */
const EMBED_ONLY_HOSTS = ["youtube.com", "youtu.be", "m.youtube.com", "vimeo.com", "player.vimeo.com"];

export function extractGoogleDriveFileId(url: string): string | null {
  const u = url.trim();
  const filePath = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(u);
  if (filePath) return filePath[1];
  const queryId = /[?&]id=([a-zA-Z0-9_-]+)/.exec(u);
  if (queryId && u.includes("drive.google")) return queryId[1];
  return null;
}

export function googleDriveAudioStreamUrls(fileId: string): string[] {
  return [
    `https://docs.google.com/uc?export=download&id=${fileId}`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
  ];
}

export function googleDrivePreviewEmbedUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/** Direct image view URL for React Native `Image` (share links often fail). */
export function googleDriveImageViewUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

export function googleDriveImageThumbnailUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
}

export function googleDriveImageLh3Url(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}=w2000`;
}

export function googleDriveImageCandidateUrls(fileId: string): string[] {
  return [
    googleDriveImageViewUrl(fileId),
    googleDriveImageThumbnailUrl(fileId),
    googleDriveImageLh3Url(fileId),
  ];
}

const YOUTUBE_ID = /[a-zA-Z0-9_-]{11}/;

export function extractYouTubeVideoId(url: string): string | null {
  const u = url.trim();
  const short = /youtu\.be\/([a-zA-Z0-9_-]{11})/.exec(u);
  if (short) return short[1];
  const embed = /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/.exec(u);
  if (embed) return embed[1];
  const shorts = /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/.exec(u);
  if (shorts) return shorts[1];
  const watch = /[?&]v=([a-zA-Z0-9_-]{11})/.exec(u);
  if (watch && /youtube/i.test(u)) return watch[1];
  const pathWatch = /youtube\.com\/watch\/([a-zA-Z0-9_-]{11})/.exec(u);
  if (pathWatch) return pathWatch[1];
  return null;
}

export function youtubeEmbedUrl(videoId: string): string {
  if (!YOUTUBE_ID.test(videoId)) return "";
  const origin = getAppEmbedOrigin();
  const params = new URLSearchParams({
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    origin,
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export function extractVimeoVideoId(url: string): string | null {
  const m = /vimeo\.com\/(?:channels\/[^/]+\/|groups\/[^/]+\/videos\/|video\/)?(\d+)/.exec(
    url.trim(),
  );
  return m ? m[1] : null;
}

export function vimeoEmbedUrl(videoId: string): string {
  if (!/^\d+$/.test(videoId)) return "";
  const params = new URLSearchParams({ title: "0", byline: "0", portrait: "0" });
  return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
}

export function extractVideoEmbedUrl(url: string): string | null {
  const yt = extractYouTubeVideoId(url);
  if (yt) return youtubeEmbedUrl(yt) || null;
  const vimeo = extractVimeoVideoId(url);
  if (vimeo) return vimeoEmbedUrl(vimeo) || null;
  return null;
}

function isSupabaseStorageUrl(url: string): boolean {
  return /supabase\.co\/storage\/v1\/object\/(public|sign)\//i.test(url);
}

export { isSupabaseStorageUrl };

function hasDirectExtension(url: string, kind: MediaKind): boolean {
  const lower = url.toLowerCase();
  const path = lower.split("?")[0];
  if (kind === "audio") {
    return /\.(mp3|m4a|wav|ogg|aac|flac|opus|webm)(\?|$)/i.test(path);
  }
  if (kind === "video") {
    if (/\.(mp4|mov|m4v|webm|mkv)(\?|$)/i.test(path)) return true;
    return /[?&](format|type|ext)=([^&#]*\.)?(mp4|webm|mov|m4v|mkv)/i.test(lower);
  }
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(path);
}

function isEmbedOnlyHost(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.replace(/^www\./, "");
    return EMBED_ONLY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function canPlayMediaUrl(url: string, kind: MediaKind): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;

  if (kind === "video" && extractVideoEmbedUrl(trimmed)) return true;

  if (isEmbedOnlyHost(trimmed)) return false;

  try {
    new URL(trimmed);
  } catch {
    return false;
  }

  if (isSupabaseStorageUrl(trimmed)) return true;
  if (extractGoogleDriveFileId(trimmed)) return true;
  if (trimmed.toLowerCase().includes("dropbox.com")) return true;
  return hasDirectExtension(trimmed, kind);
}

/** Apex ↔ www — CDN hotlink rules often differ (e.g. BunnyCDN 403 on www only). */
export function hostnameWwwVariants(url: string): string[] {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return [];
    if (host.split(".").length < 2) return [];
    if (host.endsWith(".supabase.co") || host.endsWith(".supabase.in")) return [];
    if (isSupabaseStorageUrl(url)) return [];

    const variant = new URL(parsed.toString());
    if (host.startsWith("www.")) {
      variant.hostname = host.slice(4);
    } else {
      variant.hostname = `www.${host}`;
    }
    return variant.hostname === host ? [] : [variant.toString()];
  } catch {
    return [];
  }
}

export function resolveMediaPlaybackUrl(url: string, kind: MediaKind): string {
  const trimmed = url.trim();
  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    if (kind === "audio") return googleDriveAudioStreamUrls(driveId)[0];
    if (kind === "image") return googleDriveImageViewUrl(driveId);
  }

  if (trimmed.includes("dropbox.com")) {
    let next = trimmed.replace("www.dropbox.com", "dl.dropboxusercontent.com");
    if (next.includes("?dl=0")) next = next.replace("?dl=0", "?dl=1");
    else if (!next.includes("dl=")) {
      next += next.includes("?") ? "&dl=1" : "?dl=1";
    }
    return next;
  }

  return trimmed;
}

/** Ordered URLs to try when loading a card image (redirects / Drive / Dropbox). */
export function resolveImageCandidateUrls(url: string): string[] {
  const trimmed = url.trim();
  if (!trimmed) return [];

  const seen = new Set<string>();
  const out: string[] = [];
  const add = (candidate: string) => {
    const u = candidate.trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  add(trimmed);

  if (isSupabaseStorageUrl(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const path = parsed.pathname;
      if (path.includes("/object/sign/")) {
        parsed.pathname = path.replace("/object/sign/", "/object/public/");
        parsed.search = "";
        add(parsed.toString());
      }
    } catch {
      /* keep original URL only */
    }
    return out;
  }

  for (const variant of hostnameWwwVariants(trimmed)) {
    add(variant);
  }

  const driveId = extractGoogleDriveFileId(trimmed);
  if (driveId) {
    for (const u of googleDriveImageCandidateUrls(driveId)) add(u);
  }

  if (trimmed.toLowerCase().includes("dropbox.com")) {
    add(resolveMediaPlaybackUrl(trimmed, "image"));
  }

  return out;
}

/** HTML wrapper so native WebView sends Referer (fixes YouTube Error 153). */
export function buildEmbedPlayerHtml(embedSrc: string): string {
  const safeSrc = embedSrc.replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>*{margin:0;padding:0}html,body{width:100%;height:100%;background:#000;overflow:hidden}
iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe src="${safeSrc}" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body></html>`;
}
