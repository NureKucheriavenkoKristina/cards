import Feather from "@expo/vector-icons/Feather";
import { memo, useState } from "react";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextStyle } from "react-native";

import { useAppColors } from "@/src/contexts/ThemeContext";
import type { CardMediaForm, CardMediaSide, CardMediaType } from "@/src/lib/cardMedia";
import {
  getMediaUrlIssueForField,
  mediaUrlIssueMessageKey,
  type MediaUrlIssue,
} from "@/src/lib/cardMedia";

const webTextInputNoOutline: TextStyle | undefined =
  Platform.OS === "web"
    ? ({ outlineWidth: 0, outlineStyle: "none" } as unknown as TextStyle)
    : undefined;

const MEDIA_META: Record<
  CardMediaType,
  { icon: keyof typeof Feather.glyphMap; labelKey: string }
> = {
  image: { icon: "image", labelKey: "mediaKindImage" },
  audio: { icon: "volume-2", labelKey: "mediaKindAudio" },
  video: { icon: "video", labelKey: "mediaKindVideo" },
};

type Props = {
  side: CardMediaSide;
  mediaForm: CardMediaForm;
  onUrlChange: (side: CardMediaSide, mediaType: CardMediaType, value: string) => void;
  onMove: (side: CardMediaSide, mediaType: CardMediaType, direction: -1 | 1) => void;
  t: (key: string) => string;
  imageLabelRight?: ReactNode;
  audioLabelRight?: ReactNode;
};

function MediaUrlField({
  side,
  kind,
  url,
  onUrlChange,
  onBlurField,
  issue,
  t,
  labelRight,
}: {
  side: CardMediaSide;
  kind: CardMediaType;
  url: string;
  onUrlChange: (side: CardMediaSide, mediaType: CardMediaType, value: string) => void;
  onBlurField: () => void;
  issue: MediaUrlIssue | null;
  t: (key: string) => string;
  labelRight?: ReactNode;
}) {
  const C = useAppColors();
  const [focused, setFocused] = useState(false);
  const meta = MEDIA_META[kind];

  return (
    <View style={styles.mediaFieldCol}>
      <View style={styles.labelRow}>
        <Text style={[styles.fieldLabel, { color: C.textSub }]}>{t(meta.labelKey)}</Text>
        {labelRight}
      </View>
      <View
        collapsable={false}
        style={[
          styles.inputRow,
          {
            backgroundColor: C.inputBg,
            borderColor: issue ? "#ef4444" : C.inputBorder,
          },
          focused &&
            !issue &&
            (C.isDark
              ? { backgroundColor: C.surface, borderColor: "#6366f1" }
              : Platform.OS === "android"
                ? { borderColor: "#6366f1", backgroundColor: "#fff" }
                : styles.inputRowFocused),
        ]}
        pointerEvents="box-none"
      >
        <Feather
          name={meta.icon}
          size={16}
          color={issue ? "#ef4444" : focused ? C.tint : C.textMuted}
        />
        <TextInput
          style={[styles.input, webTextInputNoOutline, { color: C.text }]}
          placeholder={kind === "audio" ? t("mediaAudioPlaceholder") : "https://..."}
          placeholderTextColor={C.placeholder}
          value={url}
          onChangeText={(value) => onUrlChange(side, kind, value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            onBlurField();
          }}
          autoCapitalize="none"
          keyboardType="url"
          autoCorrect={false}
        />
        {url.length > 0 ? (
          <Pressable onPress={() => onUrlChange(side, kind, "")} hitSlop={8}>
            <Feather name="x-circle" size={16} color={C.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {issue ? (
        <Text style={styles.urlError}>{t(mediaUrlIssueMessageKey(issue))}</Text>
      ) : null}
    </View>
  );
}

export const CardMediaFormFields = memo(function CardMediaFormFields({
  side,
  mediaForm,
  onUrlChange,
  onMove,
  t,
  imageLabelRight,
  audioLabelRight,
}: Props) {
  const C = useAppColors();
  const sideForm = mediaForm[side];
  const [blurredFields, setBlurredFields] = useState<Set<string>>(() => new Set());

  const markBlurred = (focusKey: string) => {
    setBlurredFields((prev) => {
      if (prev.has(focusKey)) return prev;
      const next = new Set(prev);
      next.add(focusKey);
      return next;
    });
  };

  return (
    <View style={[styles.wrap, { borderTopColor: C.borderLight }]}>
      <Text style={[styles.orderHint, { color: C.textSub }]}>{t("mediaOrderHint")}</Text>
      {sideForm.order.map((kind, index) => {
        const focusKey = `${side}-${kind}`;
        const url = sideForm.urls[kind];
        const fieldIssue = getMediaUrlIssueForField(url, kind, side);
        const showValidation =
          fieldIssue !== null &&
          (fieldIssue.reason === "wrong_field" || blurredFields.has(focusKey));
        const issue: MediaUrlIssue | null = showValidation ? fieldIssue : null;
        const canMoveUp = index > 0;
        const canMoveDown = index < sideForm.order.length - 1;
        return (
          <View key={kind} style={styles.mediaBlock}>
            <View style={styles.orderBtns}>
              <Pressable
                onPress={() => onMove(side, kind, -1)}
                disabled={!canMoveUp}
                style={[styles.orderBtn, !canMoveUp && styles.orderBtnOff]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t("mediaMoveUp")}
              >
                <Feather name="chevron-up" size={18} color={canMoveUp ? C.tint : C.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => onMove(side, kind, 1)}
                disabled={!canMoveDown}
                style={[styles.orderBtn, !canMoveDown && styles.orderBtnOff]}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t("mediaMoveDown")}
              >
                <Feather name="chevron-down" size={18} color={canMoveDown ? C.tint : C.textMuted} />
              </Pressable>
            </View>
            <MediaUrlField
              side={side}
              kind={kind}
              url={url}
              onUrlChange={onUrlChange}
              onBlurField={() => markBlurred(focusKey)}
              issue={issue}
              t={t}
              labelRight={
                kind === "image" ? imageLabelRight : kind === "audio" ? audioLabelRight : undefined
              }
            />
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  orderHint: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
    flexShrink: 0,
  },
  mediaBlock: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  orderBtns: { paddingTop: 22, gap: 2, flexShrink: 0 },
  orderBtn: {
    width: 32,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  orderBtnOff: { opacity: 0.35, backgroundColor: "transparent" },
  mediaFieldCol: { flex: 1, minWidth: 0, gap: 7 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    flexShrink: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  inputRowFocused: {
    borderColor: "#1a1a1a",
    backgroundColor: "#fff",
    shadowColor: "#1a1a1a",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  urlError: {
    fontSize: 12,
    lineHeight: 16,
    color: "#ef4444",
  },
});
