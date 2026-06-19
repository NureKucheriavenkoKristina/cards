import { CardSideMedia } from "@/src/components/CardSideMedia";
import { useAuth } from "@/src/contexts/AuthContext";
import { useLanguage } from "@/src/contexts/LanguageContext";
import { useStudySettings } from "@/src/contexts/StudySettingsContext";
import {
    CLOZE_GAP_MARKER,
    getClozePartsFromCard,
    isClozeGapComplete,
    normalizeCardType,
    type ClozeParts,
} from "@/src/lib/cardModel";
import { getCardMediaForSide } from "@/src/lib/cardMedia";
import { formatScheduleLabel } from "@/src/lib/formatScheduleLabel";
import { loadDueCardsForDeck, type DueCard } from "@/src/lib/reviewQueue";
import {
    submitCardReviewInvoke,
    type SubmitCardReviewRating,
} from "@/src/lib/submitCardReview";
import { supabase } from "@/src/lib/supabase";
import { scheduleAfterAnswer } from "@cardly/srs/cardScheduling";
import {
    applyRatingToProgressRow,
    appSettingsRowToGlobal,
    delayDaysForReview,
    progressRowToSnapshot,
} from "@cardly/srs/dbMapping";
import type { AppSpacedRepetitionSettingsRow } from "@cardly/srs/dbTypes";
import Feather from "@expo/vector-icons/Feather";
import { useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppColors } from "@/src/contexts/ThemeContext";

const RATINGS: SubmitCardReviewRating[] = ["again", "hard", "good", "easy"];

function ClozeFrontParts({
  parts,
  gapLabel,
}: {
  parts: ClozeParts;
  gapLabel: string;
}) {
  const C = useAppColors();
  const gap =
    parts.gapFront.trim().length > 0 ? (
      <Text style={[clozeTextStyles.gapHint, { color: C.textSub }]}>
        {" "}
        {parts.gapFront.trim()}{" "}
      </Text>
    ) : (
      <Text style={[clozeTextStyles.gap, { color: C.textMuted }]}> {gapLabel} </Text>
    );
  return (
    <Text style={[clozeTextStyles.title, { color: C.text }]}>
      {parts.before}
      {gap}
      {parts.after}
    </Text>
  );
}

function ClozeBackParts({ parts }: { parts: ClozeParts }) {
  const C = useAppColors();
  return (
    <Text style={[clozeTextStyles.title, { color: C.text }]}>
      {parts.before}
      <Text style={clozeTextStyles.answer}>{parts.hidden}</Text>
      {parts.after}
    </Text>
  );
}

const clozeTextStyles = StyleSheet.create({
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
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

/** Same-session learning: show card again before this many seconds elapse (intraday queue). */
const SESSION_REQUEUE_MAX_SECONDS = 20 * 60;

type ApiSubmitOutcome = {
  phase: string;
  learning_step_index: number;
  interval_days: number;
  due_in_seconds_from_now: number | null;
  ease_permille: number;
};

function shouldRequeueInSession(
  outcome: ApiSubmitOutcome | undefined,
): boolean {
  const s = outcome?.due_in_seconds_from_now;
  if (s == null || s <= 0) return false;
  return s <= SESSION_REQUEUE_MAX_SECONDS;
}

export default function DeckStudyScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const deckId = typeof params.id === "string" ? params.id : null;
  const todayParam = params.today;
  const todayStr = Array.isArray(todayParam) ? todayParam[0] : todayParam;
  const includeScheduledToday = todayStr === "1" || todayStr === "true";
  const { t } = useLanguage();
  const { user } = useAuth();
  const { settings: studySettings } = useStudySettings();
  const C = useAppColors();

  const [queue, setQueue] = useState<DueCard[]>([]);
  const [settings, setSettings] =
    useState<AppSpacedRepetitionSettingsRow | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionComplete, setSessionComplete] = useState(false);
  /** Prevents double-submit before the next frame (optimistic queue updates immediately). */
  const rateLockRef = useRef(false);

  const loadSession = useCallback(async () => {
    if (!deckId || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: settingsData, error: settingsError }, dueList] = await Promise.all([
      supabase
        .from("app_spaced_repetition_settings")
        .select("*")
        .eq("id", 1)
        .single(),
      loadDueCardsForDeck(deckId, {
        includeScheduledToday,
        srsDayStartHour: studySettings.srsDayStartHour,
      }),
    ]);

    if (settingsError || !settingsData) {
      Alert.alert(t("error"), "SRS settings not found. Apply DB migrations.");
      setSettings(null);
    } else {
      setSettings(settingsData as AppSpacedRepetitionSettingsRow);
    }

    setQueue(dueList);
    setShowBack(false);
    setSessionComplete(false);
    setLoading(false);
  }, [
    deckId,
    user?.id,
    t,
    includeScheduledToday,
    studySettings.srsDayStartHour,
  ]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: includeScheduledToday ? t("deckReviewCardsTitle") : t("studying"),
    });
  }, [navigation, t, includeScheduledToday]);

  const current = queue[0] ?? null;
  const total = queue.length;

  const intervalLabels = useMemo(() => {
    if (!showBack || !current || !settings) return null;
    const snapshot = progressRowToSnapshot(current.progress);
    const global = appSettingsRowToGlobal(settings);
    const delay = delayDaysForReview(current.progress.due_date, new Date());
    const out: Record<SubmitCardReviewRating, string> = {
      again: "",
      hard: "",
      good: "",
      easy: "",
    };
    for (const r of RATINGS) {
      const o = scheduleAfterAnswer(snapshot, r, delay, global);
      out[r] = formatScheduleLabel(o);
    }
    return out;
  }, [showBack, current, settings]);

  const handleRate = (rating: SubmitCardReviewRating) => {
    if (!current || !user?.id || !settings) return;
    if (rateLockRef.current) return;
    rateLockRef.current = true;

    const card = current.card;
    const cardId = card.card_id;

    const { progress: optimisticProgress, outcome } = applyRatingToProgressRow(
      current.progress,
      rating,
      settings,
    );

    const apiOutcome: ApiSubmitOutcome = {
      phase: outcome.phase,
      learning_step_index: outcome.learningStepIndex,
      interval_days: outcome.intervalDays,
      due_in_seconds_from_now: outcome.dueInSecondsFromNow,
      ease_permille: outcome.easePermille,
    };
    const requeue = shouldRequeueInSession(apiOutcome);

    setQueue((q) => {
      const [, ...rest] = q;
      if (requeue) {
        return [...rest, { card, progress: optimisticProgress }];
      }
      const next = rest;
      if (next.length === 0) setSessionComplete(true);
      return next;
    });
    setShowBack(false);

    queueMicrotask(() => {
      rateLockRef.current = false;
    });

    void submitCardReviewInvoke(cardId, rating, deckId ?? undefined).then((result) => {
      if (result.error) {
        Alert.alert(t("error"), result.error.message ?? "Request failed");
        loadSession();
      }
    });
  };

  const handleCardPress = () => {
    setShowBack((prev) => !prev);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: C.bg }]}>
        <Text style={[styles.loadingText, { color: C.textSub }]}>{t("loadingDeck")}</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: C.bg }]}>
        <Text style={[styles.emptyText, { color: C.textSub }]}>{t("mustBeLoggedInStudy")}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (queue.length === 0 && !sessionComplete) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom + 16, backgroundColor: C.bg }]}>
        <Text style={[styles.emptyText, { color: C.textSub }]}>{t("noCardsToReview")}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (sessionComplete) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom + 16, backgroundColor: C.bg }]}>
        <View style={[styles.completeCard, { backgroundColor: C.surface }]}>
          <Feather name="check-circle" size={64} color="#66BB6A" />
          <Text style={[styles.completeTitle, { color: C.text }]}>{t("reviewComplete")}</Text>
        </View>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>{t("goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentCard = current.card;
  const cardCounterText = t("cardXOfY")
    .replace("{current}", "1")
    .replace("{total}", String(total));

  const ctype = normalizeCardType(currentCard.card_type);
  const clozeParts = getClozePartsFromCard(currentCard);
  const clozeOk =
    ctype === "cloze" && clozeParts && isClozeGapComplete(clozeParts);
  const frontMedia = getCardMediaForSide(currentCard, "front");
  const backMedia = getCardMediaForSide(currentCard, "back");
  const visibleMedia = showBack ? backMedia : frontMedia;

  return (
    <View style={[styles.root, { backgroundColor: C.bg, paddingTop: insets.top, paddingBottom: insets.bottom + 8 }]}>
      <Text style={[styles.counter, { color: C.textSub }]}>{cardCounterText}</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={[styles.card, { backgroundColor: C.surface }]} onPress={handleCardPress} activeOpacity={1}>
          <View style={styles.cardInner}>
            {clozeOk ? (
              <>
                {!showBack ? (
                  <ClozeFrontParts
                    parts={clozeParts}
                    gapLabel={t("clozeGapMarker") || CLOZE_GAP_MARKER}
                  />
                ) : null}
                {showBack ? <ClozeBackParts parts={clozeParts} /> : null}
                {visibleMedia.map((item) => (
                  <CardSideMedia key={item.media_id} url={item.url} kind={item.media_type} />
                ))}
              </>
            ) : (
              <>
                <Text style={[styles.cardTitle, { color: C.text }]}>
                  {showBack ? currentCard.back_text : currentCard.front_text}
                </Text>
                {visibleMedia.map((item) => (
                  <CardSideMedia key={item.media_id} url={item.url} kind={item.media_type} />
                ))}
              </>
            )}
            {!showBack && currentCard.notes ? (
              <Text style={[styles.cardNotes, { color: C.textSub }]}>{currentCard.notes}</Text>
            ) : null}
            {!showBack && <Text style={[styles.hint, { color: C.textMuted }]}>{t("showAnswer")}</Text>}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {showBack ? (
        <View style={styles.ratingButtons}>
          {RATINGS.map((rating) => (
            <Pressable
              key={rating}
              style={({ pressed }) => [
                styles.ratingBtn,
                rating === "again"
                  ? styles.btn_again
                  : rating === "hard"
                    ? styles.btn_hard
                    : rating === "good"
                      ? styles.btn_good
                      : styles.btn_easy,
                pressed && styles.ratingPressed,
              ]}
              onPress={() => handleRate(rating)}
            >
              <Text style={styles.ratingBtnText}>{t(rating)}</Text>
              {intervalLabels ? (
                <Text style={styles.intervalHint}>
                  {intervalLabels[rating]}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 16,
  },
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollInner: {
    paddingBottom: 16,
  },
  loadingText: {
    fontSize: 18,
    color: "#6b7280",
  },
  emptyText: {
    fontSize: 18,
    color: "#4b5563",
    textAlign: "center",
    marginBottom: 24,
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#4255ff",
    borderRadius: 12,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  completeCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    marginBottom: 24,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  completeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
    marginTop: 16,
  },
  counter: {
    alignSelf: "center",
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
  },
  card: {
    width: "100%",
    minHeight: 200,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    borderLeftWidth: 6,
    borderLeftColor: "#66BB6A",
  },
  cardInner: {
    alignItems: "center",
    width: "100%",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  cardNotes: {
    fontSize: 15,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
  },
  hint: {
    fontSize: 14,
    marginTop: 16,
  },
  ratingButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    width: "100%",
    justifyContent: "space-between",
  },
  ratingBtn: {
    flexGrow: 1,
    flexBasis: "22%",
    minWidth: 72,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: "center",
  },
  ratingPressed: {
    opacity: 0.85,
  },
  btn_again: {
    backgroundColor: "#ef4444",
  },
  btn_hard: {
    backgroundColor: "#f59e0b",
  },
  btn_good: {
    backgroundColor: "#22c55e",
  },
  btn_easy: {
    backgroundColor: "#3b82f6",
  },
  ratingBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  intervalHint: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 4,
  },
});
