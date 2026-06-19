import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";

import {
  registerCardAudioFromBuffer,
  registerCardAudioLocalPlayback,
} from "@/src/lib/cardAudioCache";
import { readUriAsArrayBuffer } from "@/src/lib/readImportFile";
import { supabase } from "@/src/lib/supabase";

export const CARD_MEDIA_BUCKET = "card-media";
export const CARD_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

const AUDIO_PICKER_TYPES: string[] =
  Platform.OS === "ios"
    ? ["public.audio", "public.mp3", "public.mpeg-4-audio", "com.apple.m4a-audio"]
    : ["audio/*", "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"];

function extensionFromAsset(name: string, mimeType?: string | null): string {
  const fromName = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  if (fromName && ["mp3", "m4a", "wav", "ogg", "webm", "aac", "opus", "flac"].includes(fromName)) {
    return fromName;
  }
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("m4a") || mime.includes("mp4")) return "m4a";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  return "mp3";
}

function normalizeAudioContentType(mimeType: string | null | undefined, fileName: string): string {
  const mime = (mimeType ?? "").trim().toLowerCase();
  if (mime && mime !== "application/octet-stream" && mime.startsWith("audio/")) {
    return mime;
  }
  const byExt: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    webm: "audio/webm",
    aac: "audio/aac",
    flac: "audio/flac",
    opus: "audio/opus",
  };
  return byExt[extensionFromAsset(fileName, mimeType)] ?? "audio/mpeg";
}

function buildStoragePath(params: {
  userId: string;
  deckId: string;
  cardId?: string | null;
  side: "front" | "back";
  ext: string;
}): string {
  const { userId, deckId, cardId, side, ext } = params;
  const stamp = Date.now();
  if (cardId) {
    return `${userId}/${deckId}/${cardId}/${side}-audio.${ext}`;
  }
  return `${userId}/${deckId}/pending/${stamp}-${side}-audio.${ext}`;
}

export async function pickCardAudioFile(): Promise<DocumentPicker.DocumentPickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: AUDIO_PICKER_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0];
}

export type UploadAudioPhase = "reading" | "uploading" | "caching" | "done";

export type UploadCardAudioParams = {
  localUri: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  userId: string;
  deckId: string;
  cardId?: string | null;
  side: "front" | "back";
  /** Picker cache path — used for instant playback after upload (native). */
  pickerCacheUri?: string;
  onPhase?: (phase: UploadAudioPhase) => void;
};

export type UploadCardAudioResult =
  | { ok: true; publicUrl: string; storagePath: string }
  | { ok: false; error: string };

/** Maps Supabase / read errors to translation keys or a short detail string. */
export function uploadAudioErrorKey(error: string): string {
  if (error === "too_large" || error === "not_authenticated") return error;
  const lower = error.toLowerCase();
  if (lower.includes("bucket not found") || (lower.includes("not found") && lower.includes("bucket"))) {
    return "bucket_missing";
  }
  if (lower.includes("row-level security") || lower.includes("policy")) return "permission";
  if (lower.includes("mime") || lower.includes("content-type") || lower.includes("content type")) {
    return "mime";
  }
  if (error.startsWith("read_failed")) return "read_failed";
  return "unknown";
}

export async function uploadCardAudioToStorage(
  params: UploadCardAudioParams,
): Promise<UploadCardAudioResult> {
  const {
    localUri,
    fileName,
    mimeType,
    fileSize,
    userId,
    deckId,
    cardId,
    side,
    pickerCacheUri,
    onPhase,
  } = params;

  if (fileSize != null && fileSize > CARD_AUDIO_MAX_BYTES) {
    return { ok: false, error: "too_large" };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, error: "not_authenticated" };
  }

  try {
    onPhase?.("reading");
    const ext = extensionFromAsset(fileName, mimeType);
    const storagePath = buildStoragePath({ userId, deckId, cardId, side, ext });
    const { data: urlData } = supabase.storage.from(CARD_MEDIA_BUCKET).getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl?.trim();
    if (!publicUrl) {
      return { ok: false, error: "no_public_url" };
    }

    const data = await readUriAsArrayBuffer(localUri);

    if (data.byteLength > CARD_AUDIO_MAX_BYTES) {
      return { ok: false, error: "too_large" };
    }

    const uploadType = normalizeAudioContentType(mimeType, fileName);

    onPhase?.("caching");
    if (Platform.OS === "web") {
      await registerCardAudioFromBuffer(publicUrl, data, uploadType);
    } else if (pickerCacheUri) {
      registerCardAudioLocalPlayback(publicUrl, pickerCacheUri);
    } else {
      await registerCardAudioFromBuffer(publicUrl, data, uploadType);
    }

    const body =
      Platform.OS === "web" ? new Blob([data], { type: uploadType }) : data;

    onPhase?.("uploading");
    const { error: uploadError } = await supabase.storage
      .from(CARD_MEDIA_BUCKET)
      .upload(storagePath, body, {
        contentType: uploadType,
        upsert: true,
      });

    if (uploadError) {
      return { ok: false, error: uploadError.message };
    }

    onPhase?.("done");

    return { ok: true, publicUrl, storagePath };
  } catch (e) {
    const message = e instanceof Error ? e.message : "upload_failed";
    if (message.includes("fetch") || message.includes("Network")) {
      return { ok: false, error: `read_failed: ${message}` };
    }
    return { ok: false, error: message };
  }
}
