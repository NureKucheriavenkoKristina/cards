import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import React, { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Deck } from "@/assets/data/decks";
import DeckComplaintModal from "@/src/components/DeckComplaintModal";
import ListOfDecks from "@/src/components/ListOfDecks";
import { useAuth } from "@/src/contexts/AuthContext";
import { useLanguage } from "@/src/contexts/LanguageContext";
import { usePublicDecksData } from "@/src/hooks/usePublicDecksData";
import { compareDeckTitles } from "@/src/lib/deckSort";
import { useAppColors } from "@/src/contexts/ThemeContext";

type SortKey =
  | "newest"
  | "oldest"
  | "titleAsc"
  | "titleDesc"
  | "ratingAsc"
  | "ratingDesc"
  | "cards";

export type PublicDecksViewProps = {
  /** Гість: лише перегляд, без скарг і без виключення «своїх» колод. */
  forGuest: boolean;
};

export default function PublicDecksView({ forGuest }: PublicDecksViewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const C = useAppColors();

  const excludeCreatorId = forGuest ? undefined : user?.id;
  const { decks, cardCounts, ratingByDeckId, ratingCountByDeckId, loading, error, reload } =
    usePublicDecksData(excludeCreatorId);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [complaintDeck, setComplaintDeck] = useState<Deck | null>(null);

  const handlePressDeck = (deck: Deck) => {
    router.push(`/deck-detail?id=${deck.deck_id}`);
  };

  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      title: forGuest ? t("publicDecksGuestTitle") : t("publicDecks"),
    });
  }, [navigation, t, forGuest]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...decks]
      .filter((deck) => {
        if (!q) return true;
        return (
          (deck.title ?? "").toLowerCase().includes(q) ||
          (deck.description ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "oldest") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortBy === "titleAsc") {
          return compareDeckTitles(a, b);
        }
        if (sortBy === "titleDesc") {
          return compareDeckTitles(b, a);
        }
        if (sortBy === "ratingDesc" || sortBy === "ratingAsc") {
          const countA = ratingCountByDeckId[a.deck_id] ?? 0;
          const countB = ratingCountByDeckId[b.deck_id] ?? 0;
          const avgA = countA > 0 ? (ratingByDeckId[a.deck_id] ?? 0) : null;
          const avgB = countB > 0 ? (ratingByDeckId[b.deck_id] ?? 0) : null;
          if (avgA === null && avgB === null) {
            return compareDeckTitles(a, b);
          }
          if (avgA === null) return 1;
          if (avgB === null) return -1;
          const diff = sortBy === "ratingDesc" ? avgB - avgA : avgA - avgB;
          if (diff !== 0) {
            return diff > 0 ? 1 : -1;
          }
          return compareDeckTitles(a, b);
        }
        if (sortBy === "cards") {
          return (cardCounts[b.deck_id] ?? 0) - (cardCounts[a.deck_id] ?? 0);
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [decks, searchQuery, sortBy, cardCounts, ratingByDeckId, ratingCountByDeckId]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "newest", label: t("newest") },
    { key: "oldest", label: t("oldest") },
    { key: "titleAsc", label: t("sortTitleAZ") },
    { key: "titleDesc", label: t("sortTitleZA") },
    { key: "ratingDesc", label: t("sortRatingDesc") },
    { key: "ratingAsc", label: t("sortRatingAsc") },
    { key: "cards", label: t("sortCardsDesc") },
  ];

  const listHeader = (
    <>
      {forGuest ? (
        <View
          style={[
            styles.guestBanner,
            {
              backgroundColor: C.isDark ? "rgba(99,102,241,0.12)" : "#eef0ff",
              borderColor: C.isDark ? "rgba(165,180,252,0.35)" : "rgba(99,102,241,0.35)",
            },
          ]}
        >
          <Feather name="info" size={18} color={C.tint} style={styles.guestBannerIcon} />
          <Text style={[styles.guestBannerText, { color: C.textSub }]}>{t("publicDecksGuestHint")}</Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: C.text }]}>
          {forGuest ? t("publicDecksGuestTitle") : t("publicDecks")}
        </Text>
        <Text style={[styles.sectionCount, { color: C.textMuted }]}>
          {filtered.length} {filtered.length !== 1 ? t("decks") : t("deck")}
        </Text>
      </View>

      <View style={styles.controlsContainer}>
        <View
          style={[
            styles.searchContainer,
            { backgroundColor: C.inputBg, borderColor: C.inputBorder },
            searchFocused &&
              (C.isDark
                ? { borderColor: "#6366f1", backgroundColor: C.surface }
                : styles.searchContainerFocused),
          ]}
        >
          <Feather name="search" size={16} color={searchFocused ? C.tint : "#b0b8c8"} />
          <TextInput
            style={[styles.searchInput, { color: C.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("searchDecks")}
            placeholderTextColor={C.placeholder}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <Feather name="x-circle" size={16} color="#d1d5db" />
            </Pressable>
          )}
        </View>

        <View style={styles.controlBlock}>
          <Text style={[styles.chipsLabel, { color: C.textSub }]}>{t("sortBy")}</Text>
          <View style={styles.chipsRow}>
            {sortOptions.map(({ key, label }) => (
              <Pressable
                key={key}
                style={[
                  styles.chip,
                  { backgroundColor: C.surface, borderColor: C.border },
                  sortBy === key && {
                    borderColor: C.tint,
                    backgroundColor: C.isDark ? "rgba(165,180,252,0.15)" : "rgba(66,85,255,0.12)",
                  },
                ]}
                onPress={() => setSortBy(key)}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: C.textSub },
                    sortBy === key && { color: C.tint, fontWeight: "600" },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </>
  );

  const showReport = !forGuest && !!user?.id;

  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4255ff" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: C.textSub }]}>{error}</Text>
        </View>
      ) : decks.length === 0 ? (
        <View style={styles.emptyState}>
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: C.isDark ? "rgba(165,180,252,0.1)" : "rgba(66,85,255,0.08)" },
            ]}
          >
            <Feather name="globe" size={48} color={C.tint} />
          </View>
          <Text style={[styles.emptyTitle, { color: C.text }]}>{t("noPublicDecks")}</Text>
          <Text style={[styles.emptySubtitle, { color: C.textSub }]}>{t("noPublicDecksHint")}</Text>
        </View>
      ) : (
        <ListOfDecks
          decks={filtered}
          cardCounts={cardCounts}
          ratingByDeckId={ratingByDeckId}
          ratingCountByDeckId={ratingCountByDeckId}
          onPressDeck={handlePressDeck}
          readOnly
          onReportDeck={showReport ? (d) => setComplaintDeck(d) : undefined}
          listEmptyComponent={
            <View style={styles.searchEmpty}>
              <Text style={[styles.searchEmptyText, { color: C.textSub }]}>{t("noDecksFound")}</Text>
            </View>
          }
          listHeaderComponent={listHeader}
        />
      )}
      {showReport ? (
        <DeckComplaintModal
          visible={complaintDeck !== null}
          deck={complaintDeck}
          reporterId={user?.id ?? null}
          onClose={() => setComplaintDeck(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f7fb",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  errorText: {
    fontSize: 16,
    color: "#6b7280",
  },
  guestBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  guestBannerIcon: {
    marginTop: 1,
  },
  guestBannerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
  },
  sectionCount: {
    fontSize: 13,
    color: "#9ca3af",
  },
  controlsContainer: {
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 10,
  },
  searchContainer: {
    height: 46,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: "#e8eaee",
    backgroundColor: "#f7f8fb",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchContainerFocused: {
    borderColor: "#1a1a1a",
    backgroundColor: "#fff",
    shadowColor: "#1a1a1a",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 0,
    // @ts-ignore — web-only
    outlineWidth: 0,
    outlineStyle: "none",
  },
  searchEmpty: {
    paddingVertical: 48,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  searchEmptyText: {
    fontSize: 16,
    textAlign: "center",
  },
  controlBlock: {
    gap: 6,
  },
  chipsLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "600",
  },
  chipsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    paddingVertical: 5,
    paddingHorizontal: 10,
    minWidth: 54,
    alignItems: "center",
  },
  chipText: {
    fontSize: 13,
    color: "#4b5563",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(66, 85, 255, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
  },
});
