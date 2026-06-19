import Feather from "@expo/vector-icons/Feather";
import { Audio, ResizeMode, Video } from "expo-av";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { WebView } from "react-native-webview";

import { useLanguage } from "@/src/contexts/LanguageContext";
import { useAppColors } from "@/src/contexts/ThemeContext";
import type { MediaKind } from "@/src/lib/cardModel";
import { mediaLoadErrorMessageKey } from "@/src/lib/cardMedia";
import { getCardAudioPlaybackUri } from "@/src/lib/cardAudioCache";
import { downloadImageToCache } from "@/src/lib/cardImageCache";
import {
  buildEmbedPlayerHtml,
  canPlayMediaUrl,
  extractGoogleDriveFileId,
  extractVideoEmbedUrl,
  getAppEmbedOrigin,
  googleDrivePreviewEmbedUrl,
  resolveImageCandidateUrls,
  resolveMediaPlaybackUrl,
} from "@/src/lib/resolveMediaPlaybackUrl";

type Layout = "default" | "list";

type Props = {
  url: string;
  kind: MediaKind;
  /** `list` — height follows media/content (deck card list). */
  layout?: Layout;
  /** Study preview in add-card — keeps video controls tappable on mobile. */
  preview?: boolean;
};

const LIST_IMAGE_MAX_HEIGHT = 280;
const STUDY_IMAGE_MAX_HEIGHT = 360;
const IMAGE_LOADING_HEIGHT = 72;
const LIST_VIDEO_HEIGHT = 160;
const DEFAULT_VIDEO_HEIGHT = 180;

function normalizeMediaUrl(url: string): string {
  return url.trim();
}

function CardVideoEmbed({
  embedSrc,
  title,
  height,
  boxStyle,
}: {
  embedSrc: string;
  title: string;
  height: number;
  boxStyle: object[];
}) {
  if (Platform.OS === "web") {
    return (
      <View style={[boxStyle, { height: Math.max(height, 200) }]}>
        {createElement("iframe", {
          key: embedSrc,
          src: embedSrc,
          title,
          allow:
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
          allowFullScreen: true,
          style: {
            width: "100%",
            height: "100%",
            border: "none",
            borderRadius: 10,
            display: "block",
          },
        })}
      </View>
    );
  }

  return (
    <View style={[boxStyle, { height: Math.max(height, 200) }]}>
      <WebView
        source={{
          html: buildEmbedPlayerHtml(embedSrc),
          baseUrl: getAppEmbedOrigin(),
        }}
        style={styles.video}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        mediaPlaybackRequiresUserAction={false}
        originWhitelist={["*"]}
      />
    </View>
  );
}

function MediaUrlWarning({ message, style }: { message: string; style?: object }) {
  const C = useAppColors();
  return (
    <View
      style={[
        styles.warnBox,
        style,
        {
          backgroundColor: C.isDark ? "rgba(239,68,68,0.12)" : "#fef2f2",
          borderColor: C.isDark ? "rgba(239,68,68,0.35)" : "#fecaca",
        },
      ]}
    >
      <Feather name="alert-circle" size={16} color="#ef4444" />
      <Text style={[styles.warnTxt, styles.warnTxtCentered, { color: C.isDark ? "#fca5a5" : "#b91c1c" }]}>
        {message}
      </Text>
    </View>
  );
}

export function CardSideMedia({ url, kind, layout = "default", preview = false }: Props) {
  const mediaUrl = normalizeMediaUrl(url);
  if (!mediaUrl) return null;

  const playbackUrl = resolveMediaPlaybackUrl(mediaUrl, kind);

  if (kind === "image") {
    const maxHeight = layout === "list" ? LIST_IMAGE_MAX_HEIGHT : STUDY_IMAGE_MAX_HEIGHT;
    const marginBottom = layout === "list" ? 8 : 12;
    return <AdaptiveImage url={mediaUrl} maxHeight={maxHeight} marginBottom={marginBottom} />;
  }

  if (!canPlayMediaUrl(mediaUrl, kind)) {
    return <MediaUrlUnsupported url={mediaUrl} kind={kind} />;
  }

  if (kind === "video") {
    return (
      <CardVideo url={mediaUrl} playbackUrl={playbackUrl} layout={layout} preview={preview} />
    );
  }

  return <CardAudio url={mediaUrl} compact={layout === "list"} />;
}

function MediaUrlUnsupported({ url, kind }: { url: string; kind: MediaKind }) {
  const { t } = useLanguage();
  return <MediaUrlWarning message={t(mediaLoadErrorMessageKey(url, kind))} />;
}

function CardVideo({
  url,
  playbackUrl,
  layout,
  preview = false,
}: {
  url: string;
  playbackUrl: string;
  layout: Layout;
  preview?: boolean;
}) {
  const C = useAppColors();
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);
  const driveId = extractGoogleDriveFileId(url);
  const embedSrc = extractVideoEmbedUrl(url);
  const height = layout === "list" ? LIST_VIDEO_HEIGHT : DEFAULT_VIDEO_HEIGHT;
  const minEmbedHeight = preview && Platform.OS !== "web" ? Math.max(height, 220) : height;
  const boxStyle = [
    styles.videoBox,
    layout === "list" && styles.videoBoxList,
    { height: minEmbedHeight, backgroundColor: C.isDark ? "#0f172a" : "#111827" },
  ];
  const touchCapture = preview && Platform.OS !== "web" ? styles.videoTouchCapture : undefined;

  if (embedSrc) {
    return (
      <View style={touchCapture}>
        <CardVideoEmbed
          embedSrc={embedSrc}
          title="Embedded video"
          height={minEmbedHeight}
          boxStyle={boxStyle}
        />
      </View>
    );
  }

  if (driveId) {
    return (
      <View style={touchCapture}>
        <CardVideoEmbed
          embedSrc={googleDrivePreviewEmbedUrl(driveId)}
          title="Google Drive video"
          height={minEmbedHeight}
          boxStyle={boxStyle}
        />
      </View>
    );
  }

  if (failed) {
    return <MediaUrlWarning message={t(mediaLoadErrorMessageKey(url, "video"))} />;
  }

  if (Platform.OS === "web") {
    return (
      <View style={boxStyle}>
        {createElement("video", {
          key: playbackUrl,
          src: playbackUrl,
          controls: true,
          playsInline: true,
          preload: "metadata",
          style: {
            width: "100%",
            height: "100%",
            objectFit: "contain",
            display: "block",
            backgroundColor: "#000",
          },
          onError: () => setFailed(true),
        })}
      </View>
    );
  }

  return (
    <View style={[boxStyle, touchCapture]} onStartShouldSetResponder={() => true}>
      <Video
        key={playbackUrl}
        source={{ uri: playbackUrl }}
        style={styles.video}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

type AudioUiState = "preparing" | "loading" | "ready" | "playing" | "error";

function audioShellColors(C: ReturnType<typeof useAppColors>) {
  return {
    bg: C.isDark ? "rgba(99,102,241,0.1)" : "#f5f6ff",
    border: C.isDark ? "rgba(165,180,252,0.28)" : "#d4d9ff",
    btn: C.isDark ? "#6366f1" : "#4255ff",
    btnPressed: C.isDark ? "#4f46e5" : "#3544e8",
  };
}

function AudioPlayerShell({
  compact,
  children,
  footer,
}: {
  compact?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const C = useAppColors();
  const palette = audioShellColors(C);
  return (
    <View
      style={[
        styles.audioShell,
        { backgroundColor: palette.bg, borderColor: palette.border },
        compact && styles.audioShellCompact,
      ]}
    >
      {children}
      {footer}
    </View>
  );
}

function AudioPlayButton({
  state,
  onPress,
  compact,
  disabled,
}: {
  state: AudioUiState;
  onPress: () => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const C = useAppColors();
  const palette = audioShellColors(C);
  const size = compact ? 40 : 46;
  const iconSize = compact ? 18 : 20;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || state === "preparing" || state === "loading" || state === "error"}
      style={({ pressed }) => [
        styles.audioPlayBtn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: pressed ? palette.btnPressed : palette.btn,
          opacity:
            disabled || state === "preparing" || state === "loading" || state === "error"
              ? 0.55
              : 1,
        },
      ]}
      accessibilityRole="button"
    >
      {state === "preparing" || state === "loading" ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Feather
          name={state === "playing" ? "pause" : "play"}
          size={iconSize}
          color="#fff"
          style={state === "playing" ? undefined : { marginLeft: 2 }}
        />
      )}
    </Pressable>
  );
}

function AudioMeta({ state, compact }: { state: AudioUiState; compact?: boolean }) {
  const { t } = useLanguage();
  const C = useAppColors();
  const subtitle =
    state === "preparing"
      ? t("cardAudioPreparing")
      : state === "loading"
        ? t("cardAudioLoading")
        : state === "playing"
          ? t("cardAudioPlaying")
          : state === "error"
            ? t("cardAudioLoadError")
            : t("cardAudioTap");

  return (
    <View style={styles.audioMeta}>
      <View style={styles.audioMetaTitleRow}>
        <Feather name="music" size={compact ? 14 : 15} color={C.tint} />
        <Text style={[styles.audioMetaTitle, { color: C.text }, compact && styles.audioMetaTitleCompact]}>
          {t("mediaKindAudio")}
        </Text>
      </View>
      <Text
        style={[styles.audioMetaSub, { color: state === "error" ? "#ef4444" : C.textSub }]}
        numberOfLines={2}
      >
        {subtitle}
      </Text>
    </View>
  );
}

function CardAudio({ url, compact }: { url: string; compact?: boolean }) {
  const { t } = useLanguage();
  const playbackUri = getCardAudioPlaybackUri(url);
  const soundRef = useRef<Audio.Sound | null>(null);
  const loadGenRef = useRef(0);
  const [state, setState] = useState<AudioUiState>("preparing");

  const onPlaybackStatus = useCallback((st: Audio.AVPlaybackStatus) => {
    if (!st.isLoaded) return;
    if (st.didJustFinish) {
      setState("ready");
      return;
    }
    if (st.isPlaying) setState("playing");
    else if (st.isBuffering) setState((s) => (s === "playing" ? "playing" : "loading"));
    else setState("ready");
  }, []);

  useEffect(() => {
    if (!playbackUri) {
      setState("preparing");
      return;
    }

    const gen = ++loadGenRef.current;
    setState("preparing");
    let cancelled = false;

    void (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        await soundRef.current?.unloadAsync();
        soundRef.current = null;

        const { sound } = await Audio.Sound.createAsync(
          { uri: playbackUri },
          { shouldPlay: false, progressUpdateIntervalMillis: 200 },
          onPlaybackStatus,
          false,
        );

        if (cancelled || gen !== loadGenRef.current) {
          await sound.unloadAsync();
          return;
        }

        soundRef.current = sound;
        const st = await sound.getStatusAsync();
        if (st.isLoaded) setState("ready");
      } catch {
        if (!cancelled && gen === loadGenRef.current) setState("error");
      }
    })();

    return () => {
      cancelled = true;
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [playbackUri, onPlaybackStatus]);

  const onPress = useCallback(async () => {
    if (state === "error" || state === "preparing" || !playbackUri) return;
    const sound = soundRef.current;
    if (!sound) {
      setState("loading");
      return;
    }
    try {
      const st = await sound.getStatusAsync();
      if (!st.isLoaded) return;
      if (st.isPlaying) {
        await sound.pauseAsync();
        setState("ready");
      } else {
        setState("loading");
        await sound.playAsync();
        setState("playing");
      }
    } catch {
      setState("error");
    }
  }, [state, playbackUri]);

  if (state === "error") {
    return <MediaUrlWarning message={t(mediaLoadErrorMessageKey(url, "audio"))} />;
  }

  if (!playbackUri || state === "preparing") {
    return (
      <AudioPlayerShell compact={compact}>
        <View style={styles.audioRow}>
          <AudioPlayButton state="preparing" onPress={() => {}} compact={compact} disabled />
          <AudioMeta state="preparing" compact={compact} />
        </View>
      </AudioPlayerShell>
    );
  }

  return (
    <AudioPlayerShell compact={compact}>
      <View style={styles.audioRow}>
        <AudioPlayButton state={state} onPress={onPress} compact={compact} />
        <AudioMeta state={state} compact={compact} />
      </View>
    </AudioPlayerShell>
  );
}

function AdaptiveImage({
  url: sourceUrl,
  maxHeight,
  marginBottom,
}: {
  url: string;
  maxHeight: number;
  marginBottom: number;
}) {
  const { t } = useLanguage();
  const C = useAppColors();
  const candidates = useMemo(() => resolveImageCandidateUrls(sourceUrl), [sourceUrl]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [cachedUri, setCachedUri] = useState<string | null>(null);
  const [cacheAttempted, setCacheAttempted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const cacheGenRef = useRef(0);

  const remoteUrl = candidates[candidateIndex] ?? sourceUrl.trim();
  const displayUri = cachedUri ?? remoteUrl;

  const applyDimensions = useCallback((w: number, h: number) => {
    if (w > 0 && h > 0) setRatio(h / w);
  }, []);

  useEffect(() => {
    setCandidateIndex(0);
    setCachedUri(null);
    setCacheAttempted(false);
    setFailed(false);
    setRatio(null);
    cacheGenRef.current += 1;
  }, [sourceUrl]);

  useEffect(() => {
    if (!displayUri || cachedUri) return;
    let cancelled = false;
    Image.getSize(
      displayUri,
      (w, h) => {
        if (!cancelled) applyDimensions(w, h);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [displayUri, cachedUri, applyDimensions]);

  const tryNextSource = useCallback(async () => {
    if (candidateIndex + 1 < candidates.length) {
      setCandidateIndex((i) => i + 1);
      setRatio(null);
      return;
    }

    if (!cacheAttempted && Platform.OS !== "web") {
      setCacheAttempted(true);
      const gen = ++cacheGenRef.current;
      const local = await downloadImageToCache(sourceUrl);
      if (gen !== cacheGenRef.current) return;
      if (local) {
        setCachedUri(local);
        setRatio(null);
        return;
      }
    }

    setFailed(true);
  }, [cacheAttempted, candidateIndex, candidates.length, remoteUrl]);

  if (failed) {
    return (
      <MediaUrlWarning
        message={t(mediaLoadErrorMessageKey(sourceUrl, "image"))}
        style={{ marginBottom }}
      />
    );
  }

  const bg = C.isDark ? C.surfaceAlt : "#f3f4f6";

  let imageWidth = containerWidth;
  let imageHeight = IMAGE_LOADING_HEIGHT;

  if (containerWidth > 0 && ratio != null) {
    const naturalHeight = containerWidth * ratio;
    if (naturalHeight > maxHeight) {
      imageHeight = maxHeight;
      imageWidth = maxHeight / ratio;
    } else {
      imageHeight = naturalHeight;
      imageWidth = containerWidth;
    }
  }

  return (
    <View
      style={[styles.adaptiveImageRow, { marginBottom }]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <Image
        key={displayUri}
        source={{ uri: displayUri }}
        style={{
          width: containerWidth > 0 ? imageWidth : "100%",
          height: imageHeight,
          borderRadius: 10,
          backgroundColor: bg,
        }}
        resizeMode="contain"
        onLoad={(e) => {
          const source = e.nativeEvent.source;
          if (source?.width && source?.height) {
            applyDimensions(source.width, source.height);
          }
        }}
        onError={() => {
          void tryNextSource();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  videoBox: {
    width: "100%",
    height: DEFAULT_VIDEO_HEIGHT,
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
    backgroundColor: "#111827",
  },
  videoTouchCapture: {
    width: "100%",
    zIndex: 2,
  },
  video: {
    width: "100%",
    height: "100%",
  },
  audioShell: {
    width: "100%",
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    overflow: "hidden",
  },
  audioShellCompact: {
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  audioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  audioPlayBtn: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  audioMeta: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  audioMetaTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  audioMetaTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  audioMetaTitleCompact: {
    fontSize: 14,
  },
  audioMetaSub: {
    fontSize: 13,
    lineHeight: 18,
  },
  warnBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  warnTxt: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  warnTxtCentered: {
    textAlign: "center",
  },
  adaptiveImageRow: {
    width: "100%",
    alignItems: "center",
  },
  videoBoxList: {
    height: LIST_VIDEO_HEIGHT,
    marginBottom: 8,
  },
});
