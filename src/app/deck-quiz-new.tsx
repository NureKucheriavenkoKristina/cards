import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import type { Card } from "@/assets/data/cards";
import ConfirmModal from "@/src/components/ConfirmModal";
import { DeckCardListToolbar } from "@/src/components/DeckCardListToolbar";
import {
  DeckQuizIntro,
  DeckQuizScreenShell,
} from "@/src/components/DeckQuizLayout";
import { useAuth } from "@/src/contexts/AuthContext";
import { useLanguage } from "@/src/contexts/LanguageContext";
import { useStudySettings } from "@/src/contexts/StudySettingsContext";
import { useAppColors } from "@/src/contexts/ThemeContext";
import type { UserCardProgress } from "@/src/lib/userCardProgress";
import {
  fetchProgressMapForCardIds,
  hasActiveDeckCardQuery,
  queryDeckCards,
  type CardListFilter,
  type CardListSort,
} from "@/src/lib/deckCardListQuery";
import {
  cardHasQuizSides,
  createDeckQuizFromSelection,
  fetchDeckCardsForQuiz,
  getQuizPrompt,
  QUIZ_MIN_CARDS,
  QUIZ_PRESET_COUNTS,
  type DeckQuizSource,
} from "@/src/lib/deckQuiz";
type Mode = "preset" | "manual";

const PRESET_KEYS = ["preset_10", "preset_20", "preset_30"] as const;

export default function DeckQuizNewScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ id?: string }>();
  const deckId =
    typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;

  const { user } = useAuth();
  const { t } = useLanguage();
  const C = useAppColors();
  const { settings: studySettings } = useStudySettings();

  const [mode, setMode] = useState<Mode>("preset");
  const [preset, setPreset] = useState<Exclude<DeckQuizSource, "manual">>("preset_10");
  const [cards, setCards] = useState<Card[]>([]);
  const [totalInDeck, setTotalInDeck] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [cardFilter, setCardFilter] = useState<CardListFilter>("all");
  const [cardSort, setCardSort] = useState<CardListSort>("newest");
  const [progressMap, setProgressMap] = useState<Map<string, UserCardProgress>>(new Map());
  const [loadingCards, setLoadingCards] = useState(true);
  const [creating, setCreating] = useState(false);
  const [eligibleInfoOpen, setEligibleInfoOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t("deckTakeTest") });
  }, [navigation, t]);

  useEffect(() => {
    if (!deckId) return;
    let cancelled = false;
    (async () => {
      setLoadingCards(true);
      try {
        const list = await fetchDeckCardsForQuiz(deckId);
        const quizCards = list.filter(cardHasQuizSides);
        if (!cancelled) {
          setTotalInDeck(list.length);
          setCards(quizCards);
        }
        if (!cancelled && user?.id && quizCards.length > 0) {
          const map = await fetchProgressMapForCardIds(
            user.id,
            quizCards.map((c) => c.card_id),
          );
          if (!cancelled) setProgressMap(map);
        } else if (!cancelled) {
          setProgressMap(new Map());
        }
      } catch (e) {
        if (!cancelled) {
          Alert.alert(t("error"), e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingCards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, t, user?.id]);

  const displayedCards = useMemo(
    () =>
      queryDeckCards(cards, {
        search,
        filter: cardFilter,
        sort: cardSort,
        progressMap,
        srsDayStartHour: studySettings.srsDayStartHour,
      }),
    [cards, search, cardFilter, cardSort, progressMap, studySettings.srsDayStartHour],
  );

  const hasActiveQuery = hasActiveDeckCardQuery(search, cardFilter, cardSort);

  const clearCardQuery = useCallback(() => {
    setSearch("");
    setCardFilter("all");
    setCardSort("newest");
  }, []);

  const eligibleInfoMessage = useMemo(
    () =>
      t("deckQuizEligibleInfoBody")
        .replace("{eligible}", String(cards.length))
        .replace("{total}", String(totalInDeck)),
    [cards.length, totalInDeck, t],
  );

  const toggleCard = useCallback((cardId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const selectAllVisible = () => {
    setSelected(new Set(displayedCards.map((c) => c.card_id)));
  };

  const clearSelection = () => setSelected(new Set());

  const canCreate =
    mode === "preset" || (selected.size >= QUIZ_MIN_CARDS && !loadingCards);

  const handleCreate = async () => {
    if (!deckId || !user?.id) return;
    const source: DeckQuizSource = mode === "manual" ? "manual" : preset;
    if (mode === "manual" && selected.size < QUIZ_MIN_CARDS) {
      Alert.alert(
        t("error"),
        t("deckQuizNeedMinCards").replace("{n}", String(QUIZ_MIN_CARDS)),
      );
      return;
    }

    setCreating(true);
    try {
      const result = await createDeckQuizFromSelection({
        deckId,
        userId: user.id,
        source,
        selectedCardIds: mode === "manual" ? [...selected] : [],
        allCards: cards,
        t,
      });

      if (!result.ok) {
        const msg = t(result.errorKey);
        Alert.alert(
          t("error"),
          result.errorKey === "deckQuizNeedMinCards"
            ? msg.replace("{n}", String(QUIZ_MIN_CARDS))
            : msg,
        );
        return;
      }

      router.replace({
        pathname: "/deck-quiz-play",
        params: { sessionId: result.quiz.sessionId, deckId },
      });
    } catch (e) {
      Alert.alert(t("error"), e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  if (!deckId) {
    return (
      <DeckQuizScreenShell scroll={false} centerVertically>
        <Text style={{ color: C.textSub, textAlign: "center" }}>{t("deckNotFound")}</Text>
      </DeckQuizScreenShell>
    );
  }

  if (!user) {
    return (
      <DeckQuizScreenShell scroll={false} centerVertically>
        <DeckQuizIntro
          title={t("deckTakeTest")}
          subtitle={t("deckQuizIntro").replace("{n}", String(QUIZ_MIN_CARDS))}
        />
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: C.tint }]}
          onPress={() => router.push("/auth/login")}
        >
          <Text style={styles.primaryBtnTxt}>{t("signIn")}</Text>
        </TouchableOpacity>
      </DeckQuizScreenShell>
    );
  }

  const footer = (
    <TouchableOpacity
      style={[
        styles.primaryBtn,
        { backgroundColor: C.tint, opacity: creating || !canCreate ? 0.55 : 1 },
      ]}
      onPress={() => void handleCreate()}
      disabled={creating || !canCreate}
    >
      {creating ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <Feather name="play" size={20} color="#fff" />
          <Text style={styles.primaryBtnTxt}>{t("deckQuizStart")}</Text>
        </>
      )}
    </TouchableOpacity>
  );

  return (
    <>
    <DeckQuizScreenShell footer={footer}>
      <DeckQuizIntro
        title={t("deckTakeTest")}
        subtitle={t("deckQuizIntro").replace("{n}", String(QUIZ_MIN_CARDS))}
      />

      <Text style={[styles.sectionLabel, { color: C.textSub }]}>{t("deckQuizPickMode")}</Text>
      <View style={[styles.modeRow, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
        <Pressable
          style={[styles.modeChip, mode === "preset" && { backgroundColor: C.tint }]}
          onPress={() => setMode("preset")}
        >
          <Feather name="zap" size={16} color={mode === "preset" ? "#fff" : C.textSub} />
          <Text style={[styles.modeChipTxt, mode === "preset" && styles.modeChipTxtActive]}>
            {t("deckQuizPresetTitle")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, mode === "manual" && { backgroundColor: C.tint }]}
          onPress={() => setMode("manual")}
        >
          <Feather name="check-square" size={16} color={mode === "manual" ? "#fff" : C.textSub} />
          <Text style={[styles.modeChipTxt, mode === "manual" && styles.modeChipTxtActive]}>
            {t("deckQuizManualTitle")}
          </Text>
        </Pressable>
      </View>

      {mode === "preset" ? (
        <View style={styles.presetBlock}>
          <Text style={[styles.hint, { color: C.textSub }]}>{t("deckQuizPresetHint")}</Text>
          {PRESET_KEYS.map((key, i) => (
            <Pressable
              key={key}
              onPress={() => setPreset(key)}
              style={[
                styles.presetRow,
                {
                  backgroundColor: C.surface,
                  borderColor: preset === key ? C.tint : C.borderLight,
                  borderWidth: preset === key ? 2 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.presetBadge,
                  {
                    backgroundColor: preset === key ? C.tint : C.isDark ? C.border : "#f3f4f6",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.presetBadgeTxt,
                    { color: preset === key ? "#fff" : C.textSub },
                  ]}
                >
                  {i + 1}
                </Text>
              </View>
              <View style={styles.presetCopy}>
                <Text style={[styles.presetLabel, { color: C.text }]}>
                  {t(`deckQuizSource_${key}`)}
                </Text>
                <Text style={[styles.presetCount, { color: C.textSub }]}>
                  {QUIZ_PRESET_COUNTS[key]} {t("cards")}
                </Text>
              </View>
              <Feather
                name={preset === key ? "check-circle" : "circle"}
                size={22}
                color={preset === key ? C.tint : "#d1d5db"}
              />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.manualBlock}>
          <DeckCardListToolbar
            search={search}
            onSearchChange={setSearch}
            filter={cardFilter}
            onFilterChange={setCardFilter}
            sort={cardSort}
            onSortChange={setCardSort}
            showStudyFilters
            searchPlaceholder={t("searchCards")}
            t={t}
          />

          <View style={styles.shownRow} pointerEvents="box-none">
            <View style={styles.shownTextWrap}>
              <Text style={[styles.shownTxt, { color: C.textSub }]}>
                {hasActiveQuery || displayedCards.length !== cards.length
                  ? t("cardsShownOf")
                      .replace("{shown}", String(displayedCards.length))
                      .replace("{total}", String(cards.length))
                  : totalInDeck > cards.length
                    ? t("deckQuizCardsEligibleOf")
                        .replace("{eligible}", String(cards.length))
                        .replace("{total}", String(totalInDeck))
                    : t("deckQuizCardsTotal").replace("{n}", String(cards.length))}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setEligibleInfoOpen(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[
                styles.infoBtn,
                { borderColor: C.borderLight, backgroundColor: C.surface },
                Platform.OS === "web" && styles.infoBtnWeb,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("deckQuizEligibleInfoTitle")}
            >
              <Feather name="info" size={18} color={C.tint} />
            </TouchableOpacity>
          </View>

          <View style={styles.selectionBar}>
            <View style={[styles.countPill, { backgroundColor: C.isDark ? C.surface : "#f3f4f6" }]}>
              <Text style={[styles.countPillTxt, { color: C.text }]}>
                {t("deckQuizSelectedCount").replace("{n}", String(selected.size))}
              </Text>
            </View>
            <View style={styles.selectionActions}>
              <Pressable onPress={selectAllVisible} hitSlop={8}>
                <Text style={[styles.linkBtn, { color: C.tint }]}>{t("deckQuizSelectAll")}</Text>
              </Pressable>
              <Pressable onPress={clearSelection} hitSlop={8}>
                <Text style={[styles.linkBtn, { color: C.textSub }]}>{t("deckQuizClearSelection")}</Text>
              </Pressable>
            </View>
          </View>

          {loadingCards ? (
            <ActivityIndicator color={C.tint} style={{ marginVertical: 32 }} />
          ) : cards.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
              <Feather name="inbox" size={32} color={C.textSub} />
              <Text style={[styles.emptyTxt, { color: C.textSub }]}>{t("deckQuizEmptyCards")}</Text>
            </View>
          ) : displayedCards.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
              <Feather name="search" size={32} color={C.textSub} />
              <Text style={[styles.emptyTxt, { color: C.textSub }]}>{t("cardsNoResults")}</Text>
              <Pressable
                style={[styles.clearQueryBtn, { borderColor: C.tint, backgroundColor: C.isDark ? "rgba(99,102,241,0.12)" : "#eef0ff" }]}
                onPress={clearCardQuery}
              >
                <Text style={[styles.clearQueryTxt, { color: C.tint }]}>{t("cardsClearFilters")}</Text>
              </Pressable>
            </View>
          ) : (
            displayedCards.map((card) => {
              const on = selected.has(card.card_id);
              const prompt = getQuizPrompt(card) ?? "…";
              return (
                <Pressable
                  key={card.card_id}
                  onPress={() => toggleCard(card.card_id)}
                  style={[
                    styles.cardRow,
                    {
                      backgroundColor: on
                        ? C.isDark
                          ? "rgba(99,102,241,0.12)"
                          : "#f5f3ff"
                        : C.surface,
                      borderColor: on ? C.tint : C.borderLight,
                    },
                  ]}
                >
                  <Feather
                    name={on ? "check-square" : "square"}
                    size={22}
                    color={on ? C.tint : "#9ca3af"}
                  />
                  <Text style={[styles.cardPrompt, { color: C.text }]} numberOfLines={3}>
                    {prompt}
                  </Text>
                </Pressable>
              );
            })
          )}
        </View>
      )}
    </DeckQuizScreenShell>
    <ConfirmModal
      visible={eligibleInfoOpen}
      title={t("deckQuizEligibleInfoTitle")}
      message={eligibleInfoMessage}
      confirmText={t("ok")}
      cancelText={null}
      icon="info"
      onConfirm={() => setEligibleInfoOpen(false)}
      onCancel={() => setEligibleInfoOpen(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 14,
    width: "100%",
  },
  primaryBtnTxt: { color: "#fff", fontSize: 17, fontWeight: "700" },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  modeRow: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: 1,
    padding: 5,
    marginBottom: 20,
    gap: 6,
    width: "100%",
  },
  modeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  modeChipTxt: { fontSize: 14, fontWeight: "600", color: "#6b7280" },
  modeChipTxtActive: { color: "#fff" },
  presetBlock: { gap: 10, width: "100%" },
  hint: { fontSize: 14, lineHeight: 21, marginBottom: 4 },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 14,
    width: "100%",
  },
  presetBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  presetBadgeTxt: { fontSize: 15, fontWeight: "800" },
  presetCopy: { flex: 1 },
  presetLabel: { fontSize: 16, fontWeight: "600" },
  presetCount: { fontSize: 13, marginTop: 2 },
  manualBlock: { width: "100%" },
  shownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    width: "100%",
    zIndex: 2,
  },
  shownTextWrap: { flex: 1, minWidth: 0, marginRight: 4 },
  shownTxt: { fontSize: 13, fontWeight: "600" },
  infoBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    zIndex: 3,
    elevation: 2,
  },
  infoBtnWeb: {
    cursor: "pointer",
  } as const,
  clearQueryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 4,
  },
  clearQueryTxt: { fontSize: 14, fontWeight: "600" },
  selectionBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    flexWrap: "wrap",
    gap: 8,
  },
  countPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  countPillTxt: { fontSize: 14, fontWeight: "600" },
  selectionActions: { flexDirection: "row", gap: 16 },
  linkBtn: { fontSize: 14, fontWeight: "600" },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    width: "100%",
  },
  cardPrompt: { flex: 1, fontSize: 15, lineHeight: 22 },
  emptyBox: {
    alignItems: "center",
    padding: 32,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    width: "100%",
  },
  emptyTxt: { fontSize: 15, textAlign: "center", lineHeight: 22 },
});
