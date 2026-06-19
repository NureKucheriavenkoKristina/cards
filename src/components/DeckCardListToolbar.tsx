import Feather from "@expo/vector-icons/Feather";
import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from "react-native";

import { useAppColors } from "@/src/contexts/ThemeContext";
import type { CardListFilter, CardListSort } from "@/src/lib/deckCardListQuery";

const webTextInputNoOutline: TextStyle | undefined =
  Platform.OS === "web"
    ? ({ outlineWidth: 0, outlineStyle: "none" } as unknown as TextStyle)
    : undefined;

export type DeckCardListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  filter: CardListFilter;
  onFilterChange: (value: CardListFilter) => void;
  sort: CardListSort;
  onSortChange: (value: CardListSort) => void;
  showStudyFilters?: boolean;
  searchPlaceholder: string;
  t: (key: string) => string;
};

export function DeckCardListToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  showStudyFilters = true,
  searchPlaceholder,
  t,
}: DeckCardListToolbarProps) {
  const C = useAppColors();
  const [searchFocused, setSearchFocused] = useState(false);

  const filterOptions: { key: CardListFilter; label: string }[] = [
    { key: "all", label: t("cardsFilterAll") },
    { key: "standard", label: t("cardsFilterStandard") },
    { key: "cloze", label: t("cardTypeCloze") },
    { key: "reversible", label: t("cardsFilterReversible") },
    { key: "withMedia", label: t("cardsFilterWithMedia") },
    ...(showStudyFilters
      ? ([
          { key: "dueToday" as const, label: t("cardsFilterDueToday") },
          { key: "new" as const, label: t("cardsFilterNew") },
        ] as const)
      : []),
  ];

  const sortOptions: { key: CardListSort; label: string }[] = [
    { key: "newest", label: t("newest") },
    { key: "oldest", label: t("oldest") },
    { key: "frontAsc", label: t("cardsSortFrontAZ") },
    { key: "frontDesc", label: t("cardsSortFrontZA") },
    { key: "updatedDesc", label: t("cardsSortUpdated") },
  ];

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.search,
          { backgroundColor: C.inputBg, borderColor: C.inputBorder },
          searchFocused &&
            (C.isDark
              ? { borderColor: C.tint, backgroundColor: C.surface }
              : styles.searchFocused),
        ]}
      >
        <Feather name="search" size={16} color={searchFocused ? C.tint : C.textMuted} />
        <TextInput
          style={[styles.searchInput, webTextInputNoOutline, { color: C.text }]}
          value={search}
          onChangeText={onSearchChange}
          placeholder={searchPlaceholder}
          placeholderTextColor={C.placeholder}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => onSearchChange("")} hitSlop={8}>
            <Feather name="x-circle" size={16} color={C.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, { color: C.textSub }]}>{t("filterBy")}</Text>
        <View style={styles.chipsRow}>
          {filterOptions.map(({ key, label }) => (
            <Pressable
              key={key}
              style={[
                styles.chip,
                { backgroundColor: C.surface, borderColor: C.border },
                filter === key && {
                  borderColor: C.tint,
                  backgroundColor: C.isDark ? "rgba(165,180,252,0.15)" : "rgba(66,85,255,0.12)",
                },
              ]}
              onPress={() => onFilterChange(key)}
            >
              <Text
                style={[
                  styles.chipTxt,
                  { color: C.textSub },
                  filter === key && { color: C.tint, fontWeight: "600" },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <Text style={[styles.label, { color: C.textSub }]}>{t("sortBy")}</Text>
        <View style={styles.chipsRow}>
          {sortOptions.map(({ key, label }) => (
            <Pressable
              key={key}
              style={[
                styles.chip,
                { backgroundColor: C.surface, borderColor: C.border },
                sort === key && {
                  borderColor: C.tint,
                  backgroundColor: C.isDark ? "rgba(165,180,252,0.15)" : "rgba(66,85,255,0.12)",
                },
              ]}
              onPress={() => onSortChange(key)}
            >
              <Text
                style={[
                  styles.chipTxt,
                  { color: C.textSub },
                  sort === key && { color: C.tint, fontWeight: "600" },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10, marginBottom: 12, width: "100%" },
  search: {
    height: 46,
    borderRadius: 13,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchFocused: {
    borderColor: "#1a1a1a",
    backgroundColor: "#fff",
    shadowColor: "#1a1a1a",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  block: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600" },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipTxt: { fontSize: 13, fontWeight: "500" },
});
