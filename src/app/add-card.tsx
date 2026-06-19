import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  memo,
  type ReactNode,
} from "react";
import {
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { Deck } from "@/assets/data/decks";
import { AudioUploadModal, type AudioUploadModalPhase } from "@/src/components/AudioUploadModal";
import ConfirmModal from "@/src/components/ConfirmModal";
import { CardMediaFormFields } from "@/src/components/CardMediaFormFields";
import { FormTextInputRow } from "@/src/components/FormTextInputRow";
import { CardSideMedia } from "@/src/components/CardSideMedia";
import { useAuth } from "@/src/contexts/AuthContext";
import { useLanguage } from "@/src/contexts/LanguageContext";
import { supabase } from "@/src/lib/supabase";
import type { Card } from "@/assets/data/cards";
import type { CardExtra, CardTypeName, ClozeParts } from "@/src/lib/cardModel";
import {
  buildClozeFrontText,
  clozeHiddenForEdit,
  getClozePartsFromCard,
  CLOZE_GAP_MARKER,
  normalizeClozeHidden,
  newPairId,
  normalizeCardType,
  parseCardExtra,
} from "@/src/lib/cardModel";
import {
  cardMediaRowsToForm,
  emptyCardMediaForm,
  getCardMediaUrlIssues,
  hasMediaFormChanges,
  mediaUrlIssueMessageKey,
  moveMediaInForm,
  orderedMediaFromForm,
  replaceCardMedia,
  swapCardMediaFormSides,
  type CardMediaForm,
  type CardMediaSide,
} from "@/src/lib/cardMedia";
import {
  basicCardSideHasContent,
  hasAnyBasicFormContent,
  hasAnyClozeFormContent,
  isCardFormValid,
  isClozeCoreContentValid,
  type CardFormFields,
} from "@/src/lib/cardFormValidation";
import { useLayoutWidth } from "@/src/hooks/useLayoutWidth";
import { useAppColors } from "@/src/contexts/ThemeContext";
import { generateCardBack, generateCardImageUrl } from "@/src/lib/gemini";
import { keyboardAvoidingBehavior } from "@/src/lib/keyboardAvoiding";
import {
  pickCardAudioFile,
  uploadAudioErrorKey,
  uploadCardAudioToStorage,
  type UploadAudioPhase,
} from "@/src/lib/uploadCardAudio";
import { persistExpiringImagesInMediaForm } from "@/src/lib/uploadRemoteImage";

const FORM_SIDE_BY_SIDE_MIN_WIDTH = 768;

/** Web: follow viewport width. Native: lock at mount so the keyboard does not flip the layout. */
function useFormSideBySide(): boolean {
  const layoutWidth = useLayoutWidth();
  const [nativeSideBySide] = useState(
    () => Platform.OS !== "web" && Dimensions.get("screen").width >= FORM_SIDE_BY_SIDE_MIN_WIDTH,
  );

  if (Platform.OS === "web") {
    return layoutWidth >= FORM_SIDE_BY_SIDE_MIN_WIDTH;
  }
  return nativeSideBySide;
}

function buildCardFormFields(
  frontText: string,
  backText: string,
  notes: string,
  cloze: ClozeParts,
  mediaForm: CardMediaForm,
): CardFormFields {
  return { frontText, backText, notes, cloze, mediaForm };
}

const addCardStudyClozeStyles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 30,
    textAlign: "center",
    width: "100%",
  },
  gap: {
    fontStyle: "italic",
    fontWeight: "600",
  },
  gapHint: {
    fontStyle: "italic",
    fontWeight: "500",
  },
  answer: {
    fontWeight: "800",
    color: "#059669",
  },
});

function AddCardStudyClozeFront({ parts }: { parts: ClozeParts }) {
  const C = useAppColors();
  const { t } = useLanguage();
  const gapLabel = t("clozeGapMarker") || CLOZE_GAP_MARKER;
  const gap =
    parts.gapFront.trim().length > 0 ? (
      <Text style={[addCardStudyClozeStyles.gapHint, { color: C.textSub }]}>
        {" "}
        {parts.gapFront.trim()}{" "}
      </Text>
    ) : (
      <Text style={[addCardStudyClozeStyles.gap, { color: C.textMuted }]}> {gapLabel} </Text>
    );
  return (
    <View style={addCardStudyClozeStyles.wrap}>
      <Text style={[addCardStudyClozeStyles.title, { color: C.text }]}>
        {parts.before}
        {gap}
        {parts.after}
      </Text>
    </View>
  );
}

function AddCardStudyClozeBack({ parts }: { parts: ClozeParts }) {
  const C = useAppColors();
  return (
    <View style={addCardStudyClozeStyles.wrap}>
      <Text style={[addCardStudyClozeStyles.title, { color: C.text }]}>
        {parts.before}
        <Text style={addCardStudyClozeStyles.answer}>{parts.hidden}</Text>
        {parts.after}
      </Text>
    </View>
  );
}

const clozeLivePreviewStyles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
    width: "100%",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    width: "100%",
  },
  stack: { gap: 10, width: "100%" },
  col: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  colLabel: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  sentence: {
    fontSize: 15,
    lineHeight: 22,
    width: "100%",
  },
  gap: {
    fontStyle: "italic",
    fontWeight: "600",
  },
  gapHint: { fontStyle: "italic", fontWeight: "500" },
  answer: { fontWeight: "800", color: "#059669" },
});

const ClozeLivePreview = memo(function ClozeLivePreview({
  parts,
  sideBySide,
  textColor,
  subColor,
  borderColor,
  bgColor,
  gapLabel,
  frontLabel,
  backLabel,
}: {
  parts: ClozeParts;
  sideBySide: boolean;
  textColor: string;
  subColor: string;
  borderColor: string;
  bgColor: string;
  gapLabel: string;
  frontLabel: string;
  backLabel: string;
}) {
  const gap =
    parts.gapFront.trim().length > 0 ? (
      <Text style={[clozeLivePreviewStyles.gapHint, { color: subColor }]}>
        {" "}
        {parts.gapFront.trim()}{" "}
      </Text>
    ) : (
      <Text style={[clozeLivePreviewStyles.gap, { color: subColor }]}> {gapLabel} </Text>
    );

  const frontSentence = (
    <Text style={[clozeLivePreviewStyles.sentence, { color: textColor }]}>
      {parts.before}
      {gap}
      {parts.after}
    </Text>
  );

  const backSentence = (
    <Text style={[clozeLivePreviewStyles.sentence, { color: textColor }]}>
      {parts.before}
      {parts.hidden.trim().length > 0 ? (
        <Text style={clozeLivePreviewStyles.answer}>{parts.hidden}</Text>
      ) : (
        <Text style={[clozeLivePreviewStyles.gap, { color: subColor }]}> {gapLabel} </Text>
      )}
      {parts.after}
    </Text>
  );

  return (
    <View style={[clozeLivePreviewStyles.wrap, { backgroundColor: bgColor, borderColor }]}>
      <View style={sideBySide ? clozeLivePreviewStyles.row : clozeLivePreviewStyles.stack}>
        <View style={clozeLivePreviewStyles.col}>
          <Text style={[clozeLivePreviewStyles.colLabel, { color: subColor }]}>{frontLabel}</Text>
          {frontSentence}
        </View>
        <View style={clozeLivePreviewStyles.col}>
          <Text style={[clozeLivePreviewStyles.colLabel, { color: subColor }]}>{backLabel}</Text>
          {backSentence}
        </View>
      </View>
    </View>
  );
});

type CardFormSnapshot = {
  frontText: string;
  backText: string;
  mediaForm: CardMediaForm;
  notes: string;
  cardType: CardTypeName;
  pairMeta: { pairId?: string; pairRole?: "forward" | "reverse" };
  clozeBefore: string;
  clozeGapFront: string;
  clozeHidden: string;
  clozeAfter: string;
};

const AudioUploadSideButton = memo(function AudioUploadSideButton({
  side,
  disabled,
  onPress,
  label,
}: {
  side: CardMediaSide;
  disabled: boolean;
  onPress: (side: CardMediaSide) => void;
  label: string;
}) {
  const C = useAppColors();
  return (
    <TouchableOpacity
      style={[
        styles.aiLabelBtn,
        {
          borderColor: C.tint,
          backgroundColor: C.isDark ? "rgba(99,102,241,0.12)" : "#eef0ff",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={() => onPress(side)}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name="upload" size={14} color={C.tint} />
      <Text style={[styles.aiLabelBtnTxt, { color: C.tint }]}>{label}</Text>
    </TouchableOpacity>
  );
});

const AiFrontImageButton = memo(function AiFrontImageButton({
  busy,
  disabled,
  onPress,
  busyLabel,
  idleLabel,
}: {
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  busyLabel: string;
  idleLabel: string;
}) {
  const C = useAppColors();
  return (
    <TouchableOpacity
      style={[
        styles.aiLabelBtn,
        {
          borderColor: C.tint,
          backgroundColor: C.isDark ? "rgba(99,102,241,0.12)" : "#eef0ff",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={idleLabel}
    >
      {busy ? (
        <ActivityIndicator size="small" color={C.tint} />
      ) : (
        <Feather name="image" size={14} color={C.tint} />
      )}
      <Text style={[styles.aiLabelBtnTxt, { color: C.tint }]}>
        {busy ? busyLabel : idleLabel}
      </Text>
    </TouchableOpacity>
  );
});

const AiBackFillButton = memo(function AiBackFillButton({
  busy,
  disabled,
  onPress,
  busyLabel,
  idleLabel,
}: {
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
  busyLabel: string;
  idleLabel: string;
}) {
  const C = useAppColors();
  return (
    <TouchableOpacity
      style={[
        styles.aiLabelBtn,
        {
          borderColor: C.tint,
          backgroundColor: C.isDark ? "rgba(99,102,241,0.12)" : "#eef0ff",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={idleLabel}
    >
      {busy ? (
        <ActivityIndicator size="small" color={C.tint} />
      ) : (
        <Feather name="zap" size={14} color={C.tint} />
      )}
      <Text style={[styles.aiLabelBtnTxt, { color: C.tint }]}>
        {busy ? busyLabel : idleLabel}
      </Text>
    </TouchableOpacity>
  );
});

type CardEditorFormProps = {
  deck: Deck;
  deckId: string;
  cardId: string | null;
  userId: string | null;
  isEdit: boolean;
  formSideBySide: boolean;
  snapshot: CardFormSnapshot;
};

/** Isolated form tree so typing does not re-render route shell / modals on every keystroke. */
function CardEditorForm({
  deck,
  deckId,
  cardId,
  userId,
  isEdit,
  formSideBySide,
  snapshot,
}: CardEditorFormProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const C = useAppColors();

  const [frontText, setFrontText] = useState(snapshot.frontText);
  const [backText, setBackText] = useState(snapshot.backText);
  const [mediaForm, setMediaForm] = useState(snapshot.mediaForm);
  const [notes, setNotes] = useState(snapshot.notes);
  const [initialFront] = useState(snapshot.frontText);
  const [initialBack] = useState(snapshot.backText);
  const [initialMediaForm] = useState(snapshot.mediaForm);
  const [initialNotes] = useState(snapshot.notes);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [studyPreviewOpen, setStudyPreviewOpen] = useState(false);
  const [studyPreviewShowBack, setStudyPreviewShowBack] = useState(false);
  /** When creating a reversed pair, which of the two future cards to preview (1 = forward, 2 = reverse). */
  const [studyPreviewPairSlot, setStudyPreviewPairSlot] = useState<1 | 2>(1);

  const [cardType, setCardType] = useState(snapshot.cardType);
  const [initialCardType] = useState(snapshot.cardType);
  /** Optional second card with swapped sides when creating a new basic card. */
  const [createReversedPair, setCreateReversedPair] = useState(false);
  const [initialCreateReversed] = useState(false);
  /** Preserve reversible link when editing. */
  const [pairMeta] = useState(snapshot.pairMeta);

  const [clozeBefore, setClozeBefore] = useState(snapshot.clozeBefore);
  const [clozeGapFront, setClozeGapFront] = useState(snapshot.clozeGapFront);
  const [clozeHidden, setClozeHidden] = useState(snapshot.clozeHidden);
  const [clozeAfter, setClozeAfter] = useState(snapshot.clozeAfter);
  const [initialClozeBefore] = useState(snapshot.clozeBefore);
  const [initialClozeGapFront] = useState(snapshot.clozeGapFront);
  const [initialClozeHidden] = useState(snapshot.clozeHidden);
  const [initialClozeAfter] = useState(snapshot.clozeAfter);

  const setMediaUrl = useCallback(
    (side: "front" | "back", mediaType: "image" | "audio" | "video", value: string) => {
      setMediaForm((current) => ({
        ...current,
        [side]: {
          ...current[side],
          urls: { ...current[side].urls, [mediaType]: value },
        },
      }));
    },
    [],
  );

  const moveMediaOrder = useCallback(
    (side: "front" | "back", mediaType: "image" | "audio" | "video", direction: -1 | 1) => {
      setMediaForm((current) => moveMediaInForm(current, side, mediaType, direction));
    },
    [],
  );

  const [aiBackBusy, setAiBackBusy] = useState(false);
  const [aiFrontImgBusy, setAiFrontImgBusy] = useState(false);
  const [aiBackImgBusy, setAiBackImgBusy] = useState(false);
  const [audioUploadModal, setAudioUploadModal] = useState<{
    visible: boolean;
    phase: AudioUploadModalPhase;
    side: CardMediaSide | null;
    fileName?: string;
  } | null>(null);

  const mapUploadPhase = (phase: UploadAudioPhase): AudioUploadModalPhase => {
    if (phase === "caching" || phase === "done") return "preparing";
    return phase;
  };

  const handlePickAudio = useCallback(
    async (side: CardMediaSide) => {
      if (!userId) {
        setErrorModal(t("uploadAudioNeedLogin"));
        return;
      }
      const asset = await pickCardAudioFile();
      if (!asset) return;

      const fileName = asset.name ?? "audio";
      setAudioUploadModal({ visible: true, phase: "reading", side, fileName });

      const result = await uploadCardAudioToStorage({
        localUri: asset.uri,
        fileName,
        mimeType: asset.mimeType,
        fileSize: asset.size ?? null,
        userId,
        deckId,
        cardId: cardId ?? undefined,
        side,
        pickerCacheUri: asset.uri,
        onPhase: (phase) => {
          if (phase === "done") return;
          setAudioUploadModal({ visible: true, phase: mapUploadPhase(phase), side, fileName });
        },
      });

      if (!result.ok) {
        setAudioUploadModal(null);
        const key = uploadAudioErrorKey(result.error);
        const byKey: Record<string, string> = {
          too_large: t("uploadAudioTooLarge"),
          not_authenticated: t("uploadAudioNeedLogin"),
          bucket_missing: t("uploadAudioBucketMissing"),
          permission: t("uploadAudioPermission"),
          mime: t("uploadAudioMimeType"),
          read_failed: t("uploadAudioReadFailed"),
        };
        setErrorModal(byKey[key] ?? `${t("uploadAudioError")}\n\n${result.error}`);
        return;
      }

      setMediaUrl(side, "audio", result.publicUrl);
      setAudioUploadModal(null);
    },
    [cardId, deckId, t, userId],
  );

  const audioUploadLabel = t("uploadAudio");
  const aiImageBusyLabel = t("aiGenerateImageLoading");
  const aiImageIdleLabel = t("aiGenerateImage");
  const aiBackBusyLabel = t("aiGenerateBackLoading");
  const aiBackIdleLabel = t("aiGenerateBack");
  const frontHasText = frontText.trim().length > 0;
  const backOrFrontHasText = frontHasText || backText.trim().length > 0;

  const handleAiFillBack = useCallback(async () => {
    if (!deck || cardType !== "basic" || !frontText.trim()) {
      setErrorModal(t("aiFillBackNeedFront"));
      return;
    }
    setAiBackBusy(true);
    const back = await generateCardBack(
      frontText.trim(),
      deck.title ?? "",
      deck.description,
    );
    setAiBackBusy(false);
    if (back) setBackText(back);
    else setErrorModal(t("aiError"));
  }, [cardType, deck, frontText, t]);

  const handleAiFrontImage = useCallback(async () => {
    if (!deck || cardType !== "basic" || !frontText.trim()) {
      setErrorModal(t("aiFillImageNeedText"));
      return;
    }
    setAiFrontImgBusy(true);
    const result = await generateCardImageUrl(
      frontText.trim(),
      deck.title ?? "",
      deck.description,
      "front",
      userId
        ? {
            userId,
            deckId,
            cardId,
            kind: "card-image",
            side: "front",
          }
        : undefined,
    );
    setAiFrontImgBusy(false);
    if (result.ok) setMediaUrl("front", "image", result.url);
    else if (result.reason === "quota") setErrorModal(t("aiErrorQuota"));
    else if (result.reason === "no_match") setErrorModal(t("aiErrorNoImage"));
    else if (result.reason === "not_authenticated") setErrorModal(t("uploadAudioNeedLogin"));
    else if (result.reason === "upload_failed") setErrorModal(t("aiImageUploadFailed"));
    else setErrorModal(t("aiError"));
  }, [cardId, cardType, deck, deckId, frontText, t, userId]);

  const handleAiBackImage = useCallback(async () => {
    if (!deck || cardType !== "basic") return;
    const cue = backText.trim() || frontText.trim();
    if (!cue) {
      setErrorModal(t("aiFillImageNeedText"));
      return;
    }
    setAiBackImgBusy(true);
    const result = await generateCardImageUrl(
      cue,
      deck.title ?? "",
      deck.description,
      "back",
      userId
        ? {
            userId,
            deckId,
            cardId,
            kind: "card-image",
            side: "back",
          }
        : undefined,
    );
    setAiBackImgBusy(false);
    if (result.ok) setMediaUrl("back", "image", result.url);
    else if (result.reason === "quota") setErrorModal(t("aiErrorQuota"));
    else if (result.reason === "no_match") setErrorModal(t("aiErrorNoImage"));
    else if (result.reason === "not_authenticated") setErrorModal(t("uploadAudioNeedLogin"));
    else if (result.reason === "upload_failed") setErrorModal(t("aiImageUploadFailed"));
    else setErrorModal(t("aiError"));
  }, [backText, cardId, cardType, deck, deckId, frontText, t, userId]);

  const handleCardTypeChange = (nextType: CardTypeName) => {
    if (nextType === cardType) return;
    if (nextType === "cloze") {
      const coreEmpty =
        !clozeBefore.trim() && !clozeHidden.trim() && !clozeAfter.trim();
      if (coreEmpty) {
        if (frontText.trim()) setClozeBefore(frontText);
        if (backText.trim()) setClozeHidden(backText);
      }
    }
    if (nextType !== "basic") {
      setCreateReversedPair(false);
    }
    setCardType(nextType);
  };

  const handleSave = async () => {
    if (!cardId && !deckId) {
      setError(t("deckNotFound"));
      return;
    }

    const urlIssues = getCardMediaUrlIssues(mediaForm);
    if (urlIssues.length > 0) {
      setErrorModal(t(mediaUrlIssueMessageKey(urlIssues[0])));
      return;
    }

    const formFields = buildCardFormFields(
      frontText,
      backText,
      notes,
      {
        before: clozeBefore,
        gapFront: clozeGapFront,
        hidden: clozeHidden,
        after: clozeAfter,
      },
      mediaForm,
    );
    const ok = isCardFormValid(cardType, formFields);
    if (!ok) {
      if (
        cardType === "cloze" &&
        !isClozeCoreContentValid(formFields.cloze)
      ) {
        setErrorModal(t("cardFormClozeNeedsCore"));
        return;
      }
      if (cardType === "basic" && createReversedPair && hasAnyBasicFormContent(formFields)) {
        const frontFilled = basicCardSideHasContent(
          formFields.frontText,
          formFields.mediaForm,
          "front",
        );
        const backFilled = basicCardSideHasContent(
          formFields.backText,
          formFields.mediaForm,
          "back",
        );
        if (!frontFilled || !backFilled) {
          setErrorModal(t("cardFormReversedPairNeedsBothSides"));
          return;
        }
      }
      setErrorModal(t("cardFormEmpty"));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let mediaToSave = mediaForm;
      if (userId && deckId) {
        const persistedMedia = await persistExpiringImagesInMediaForm(mediaForm, {
          userId,
          deckId,
          cardId,
        });
        if (!persistedMedia.ok) {
          const key = uploadAudioErrorKey(persistedMedia.error);
          const byKey: Record<string, string> = {
            too_large: t("uploadAudioTooLarge"),
            not_authenticated: t("uploadAudioNeedLogin"),
            bucket_missing: t("uploadAudioBucketMissing"),
            permission: t("uploadAudioPermission"),
          };
          const msg = byKey[key] ?? t("aiImageUploadFailed");
          setError(msg);
          setIsSaving(false);
          setErrorModal(msg);
          return;
        }
        mediaToSave = persistedMedia.form;
      }

      const notesVal = notes.trim() || null;

      const clozeParts: ClozeParts = {
        before: clozeBefore,
        gapFront: clozeGapFront.trim(),
        hidden: normalizeClozeHidden(clozeHidden),
        after: clozeAfter,
      };
      const outFront =
        cardType === "cloze" ? buildClozeFrontText(clozeParts) : frontText.trim();
      const outBack = cardType === "cloze" ? "" : backText.trim();

      if (cardId) {
        if (cardType === "basic" && createReversedPair && !pairMeta.pairId) {
          if (!deckId) {
            setError(t("deckNotFound"));
            setIsSaving(false);
            return;
          }
          const pairId = newPairId();
          const forwardExtra: CardExtra = { pairId, pairRole: "forward" };
          const { error: upsertError } = await supabase
            .from("cards")
            .update({
              card_type: cardType,
              card_extra: forwardExtra,
              front_text: outFront,
              back_text: outBack,
              notes: notesVal,
              updated_at: new Date().toISOString(),
            })
            .eq("card_id", cardId);

          if (upsertError) {
            const msg = upsertError.message || t("failedToSaveCard");
            setError(msg);
            setIsSaving(false);
            setErrorModal(msg);
            return;
          }
          await replaceCardMedia(cardId, mediaToSave);

          const { data: secondRow, error: e2 } = await supabase
            .from("cards")
            .insert({
              deck_id: deckId,
              card_type: "basic",
              card_extra: { pairId, pairRole: "reverse" },
              front_text: outBack,
              back_text: outFront,
              notes: notesVal,
              created_by: userId,
            })
            .select("card_id")
            .single();

          if (e2 || !secondRow?.card_id) {
            await supabase
              .from("cards")
              .update({
                card_extra: {},
                updated_at: new Date().toISOString(),
              })
              .eq("card_id", cardId);
            const msg = e2?.message || t("failedToSaveCard");
            setError(msg);
            setIsSaving(false);
            setErrorModal(msg);
            return;
          }
          await replaceCardMedia(secondRow.card_id, swapCardMediaFormSides(mediaToSave));
          router.back();
          return;
        }

        const extraPayload: CardExtra = {
          ...(pairMeta.pairId
            ? { pairId: pairMeta.pairId, pairRole: pairMeta.pairRole }
            : {}),
          ...(cardType === "cloze" ? { cloze: clozeParts } : {}),
        };
        const { error: upsertError } = await supabase
          .from("cards")
          .update({
            card_type: cardType,
            card_extra: extraPayload,
            front_text: outFront,
            back_text: outBack,
            notes: notesVal,
            updated_at: new Date().toISOString(),
          })
          .eq("card_id", cardId);

        if (upsertError) {
          const msg = upsertError.message || t("failedToSaveCard");
          setError(msg);
          setIsSaving(false);
          setErrorModal(msg);
          return;
        }
        await replaceCardMedia(cardId, mediaToSave);
        router.back();
        return;
      }

      if (!deckId) {
        setError(t("deckNotFound"));
        setIsSaving(false);
        return;
      }

      if (cardType === "basic" && createReversedPair) {
        const pairId = newPairId();
        const forwardExtra: CardExtra = {
          pairId,
          pairRole: "forward",
        };
        const reverseExtra: CardExtra = {
          pairId,
          pairRole: "reverse",
        };

        const { data: firstRow, error: e1 } = await supabase
          .from("cards")
          .insert({
            deck_id: deckId,
            card_type: "basic",
            card_extra: forwardExtra,
            front_text: outFront,
            back_text: outBack,
            notes: notesVal,
            created_by: userId,
          })
          .select("card_id")
          .single();
        if (e1 || !firstRow?.card_id) {
          const msg = e1?.message || t("failedToSaveCard");
          setError(msg);
          setIsSaving(false);
          setErrorModal(msg);
          return;
        }
        await replaceCardMedia(firstRow.card_id, mediaToSave);

        const { data: secondRow, error: e2 } = await supabase.from("cards").insert({
          deck_id: deckId,
          card_type: "basic",
          card_extra: reverseExtra,
          front_text: outBack,
          back_text: outFront,
          notes: notesVal,
          created_by: userId,
        }).select("card_id").single();
        if (e2 || !secondRow?.card_id) {
          await supabase.from("cards").delete().eq("card_id", firstRow.card_id);
          const msg = e2?.message || t("failedToSaveCard");
          setError(msg);
          setIsSaving(false);
          setErrorModal(msg);
          return;
        }
        await replaceCardMedia(secondRow.card_id, swapCardMediaFormSides(mediaToSave));
        router.back();
        return;
      }

      const extraPayload: CardExtra = {
        ...(cardType === "cloze" ? { cloze: clozeParts } : {}),
      };
      const { data: insertedCard, error: upsertError } = await supabase.from("cards").insert({
        deck_id: deckId,
        card_type: cardType,
        card_extra: extraPayload,
        front_text: outFront,
        back_text: outBack,
        notes: notesVal,
        created_by: userId,
      }).select("card_id").single();

      if (upsertError || !insertedCard?.card_id) {
        const msg = upsertError?.message || t("failedToSaveCard");
        setError(msg);
        setIsSaving(false);
        setErrorModal(msg);
        return;
      }
      await replaceCardMedia(insertedCard.card_id, mediaToSave);

      router.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("unexpectedError");
      setError(msg);
      setIsSaving(false);
      setErrorModal(msg);
    }
  };

  const hasChanges =
    cardType !== initialCardType ||
    hasMediaFormChanges(mediaForm, initialMediaForm) ||
    createReversedPair !== initialCreateReversed ||
    clozeBefore !== initialClozeBefore ||
    clozeGapFront !== initialClozeGapFront ||
    clozeHidden !== initialClozeHidden ||
    clozeAfter !== initialClozeAfter ||
    frontText !== initialFront ||
    backText !== initialBack ||
    notes !== initialNotes;
  const formFields = buildCardFormFields(
    frontText,
    backText,
    notes,
    {
      before: clozeBefore,
      gapFront: clozeGapFront,
      hidden: clozeHidden,
      after: clozeAfter,
    },
    mediaForm,
  );
  const isValid = isCardFormValid(cardType, formFields);
  const canSave = isValid && (!isEdit || hasChanges);
  const showPairStudySwitcher = cardType === "basic" && createReversedPair;
  const clozePartsPreview: ClozeParts = useMemo(
    () => ({
      before: clozeBefore,
      gapFront: clozeGapFront.trim(),
      hidden: normalizeClozeHidden(clozeHidden),
      after: clozeAfter,
    }),
    [clozeAfter, clozeBefore, clozeGapFront, clozeHidden],
  );
  const clozePartsPreviewDeferred = useDeferredValue(clozePartsPreview);
  const frontPreviewMedia = orderedMediaFromForm(mediaForm, "front");
  const backPreviewMedia = orderedMediaFromForm(mediaForm, "back");

  const renderPreviewMedia = (items: typeof frontPreviewMedia) =>
    items.map((item) => (
      <CardSideMedia
        key={`${item.kind}-${item.url}`}
        url={item.url}
        kind={item.kind}
        preview
      />
    ));

  return (
    <>
      <KeyboardAvoidingView
        behavior={keyboardAvoidingBehavior()}
        style={{ flex: 1, backgroundColor: C.bg }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollOuter}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={Platform.OS === "web"}
          removeClippedSubviews={Platform.OS === "android" ? false : undefined}
        >
          <View style={styles.formContainer}>
            {/* ── HERO HEADER ── */}
            <View style={styles.hero}>
              <View style={[styles.heroBadge, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.18)' : '#eff1ff' }]}>
                <Feather
                  name={isEdit ? "edit-3" : "credit-card"}
                  size={20}
                  color={C.tint}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroTitle, { color: C.text }]}>
                  {isEdit ? t("editCard") : t("addCard")}
                </Text>
                <Text style={[styles.heroSub, { color: C.textSub }]} numberOfLines={1}>
                  {deck.title}
                </Text>
              </View>
            </View>

            {/* ── FORM CARD ── */}
            <View style={[styles.card, { backgroundColor: C.surface }]}>
              <Field label={t("cardTypeLabel")}>
                <View style={styles.typeRow}>
                  {(
                    [
                      ["basic", "cardTypeBasic"],
                      ["cloze", "cardTypeCloze"],
                    ] as const
                  ).map(([id, lk]) => (
                    <Pressable
                      key={id}
                      onPress={() => handleCardTypeChange(id)}
                      style={[
                        styles.typeChip,
                        { backgroundColor: C.inputBg, borderColor: C.inputBorder },
                        cardType === id && {
                          borderColor: C.tint,
                          backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#eff1ff',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeChipTxt,
                          { color: C.textSub },
                          cardType === id && { color: C.tint, fontWeight: '700' as const },
                        ]}
                      >
                        {t(lk)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </Field>

              {cardType === "cloze" ? (
                <>
                  <Text style={[styles.formIntro, { color: C.textSub }]}>{t("clozeIntro")}</Text>
                  <ClozeLivePreview
                    parts={clozePartsPreviewDeferred}
                    sideBySide={formSideBySide}
                    textColor={C.text}
                    subColor={C.textSub}
                    borderColor={C.borderLight}
                    bgColor={C.inputBg}
                    gapLabel={t("clozeGapMarker") || CLOZE_GAP_MARKER}
                    frontLabel={t("clozePreviewFrontLabel")}
                    backLabel={t("clozePreviewBackLabel")}
                  />
                  <View
                    style={[
                      styles.basicSidesRow,
                      formSideBySide
                        ? styles.basicSidesRowHorizontal
                        : styles.basicSidesRowStacked,
                    ]}
                  >
                    <View
                      style={[
                        styles.basicSideCol,
                        formSideBySide && styles.basicSideColFlex,
                        formSideBySide && styles.basicSideColLeft,
                      ]}
                    >
                      <CardSideColumnHeader
                        title={t("front")}
                        balanced={formSideBySide}
                      />
                      <Field label={t("clozeFieldBefore")}>
                        <FormTextInputRow
                          icon="align-left"
                          value={clozeBefore}
                          onChangeText={setClozeBefore}
                          placeholder={t("clozePlaceholderBefore")}
                          multiline
                          inputStyle={styles.inputClozeCompact}
                        />
                      </Field>
                      <Field label={t("clozeFieldGapFront")}>
                        <FormTextInputRow
                          icon="book-open"
                          value={clozeGapFront}
                          onChangeText={setClozeGapFront}
                          placeholder={t("clozePlaceholderGapFront")}
                          multiline
                          showClear
                          inputStyle={[styles.inputClozeGapHint, styles.inputClozeGap]}
                        />
                      </Field>
                      <Field label={t("clozeFieldAfter")}>
                        <FormTextInputRow
                          icon="align-right"
                          value={clozeAfter}
                          onChangeText={setClozeAfter}
                          placeholder={t("clozePlaceholderAfter")}
                          multiline
                          inputStyle={styles.inputClozeCompact}
                        />
                      </Field>
                      <CardMediaFormFields
                        side="front"
                        mediaForm={mediaForm}
                        onUrlChange={setMediaUrl}
                        onMove={moveMediaOrder}
                        t={t}
                        audioLabelRight={
                          <AudioUploadSideButton
                            side="front"
                            disabled={Boolean(
                              audioUploadModal?.visible && audioUploadModal.side === "front",
                            )}
                            onPress={handlePickAudio}
                            label={audioUploadLabel}
                          />
                        }
                      />
                      <CardNotesField notes={notes} onChangeNotes={setNotes} t={t} />
                    </View>

                    {formSideBySide ? (
                      <View
                        style={[styles.basicSidesDivider, { backgroundColor: C.borderLight }]}
                      />
                    ) : null}

                    <View
                      style={[
                        styles.basicSideCol,
                        formSideBySide && styles.basicSideColFlex,
                        formSideBySide && styles.basicSideColRight,
                        !formSideBySide && styles.basicSideColStackedNext,
                        { borderColor: C.borderLight },
                      ]}
                    >
                      <CardSideColumnHeader
                        title={t("back")}
                        balanced={formSideBySide}
                      />
                      <Field label={t("clozeFieldHidden")}>
                        <FormTextInputRow
                          icon="target"
                          value={clozeHidden}
                          onChangeText={setClozeHidden}
                          placeholder={t("clozePlaceholderHidden")}
                          multiline
                          fill={formSideBySide}
                          showClear
                          inputStyle={[
                            styles.inputMulti,
                            formSideBySide && styles.inputMultiFill,
                            styles.inputClozeHidden,
                          ]}
                          onBlur={() => {
                            setClozeHidden((v) => (v.trim() ? normalizeClozeHidden(v) : v));
                          }}
                        />
                      </Field>
                      <CardMediaFormFields
                        side="back"
                        mediaForm={mediaForm}
                        onUrlChange={setMediaUrl}
                        onMove={moveMediaOrder}
                        t={t}
                        audioLabelRight={
                          <AudioUploadSideButton
                            side="back"
                            disabled={Boolean(
                              audioUploadModal?.visible && audioUploadModal.side === "back",
                            )}
                            onPress={handlePickAudio}
                            label={audioUploadLabel}
                          />
                        }
                      />
                    </View>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.formIntro, { color: C.textSub }]}>
                    {t("cardFormIntroBasic")}
                  </Text>
                  <View
                    style={[
                      styles.basicSidesRow,
                      formSideBySide
                        ? styles.basicSidesRowHorizontal
                        : styles.basicSidesRowStacked,
                    ]}
                  >
                    <View
                      style={[
                        styles.basicSideCol,
                        formSideBySide && styles.basicSideColFlex,
                        formSideBySide && styles.basicSideColLeft,
                      ]}
                    >
                      <CardSideColumnHeader
                        title={t("front")}
                        balanced={formSideBySide}
                      />
                      <Field hideLabel>
                        <FormTextInputRow
                          icon="align-left"
                          value={frontText}
                          onChangeText={setFrontText}
                          placeholder={t("frontPlaceholder")}
                          multiline
                          fill={formSideBySide}
                          showClear
                          inputStyle={[
                            styles.inputMulti,
                            formSideBySide && styles.inputMultiFill,
                          ]}
                        />
                      </Field>
                      <CardMediaFormFields
                        side="front"
                        mediaForm={mediaForm}
                        onUrlChange={setMediaUrl}
                        onMove={moveMediaOrder}
                        t={t}
                        imageLabelRight={
                          <AiFrontImageButton
                            busy={aiFrontImgBusy}
                            disabled={aiFrontImgBusy || !frontHasText}
                            onPress={handleAiFrontImage}
                            busyLabel={aiImageBusyLabel}
                            idleLabel={aiImageIdleLabel}
                          />
                        }
                        audioLabelRight={
                          <AudioUploadSideButton
                            side="front"
                            disabled={Boolean(
                              audioUploadModal?.visible && audioUploadModal.side === "front",
                            )}
                            onPress={handlePickAudio}
                            label={audioUploadLabel}
                          />
                        }
                      />
                      <CardNotesField notes={notes} onChangeNotes={setNotes} t={t} />
                    </View>

                    {formSideBySide ? (
                      <View
                        style={[styles.basicSidesDivider, { backgroundColor: C.borderLight }]}
                      />
                    ) : null}

                    <View
                      style={[
                        styles.basicSideCol,
                        formSideBySide && styles.basicSideColFlex,
                        formSideBySide && styles.basicSideColRight,
                        !formSideBySide && styles.basicSideColStackedNext,
                        { borderColor: C.borderLight },
                      ]}
                    >
                      <CardSideColumnHeader
                        title={t("back")}
                        balanced={formSideBySide}
                        right={
                          <AiBackFillButton
                            busy={aiBackBusy}
                            disabled={aiBackBusy || !frontHasText}
                            onPress={handleAiFillBack}
                            busyLabel={aiBackBusyLabel}
                            idleLabel={aiBackIdleLabel}
                          />
                        }
                      />
                      <Field hideLabel>
                        <FormTextInputRow
                          icon="align-right"
                          value={backText}
                          onChangeText={setBackText}
                          placeholder={t("backPlaceholder")}
                          multiline
                          fill={formSideBySide}
                          showClear
                          inputStyle={[
                            styles.inputMulti,
                            formSideBySide && styles.inputMultiFill,
                          ]}
                        />
                      </Field>
                      <CardMediaFormFields
                        side="back"
                        mediaForm={mediaForm}
                        onUrlChange={setMediaUrl}
                        onMove={moveMediaOrder}
                        t={t}
                        imageLabelRight={
                          <AiFrontImageButton
                            busy={aiBackImgBusy}
                            disabled={aiBackImgBusy || !backOrFrontHasText}
                            onPress={handleAiBackImage}
                            busyLabel={aiImageBusyLabel}
                            idleLabel={aiImageIdleLabel}
                          />
                        }
                        audioLabelRight={
                          <AudioUploadSideButton
                            side="back"
                            disabled={Boolean(
                              audioUploadModal?.visible && audioUploadModal.side === "back",
                            )}
                            onPress={handlePickAudio}
                            label={audioUploadLabel}
                          />
                        }
                      />
                    </View>
                  </View>
                  {!pairMeta.pairId ? (
                    <Pressable
                      style={styles.revToggle}
                      onPress={() => setCreateReversedPair((v) => !v)}
                    >
                      <Feather
                        name={createReversedPair ? "check-square" : "square"}
                        size={20}
                        color={createReversedPair ? C.tint : C.textMuted}
                      />
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[styles.revToggleTitle, { color: C.text }]}>
                          {t("cardCreateReversedPair")}
                        </Text>
                        <Text style={[styles.revToggleHint, { color: C.textSub }]}>
                          {t("cardCreateReversedHint")}
                        </Text>
                      </View>
                    </Pressable>
                  ) : null}
                  {pairMeta.pairId ? (
                    <Text style={[styles.revEditHint, { color: C.textSub }]}>
                      {t("cardReversiblePairEditNote")}
                    </Text>
                  ) : null}
                </>
              )}

              {/* ERROR */}
              {error ? (
                <View
                  style={[
                    styles.errorBox,
                    {
                      backgroundColor: C.isDark ? 'rgba(220,38,38,0.12)' : '#fef2f2',
                      borderColor: C.isDark ? 'rgba(248,113,113,0.35)' : '#fecaca',
                    },
                  ]}
                >
                  <Feather name="alert-circle" size={15} color="#dc2626" />
                  <Text style={styles.errorTxt}>{error}</Text>
                </View>
              ) : null}
            </View>

            {/* ── BUTTONS ── */}
            <View style={styles.previewActionWrap}>
              <TouchableOpacity
                style={[
                  styles.btnPreviewStudy,
                  {
                    backgroundColor: C.surface,
                    borderColor: isValid ? C.tint : C.border,
                  },
                  !isValid && styles.btnPreviewStudyOff,
                ]}
                onPress={() => {
                  setStudyPreviewPairSlot(1);
                  setStudyPreviewShowBack(false);
                  setStudyPreviewOpen(true);
                }}
                disabled={!isValid}
                activeOpacity={0.85}
              >
                <Feather
                  name="eye"
                  size={18}
                  color={isValid ? C.tint : C.placeholder}
                />
                <Text
                  style={[
                    styles.btnPreviewStudyTxt,
                    { color: isValid ? C.tint : C.placeholder },
                  ]}
                >
                  {t("addCardPreviewStudy")}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.btnCancel, { backgroundColor: C.surface, borderColor: C.border }]}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnCancelTxt, { color: C.textSub }]}>{t("cancel")}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btnSave,
                  (!canSave || isSaving) && styles.btnSaveOff,
                  canSave && styles.btnSaveActive,
                ]}
                onPress={handleSave}
                disabled={!canSave || isSaving}
                activeOpacity={0.85}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Feather name="check" size={18} color="#fff" />
                    <Text style={styles.btnSaveTxt}>
                      {isEdit ? t("update") : t("save")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={studyPreviewOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setStudyPreviewOpen(false)}
      >
        <View style={styles.studyPreviewRoot}>
          <TouchableOpacity
            style={styles.studyPreviewBackdrop}
            activeOpacity={1}
            onPress={() => setStudyPreviewOpen(false)}
          />
          <View style={styles.studyPreviewCenter}>
            <View style={[styles.studyPreviewSheet, { backgroundColor: C.surface }]}>
            <View style={[styles.studyPreviewHeader, { borderBottomColor: C.borderLight }]}>
              <Text style={[styles.studyPreviewTitle, { color: C.text }]}>{t("addCardPreviewTitle")}</Text>
              <Pressable
                hitSlop={12}
                onPress={() => setStudyPreviewOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t("addCardPreviewClose")}
              >
                <Feather name="x" size={22} color={C.textSub} />
              </Pressable>
            </View>
            {showPairStudySwitcher ? (
              <View style={styles.studyPreviewPairRow}>
                <Pressable
                  onPress={() => {
                    setStudyPreviewPairSlot(1);
                    setStudyPreviewShowBack(false);
                  }}
                  style={[
                    styles.studyPreviewPairChip,
                    { backgroundColor: C.inputBg, borderColor: C.inputBorder },
                    studyPreviewPairSlot === 1 && {
                      borderColor: C.tint,
                      backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#eff1ff',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.studyPreviewPairChipTxt,
                      { color: C.textSub },
                      studyPreviewPairSlot === 1 && { color: C.tint, fontWeight: '700' as const },
                    ]}
                  >
                    {t("addCardPreviewPair1")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setStudyPreviewPairSlot(2);
                    setStudyPreviewShowBack(false);
                  }}
                  style={[
                    styles.studyPreviewPairChip,
                    { backgroundColor: C.inputBg, borderColor: C.inputBorder },
                    studyPreviewPairSlot === 2 && {
                      borderColor: C.tint,
                      backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#eff1ff',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.studyPreviewPairChipTxt,
                      { color: C.textSub },
                      studyPreviewPairSlot === 2 && { color: C.tint, fontWeight: '700' as const },
                    ]}
                  >
                    {t("addCardPreviewPair2")}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.studyPreviewScrollInner}
            >
              <View
                style={[
                  styles.studyPreviewCard,
                  {
                    backgroundColor: C.isDark ? C.surfaceAlt : '#fff',
                    borderWidth: C.isDark ? 1 : 0,
                    borderColor: C.border,
                  },
                ]}
              >
                <View style={styles.studyPreviewCardInner}>
                  {cardType === "cloze" &&
                  hasAnyClozeFormContent(
                    buildCardFormFields("", "", notes, clozePartsPreview, mediaForm),
                  ) ? (
                    <>
                      <Pressable
                        onPress={() => setStudyPreviewShowBack((v) => !v)}
                        style={styles.studyPreviewFlipZone}
                        accessibilityRole="button"
                      >
                        {!studyPreviewShowBack ? (
                          <AddCardStudyClozeFront parts={clozePartsPreview} />
                        ) : (
                          <AddCardStudyClozeBack parts={clozePartsPreview} />
                        )}
                        {!studyPreviewShowBack && notes.trim() ? (
                          <Text style={[styles.studyPreviewNotes, { color: C.textSub }]}>
                            {notes.trim()}
                          </Text>
                        ) : null}
                      </Pressable>
                      {renderPreviewMedia(
                        studyPreviewShowBack ? backPreviewMedia : frontPreviewMedia,
                      )}
                      {!studyPreviewShowBack ? (
                        <Pressable
                          onPress={() => setStudyPreviewShowBack(true)}
                          style={styles.studyPreviewTapHintZone}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.studyPreviewTapHint, { color: C.textMuted }]}>
                            {t("showAnswer")}
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : cardType === "basic" ? (
                    <>
                      <Pressable
                        onPress={() => setStudyPreviewShowBack((v) => !v)}
                        style={styles.studyPreviewFlipZone}
                        accessibilityRole="button"
                      >
                        {studyPreviewPairSlot === 1 ? (
                          <Text style={[styles.studyPreviewCardTitle, { color: C.text }]}>
                            {studyPreviewShowBack ? backText.trim() : frontText.trim()}
                          </Text>
                        ) : (
                          <Text style={[styles.studyPreviewCardTitle, { color: C.text }]}>
                            {studyPreviewShowBack ? frontText.trim() : backText.trim()}
                          </Text>
                        )}
                        {!studyPreviewShowBack && notes.trim() ? (
                          <Text style={[styles.studyPreviewNotes, { color: C.textSub }]}>
                            {notes.trim()}
                          </Text>
                        ) : null}
                      </Pressable>
                      {renderPreviewMedia(
                        studyPreviewShowBack
                          ? studyPreviewPairSlot === 1
                            ? backPreviewMedia
                            : frontPreviewMedia
                          : studyPreviewPairSlot === 1
                            ? frontPreviewMedia
                            : backPreviewMedia,
                      )}
                      {!studyPreviewShowBack ? (
                        <Pressable
                          onPress={() => setStudyPreviewShowBack(true)}
                          style={styles.studyPreviewTapHintZone}
                          accessibilityRole="button"
                        >
                          <Text style={[styles.studyPreviewTapHint, { color: C.textMuted }]}>
                            {t("showAnswer")}
                          </Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : (
                    <Text style={[styles.studyPreviewCardTitle, { color: C.textSub }]}>
                      {t("addCardPreviewIncomplete")}
                    </Text>
                  )}
                </View>
              </View>
            </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      <AudioUploadModal
        visible={Boolean(audioUploadModal?.visible)}
        phase={audioUploadModal?.phase ?? "reading"}
        fileName={audioUploadModal?.fileName}
      />

      <ConfirmModal
        visible={Boolean(errorModal)}
        title={t("error")}
        message={errorModal ?? ""}
        confirmText={t("ok")}
        cancelText={null}
        onConfirm={() => setErrorModal(null)}
        onCancel={() => setErrorModal(null)}
      />
    </>
  );
}

const emptySnapshot: CardFormSnapshot = {
  frontText: "",
  backText: "",
  mediaForm: emptyCardMediaForm(),
  notes: "",
  cardType: "basic",
  pairMeta: {},
  clozeBefore: "",
  clozeGapFront: "",
  clozeHidden: "",
  clozeAfter: "",
};

function buildSnapshotFromCard(cardData: Card | null): CardFormSnapshot {
  const front = cardData?.front_text ?? "";
  const back = cardData?.back_text ?? "";
  const ct = normalizeCardType(cardData?.card_type);
  const extra = parseCardExtra(cardData?.card_extra);
  const base: CardFormSnapshot = {
    frontText: front,
    backText: ct === "cloze" ? "" : back,
    mediaForm: cardMediaRowsToForm(cardData?.card_media),
    notes: cardData?.notes ?? "",
    cardType: ct,
    pairMeta: extra.pairId ? { pairId: extra.pairId, pairRole: extra.pairRole } : {},
    clozeBefore: "",
    clozeGapFront: "",
    clozeHidden: "",
    clozeAfter: "",
  };
  if (ct === "cloze" && cardData) {
    const cp = getClozePartsFromCard(cardData);
    if (cp) {
      return {
        ...base,
        clozeBefore: cp.before,
        clozeGapFront: cp.gapFront,
        clozeHidden: clozeHiddenForEdit(cp.hidden),
        clozeAfter: cp.after,
      };
    }
  }
  return base;
}

export default function AddCardScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const deckId = Array.isArray(params.deckId)
    ? params.deckId[0]
    : typeof params.deckId === "string"
      ? params.deckId
      : null;
  const cardId = Array.isArray(params.cardId)
    ? params.cardId[0]
    : typeof params.cardId === "string"
      ? params.cardId
      : null;
  const { t } = useLanguage();
  const { user } = useAuth();
  const C = useAppColors();
  const formSideBySide = useFormSideBySide();
  const isEdit = Boolean(cardId);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEdit ? t("editCard") : t("addCard"),
    });
  }, [navigation, isEdit, t]);

  const [deck, setDeck] = useState<Deck | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CardFormSnapshot>(emptySnapshot);

  useEffect(() => {
    if (!deckId) {
      setLoadErrorKey("deckNotFound");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadErrorKey(null);

    const loadDeckAndCard = async () => {
      const [
        { data: deckData, error: deckError },
        { data: cardData, error: cardError },
      ] = await Promise.all([
        supabase.from("decks").select("*").eq("deck_id", deckId).single(),
        cardId
          ? supabase.from("cards").select("*, card_media(*)").eq("card_id", cardId).single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (cancelled) return;

      if (deckError || cardError) {
        setLoadErrorKey("failedToLoadData");
      } else {
        setDeck(deckData as Deck);
        setSnapshot(buildSnapshotFromCard(cardData as Card | null));
      }
      setIsLoading(false);
    };

    void loadDeckAndCard();
    return () => {
      cancelled = true;
    };
  }, [deckId, cardId]);

  if (isLoading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  if (!deck || !deckId) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: C.bg }]}>
        <Text style={{ color: C.textSub, marginBottom: 16 }}>
          {loadErrorKey ? t(loadErrorKey) : t("deckNotFound")}
        </Text>
        <TouchableOpacity
          style={[styles.btnCancel, { backgroundColor: C.surface, borderColor: C.border }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.btnCancelTxt, { color: C.textSub }]}>{t("goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <CardEditorForm
      key={cardId ?? `new-${deckId}`}
      deck={deck}
      deckId={deckId}
      cardId={cardId}
      userId={user?.id ?? null}
      isEdit={isEdit}
      formSideBySide={formSideBySide}
      snapshot={snapshot}
    />
  );
}

/* ─── HELPER SUB-COMPONENTS ─── */
function CardSideColumnHeader({
  title,
  balanced,
  right,
}: {
  title: string;
  balanced?: boolean;
  right?: ReactNode;
}) {
  const C = useAppColors();
  return (
    <View style={[styles.basicSideHeaderRow, balanced && styles.basicSideHeaderRowBalanced]}>
      <Text style={[styles.basicSideHeading, { color: C.text }]}>{title}</Text>
      {right ?? (balanced ? <View style={styles.basicSideHeaderSpacer} /> : null)}
    </View>
  );
}

function CardNotesField({
  notes,
  onChangeNotes,
  t,
}: {
  notes: string;
  onChangeNotes: (v: string) => void;
  t: (k: string) => string;
}) {
  const C = useAppColors();
  return (
    <Field label={t("notes")}>
      <Text style={[styles.notesFrontHint, { color: C.textMuted }]}>{t("notesFrontHint")}</Text>
      <FormTextInputRow
        icon="file-text"
        value={notes}
        onChangeText={onChangeNotes}
        placeholder={t("notesPlaceholder")}
        multiline
        inputStyle={styles.inputNotes}
      />
    </Field>
  );
}

function Field({
  label,
  required,
  hideLabel,
  labelRight,
  style,
  children,
}: {
  label?: string;
  required?: boolean;
  hideLabel?: boolean;
  labelRight?: React.ReactNode;
  style?: object;
  children: React.ReactNode;
}) {
  const C = useAppColors();
  return (
    <View style={[{ gap: 7 }, style]}>
      {!hideLabel ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[styles.fieldLabel, { color: C.textSub }]}>
            {label}
            {required && <Text style={{ color: "#ef4444" }}> *</Text>}
          </Text>
          {labelRight}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/* ─── STYLES ─── */
const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  scrollOuter: {
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 16,
    paddingBottom: 36,
  },
  formContainer: {
    width: "100%",
    maxWidth: 860,
    paddingHorizontal: 16,
    gap: 14,
  },
  scroll: {
    padding: 16,
    paddingBottom: 36,
    gap: 14,
  },

  /* HERO */
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  heroBadge: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#eff1ff",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: "700",
    color: "#111827",
  },
  heroSub: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },

  /* CARD */
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    gap: 16,
    shadowColor: "#4255ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },

  /* DIVIDER */
  divider: {
    height: 1,
    backgroundColor: "#f0f1f5",
    marginVertical: 2,
  },

  /* FIELD */
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },

  aiLabelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: "58%",
    flexShrink: 1,
  },
  aiLabelBtnTxt: {
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 1,
  },

  /* INPUT ROW */
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#f7f8fb",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e8eaee",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  inputRowMulti: {
    alignItems: "flex-start",
    paddingVertical: 12,
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
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  inputMulti: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  inputNotes: {
    minHeight: 60,
    textAlignVertical: "top",
  },
  notesFrontHint: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: -2,
  },

  /* ERROR */
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorTxt: {
    flex: 1,
    color: "#dc2626",
    fontSize: 13,
  },

  /* BUTTONS */
  buttons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  btnCancel: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#e2e4ec",
  },
  btnCancelTxt: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6b7280",
  },
  btnSave: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#64B5F6",
    opacity: 0.6,
    elevation: 0,
  },
  btnSaveActive: {
    backgroundColor: "#4255ff",
    opacity: 1,
    shadowColor: "#4255ff",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  btnSaveOff: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnSaveTxt: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
  previewActionWrap: {
    width: "100%",
    marginTop: 4,
  },
  btnPreviewStudy: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#4255ff",
  },
  btnPreviewStudyOff: {
    borderColor: "#e2e4ec",
    opacity: 0.85,
  },
  btnPreviewStudyTxt: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4255ff",
  },
  btnPreviewStudyTxtOff: {
    color: "#c4cbd8",
  },
  studyPreviewRoot: {
    flex: 1,
    backgroundColor: "transparent",
  },
  studyPreviewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  studyPreviewCenter: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
    zIndex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  studyPreviewSheet: {
    backgroundColor: "#fff",
    borderRadius: 20,
    maxHeight: "88%",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  studyPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  studyPreviewTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  studyPreviewPairRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  studyPreviewPairChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#f7f8fb",
    borderWidth: 1.5,
    borderColor: "#e8eaee",
    alignItems: "center",
  },
  studyPreviewPairChipOn: {
    borderColor: "#4255ff",
    backgroundColor: "#eff1ff",
  },
  studyPreviewPairChipTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textAlign: "center",
  },
  studyPreviewPairChipTxtOn: {
    color: "#4255ff",
  },
  studyPreviewScrollInner: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  studyPreviewCard: {
    width: "100%",
    minHeight: 160,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    justifyContent: "flex-start",
    alignItems: "stretch",
    borderLeftWidth: 6,
    borderLeftColor: "#66BB6A",
  },
  studyPreviewCardInner: {
    width: "100%",
    alignItems: "stretch",
    gap: 12,
  },
  studyPreviewFlipZone: {
    width: "100%",
    alignItems: "stretch",
  },
  studyPreviewCardTitle: {
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 30,
    textAlign: "center",
    width: "100%",
    marginBottom: 4,
  },
  studyPreviewNotes: {
    fontSize: 15,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
  },
  studyPreviewTapHint: {
    fontSize: 14,
    textAlign: "center",
    width: "100%",
  },
  studyPreviewTapHintZone: {
    width: "100%",
    alignItems: "stretch",
    marginTop: 4,
    paddingVertical: 8,
  },

  typeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#f7f8fb",
    borderWidth: 1.5,
    borderColor: "#e8eaee",
  },
  typeChipOn: {
    borderColor: "#4255ff",
    backgroundColor: "#eff1ff",
  },
  typeChipTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
  },
  typeChipTxtOn: {
    color: "#4255ff",
  },
  formIntro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  inputClozeCompact: {
    minHeight: 44,
    textAlignVertical: "top",
  },
  inputClozeGap: {
    minHeight: 52,
    textAlignVertical: "top",
  },
  inputClozeGapHint: {
    fontStyle: "italic",
    fontWeight: "500",
  },
  inputClozeHidden: {
    fontWeight: "600",
  },
  revToggle: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  revToggleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  revToggleHint: {
    fontSize: 12,
    color: "#9ca3af",
    lineHeight: 17,
  },
  revEditHint: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 17,
    marginTop: 4,
  },
  basicSidesRow: {
    width: "100%",
  },
  basicSidesRowHorizontal: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 0,
  },
  basicSidesRowStacked: {
    flexDirection: "column",
    gap: 0,
  },
  basicSidesDivider: {
    width: 1,
    alignSelf: "stretch",
    flexShrink: 0,
  },
  basicSideCol: {
    minWidth: 0,
    width: "100%",
    gap: 14,
    alignSelf: "stretch",
    flexShrink: 0,
  },
  basicSideColFlex: {
    flex: 1,
  },
  basicSideColStackedNext: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  basicSideColLeft: {
    paddingRight: 14,
  },
  basicSideColRight: {
    paddingLeft: 14,
  },
  basicSideHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  basicSideHeaderRowBalanced: {
    minHeight: 34,
  },
  basicSideHeaderSpacer: {
    width: 108,
    flexShrink: 0,
  },
  inputRowFill: {
    flex: 1,
    alignSelf: "stretch",
    minHeight: 120,
  },
  inputMultiFill: {
    flex: 1,
    minHeight: 96,
    textAlignVertical: "top",
  },
  basicSideHeading: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
    flexShrink: 1,
  },
});
