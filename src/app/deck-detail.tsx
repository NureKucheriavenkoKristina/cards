import { Deck } from "@/assets/data/decks";
import { Card } from "@/assets/data/cards";
import Feather from "@expo/vector-icons/Feather";
import { exportDeckPdf } from "@/src/lib/exportDeckPdf";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { TextStyle } from "react-native";

import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/contexts/AuthContext";
import { useStudySettings } from "@/src/contexts/StudySettingsContext";
import { DeckCardListToolbar } from "@/src/components/DeckCardListToolbar";
import { CardSideMedia } from "@/src/components/CardSideMedia";
import { fetchUserProgressForDeck, getDueTodayCountForUser } from "@/src/lib/userCardProgress";
import ConfirmModal from "@/src/components/ConfirmModal";
import DeckSrsOverridesPanel from "@/src/components/DeckSrsOverridesPanel";
import CardComplaintModal from "@/src/components/CardComplaintModal";
import GenerateCardsModal from "@/src/components/GenerateCardsModal";
import { useLanguage } from "@/src/contexts/LanguageContext";
import { useAppColors } from "@/src/contexts/ThemeContext";
import {
  CLOZE_GAP_MARKER,
  getClozePartsFromCard,
  isClozeLearnable,
  normalizeCardType,
  type ClozeParts,
} from "@/src/lib/cardModel";
import { getCardMediaForSide, normalizeCardMediaRows } from "@/src/lib/cardMedia";
import {
  hasActiveDeckCardQuery,
  type CardListFilter,
  type CardListSort,
  queryDeckCards,
} from "@/src/lib/deckCardListQuery";
import { estimateCardTileHeight, splitIntoBalancedColumns } from "@/src/lib/balancedColumns";
import { useLayoutWidth } from "@/src/hooks/useLayoutWidth";

const scrollPositions: Record<string, number> = {};

/** Web: hide browser default focus outline (RN TextStyle typings omit outlineStyle "none"). */
const webTextInputNoOutline: TextStyle | undefined =
  Platform.OS === "web"
    ? ({ outlineWidth: 0, outlineStyle: "none" } as unknown as TextStyle)
    : undefined;

type Collaborator = {
  deck_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string | null;
};

type UserSearchResult = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export default function DeckDetailScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const deckId = typeof params.id === "string" ? params.id : null;
  const { t } = useLanguage();
  const C = useAppColors();
  const layoutWidth = useLayoutWidth();
  const pageWidth = Math.min(layoutWidth, 1000);

  const { user } = useAuth();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [progressMap, setProgressMap] = useState<
    Map<string, import("@/src/lib/userCardProgress").UserCardProgress>
  >(new Map());
  const [totalCards, setTotalCards] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cardToDelete, setCardToDelete] = useState<Card | null>(null);
  const [reportCard, setReportCard] = useState<Card | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [hasCopy, setHasCopy] = useState<boolean | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // ── Collaborators ──
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [learnedInfoOpen, setLearnedInfoOpen] = useState(false);
  const [dueTodayInfoOpen, setDueTodayInfoOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [collaboratorToRemove, setCollaboratorToRemove] = useState<Collaborator | null>(null);

  const [cardSearch, setCardSearch] = useState("");
  const [cardFilter, setCardFilter] = useState<CardListFilter>("all");
  const [cardSort, setCardSort] = useState<CardListSort>("newest");
  const [coverImgRatio, setCoverImgRatio] = useState<number | null>(null);

  // ── Members map: userId → displayName (for card author labels) ──
  const [membersMap, setMembersMap] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    if (!deckId) { setError(t("deckNotFound")); setLoading(false); return; }
    setLoading(true); setError(null);

    const [{ data: deckData, error: deckError }, { data: cardsData, error: cardsError }] =
      await Promise.all([
        supabase.from("decks").select("*").eq("deck_id", deckId).single(),
        supabase.from("cards").select("*, card_media(*)").eq("deck_id", deckId).order("created_at", { ascending: false }),
      ]);

    if (deckError || cardsError) {
      setError(t("failedToLoadDeck"));
    } else {
      const d = deckData as Deck;
      if (!user?.id && !d.is_public) {
        setError(t("deckNotFound"));
        setDeck(null);
        setCards([]);
        setTotalCards(0);
      } else {
        setDeck(d);
        const list = (cardsData as Card[]) ?? [];
        setCards(list);
        setTotalCards(list.length);
        if (user?.id) {
          const progress = await fetchUserProgressForDeck(user.id, list.map((c) => c.card_id));
          setProgressMap(progress);
        } else {
          setProgressMap(new Map());
        }
      }
    }
    setLoading(false);
  }, [deckId, t, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Load collaborators ──
  const loadCollaborators = useCallback(async () => {
    if (!deckId) return;
    const { data } = await supabase.rpc("get_deck_collaborators", { p_deck_id: deckId });
    if (data) setCollaborators(data as Collaborator[]);
  }, [deckId]);

  useEffect(() => { loadCollaborators(); }, [loadCollaborators]);

  // ── Build membersMap: userId → displayName ──
  useEffect(() => {
    if (!deck || !user) return;
    const map: Record<string, string> = {};
    // current user always known
    map[user.id] = (user.user_metadata?.username as string | undefined)
      ?? user.email?.split('@')[0]
      ?? 'me';
    // accepted collaborators
    collaborators.forEach((c) => {
      if (c.status === 'accepted' || c.status == null) {
        map[c.user_id] = c.display_name || c.username;
      }
    });
    setMembersMap(map);
    // fetch owner's name if not already in map (viewing as collaborator)
    if (deck.creator_id && !map[deck.creator_id]) {
      supabase
        .rpc('get_user_display_name', { p_user_id: deck.creator_id })
        .then(({ data }) => {
          if (data) setMembersMap((prev) => ({ ...prev, [deck.creator_id]: data as string }));
        });
    }
  }, [deck, user, collaborators]);

  // ── Search users by username ──
  const handleSearchUser = useCallback(async (query: string) => {
    setCollaboratorSearch(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    const { data } = await supabase.rpc("find_user_by_username", { search_username: query.trim() });
    setIsSearching(false);
    setSearchResults((data as UserSearchResult[]) ?? []);
  }, []);

  // ── Invite collaborator ──
  const handleInvite = useCallback(async (targetUserId: string, targetUsername?: string) => {
    if (!deckId || isInviting) return;

    // Block inviting the owner of the original deck (to avoid duplicates in their "Your Decks")
    if (deck?.original_deck_id) {
      const { data: origDeck } = await supabase
        .from("decks")
        .select("creator_id")
        .eq("deck_id", deck.original_deck_id)
        .single();
      if (origDeck?.creator_id === targetUserId) {
        setInviteMsg({ text: t("cannotInviteOriginalCreator"), ok: false });
        return;
      }
    }

    const existing = collaborators.find((c) => c.user_id === targetUserId);
    if (existing?.status === 'accepted') {
      setInviteMsg({ text: t("inviteAlready"), ok: false });
      return;
    }
    if (existing?.status === 'pending') {
      setInviteMsg({ text: t("inviteAlreadyPending"), ok: false });
      return;
    }
    setIsInviting(true);
    setInviteMsg(null);
    const { error } = await supabase.from("deck_collaborators").insert({
      deck_id: deckId,
      user_id: targetUserId,
      role: "editor",
      status: "pending",
      invited_by: user?.id,
    });
    setIsInviting(false);
    if (error) {
      setInviteMsg({ text: error.message || t("inviteError"), ok: false });
    } else {
      const name = targetUsername ? `@${targetUsername}` : "";
      setInviteMsg({ text: `${t("inviteSuccess")}${name ? ` → ${name}` : ""}`, ok: true });
      setCollaboratorSearch("");
      setSearchResults([]);
      loadCollaborators();
    }
  }, [deckId, deck, collaborators, isInviting, user?.id, t, loadCollaborators]);

  // ── Remove collaborator ──
  const handleRemoveCollaborator = useCallback(async () => {
    if (!collaboratorToRemove) return;
    const row = collaboratorToRemove;
    setCollaboratorToRemove(null);
    await supabase
      .from("deck_collaborators")
      .delete()
      .eq("deck_id", row.deck_id)
      .eq("user_id", row.user_id);
    setCollaborators((prev) =>
      prev.filter((c) => !(c.deck_id === row.deck_id && c.user_id === row.user_id))
    );
  }, [collaboratorToRemove]);

  useFocusEffect(
    useCallback(() => {
      loadData().then(() => {
        if (deckId && scrollPositions[deckId] > 0) {
          const y = scrollPositions[deckId];
          let attempts = 0;
          const attemptScroll = () => {
            if (scrollViewRef.current) scrollViewRef.current.scrollTo({ y, animated: false });
            else if (attempts < 20) { attempts++; setTimeout(attemptScroll, 50); }
          };
          setTimeout(attemptScroll, 150);
        }
      });
    }, [loadData, deckId])
  );

  const { settings: studySettings } = useStudySettings();

  const dueToday = useMemo(() => {
    if (!user) return totalCards;
    return getDueTodayCountForUser(
      cards.map((c) => c.card_id),
      progressMap,
      new Date(),
      studySettings.srsDayStartHour
    );
  }, [user, totalCards, cards, progressMap, studySettings.srsDayStartHour]);

  const hasDeckStudyLimits = useMemo(() => {
    const o = deck?.srs_overrides;
    if (!o || typeof o !== "object" || Array.isArray(o)) return false;
    const r = o as Record<string, unknown>;
    const isLimit = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
    return isLimit(r.new_cards_per_day) || isLimit(r.cards_per_day);
  }, [deck?.srs_overrides]);

  const isOwner = deck && user && deck.creator_id === user.id;
  // treat missing status (old DB without status column) as 'accepted' for backward compat
  const isCollaborator = !isOwner && collaborators.some(
    (c) => c.user_id === user?.id && c.status !== 'pending' && c.status !== 'declined'
  );
  const canEdit = isOwner || isCollaborator;
  const isPublicFromOther = !canEdit && deck?.is_public;

  const checkHasCopy = useCallback(async () => {
    if (!deck || !user || isOwner) return;
    const { data } = await supabase
      .from("decks").select("deck_id")
      .eq("creator_id", user.id).eq("original_deck_id", deck.deck_id).limit(1);
    setHasCopy((data?.length ?? 0) > 0);
  }, [deck, user, isOwner]);

  useEffect(() => {
    if (isPublicFromOther && user) checkHasCopy();
  }, [isPublicFromOther, user, checkHasCopy]);

  const handleAddToMyAccount = async () => {
    if (!deck || !user || isCopying || hasCopy) return;
    setIsCopying(true); setError(null);
    try {
      const { data: newDeck, error: deckErr } = await supabase.from("decks").insert({
        creator_id: user.id,
        title: deck.title,
        description: deck.description,
        cover_image_url: deck.cover_image_url,
        is_public: false,
        original_deck_id: deck.deck_id,
        srs_overrides: deck.srs_overrides ?? null,
      }).select("deck_id").single();
      if (deckErr) { setErrorModal(deckErr.message ?? t("failedToLoadData")); setIsCopying(false); return; }
      if (cards.length > 0) {
        const { data: copiedCards, error: cardsErr } = await supabase.from("cards").insert(
          cards.map((c) => ({
            deck_id: newDeck.deck_id,
            card_type: c.card_type ?? "basic",
            card_extra: c.card_extra ?? {},
            front_text: c.front_text,
            back_text: c.back_text,
            notes: c.notes,
          })),
        ).select("card_id");
        if (cardsErr) { setErrorModal(cardsErr.message ?? t("failedToLoadData")); setIsCopying(false); return; }
        const mediaRows = cards.flatMap((c, index) =>
          normalizeCardMediaRows(c.card_media).map((m) => ({
            card_id: copiedCards?.[index]?.card_id,
            side: m.side,
            media_type: m.media_type,
            url: m.url,
            position: m.position,
          })).filter((row) => Boolean(row.card_id)),
        );
        if (mediaRows.length > 0) {
          const { error: mediaErr } = await supabase.from("card_media").insert(mediaRows);
          if (mediaErr) { setErrorModal(mediaErr.message ?? t("failedToLoadData")); setIsCopying(false); return; }
        }
      }
      setHasCopy(true);
      router.replace(`/deck-detail?id=${newDeck.deck_id}`);
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : t("unexpectedError"));
    } finally { setIsCopying(false); }
  };

  const handleUpdateFromOriginal = async () => {
    if (!deck || !deck.original_deck_id || isUpdating) return;
    setIsUpdating(true); setError(null);
    try {
      const { data: originalCards, error: fetchErr } = await supabase.from("cards")
        .select("front_text, back_text, notes, card_type, card_extra, card_media(*)")
        .eq("deck_id", deck.original_deck_id);
      if (fetchErr) { setErrorModal(fetchErr.message ?? t("failedToLoadData")); setIsUpdating(false); return; }
      const existingKeys = new Set(cards.map((c) => `${c.front_text}\0${c.back_text}`));
      const toAdd = (originalCards ?? []).filter((oc) => !existingKeys.has(`${oc.front_text}\0${oc.back_text}`));
      if (toAdd.length === 0) { setErrorModal(t("noNewCards")); setIsUpdating(false); return; }
      const { data: insertedCards, error: insertErr } = await supabase.from("cards").insert(
        toAdd.map((c) => ({
          deck_id: deck.deck_id,
          card_type: c.card_type ?? "basic",
          card_extra: c.card_extra ?? {},
          front_text: c.front_text,
          back_text: c.back_text,
          notes: c.notes,
        })),
      ).select("card_id");
      if (insertErr) { setErrorModal(insertErr.message ?? t("failedToLoadData")); setIsUpdating(false); return; }
      const mediaRows = toAdd.flatMap((c, index) =>
        normalizeCardMediaRows(c.card_media).map((m) => ({
          card_id: insertedCards?.[index]?.card_id,
          side: m.side,
          media_type: m.media_type,
          url: m.url,
          position: m.position,
        })).filter((row) => Boolean(row.card_id)),
      );
      if (mediaRows.length > 0) {
        const { error: mediaErr } = await supabase.from("card_media").insert(mediaRows);
        if (mediaErr) { setErrorModal(mediaErr.message ?? t("failedToLoadData")); setIsUpdating(false); return; }
      }
      await loadData();
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : t("unexpectedError"));
    } finally { setIsUpdating(false); }
  };

  const handleDeleteCard = (card: Card) => setCardToDelete(card);

  const handleExportPdf = useCallback(async () => {
    if (!deck || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportDeckPdf({
        title: deck.title ?? "",
        description: deck.description ?? null,
        emptyMessage: "Ця дошка поки що немає карток",
        cards: cards.map((c) => ({
          front_text: c.front_text ?? "",
          back_text: c.back_text ?? "",
        })),
      });
    } catch (err) {
      setErrorModal(err instanceof Error ? err.message : t("unexpectedError"));
    } finally {
      setIsExportingPdf(false);
    }
  }, [cards, deck, isExportingPdf, t]);

  const performDeleteCard = async () => {
    if (!cardToDelete) return;
    const card = cardToDelete;
    setCardToDelete(null);
    const { error } = await supabase.from("cards").delete().eq("card_id", card.card_id);
    if (error) { setErrorModal(error.message || t("failedToDeleteCard")); return; }
    setCards((prev) => prev.filter((c) => c.card_id !== card.card_id));
    setTotalCards((prev) => Math.max(0, prev - 1));
  };

  useLayoutEffect(() => {
    // Avoid "Cardly" twice: left header already shows app name + menu.
    navigation.setOptions({ title: deck?.title?.trim() ? deck.title : '' });
    return () => {
      navigation.setOptions({ headerShown: undefined, tabBarStyle: undefined });
    };
  }, [navigation, deck?.title]);

  const isCopiedDeck = Boolean(deck?.original_deck_id);

  /* ── responsive columns: 2 on wide, 1 on narrow ── */
  const numCols = Platform.OS === "web" && layoutWidth >= 860 ? 2 : 1;

  const displayedCards = useMemo(
    () =>
      queryDeckCards(cards, {
        search: cardSearch,
        filter: cardFilter,
        sort: cardSort,
        progressMap,
        srsDayStartHour: studySettings.srsDayStartHour,
      }),
    [cards, cardSearch, cardFilter, cardSort, progressMap, studySettings.srsDayStartHour],
  );

  const cardColumns = useMemo(
    () => splitIntoBalancedColumns(displayedCards, numCols, estimateCardTileHeight),
    [displayedCards, numCols],
  );

  const hasActiveCardQuery = hasActiveDeckCardQuery(cardSearch, cardFilter, cardSort);

  const clearCardQuery = useCallback(() => {
    setCardSearch("");
    setCardFilter("all");
    setCardSort("newest");
  }, []);

  useEffect(() => {
    const url = deck?.cover_image_url;
    if (!url) {
      setCoverImgRatio(null);
      return;
    }
    Image.getSize(
      url,
      (w, h) => setCoverImgRatio(w / h),
      () => setCoverImgRatio(null),
    );
  }, [deck?.cover_image_url]);

  /** Secondary deck actions: 2×2 grid below ~520dp (export / add / AI / rate). */
  const compactSecondaryActions = layoutWidth < 520;

  /* ── loading ── */
  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (error || !deck) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <Feather name="alert-circle" size={40} color="#d1d5db" />
        <Text style={[styles.errorMsg, { color: C.textSub }]}>{error ?? t("deckNotFound")}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnTxt}>{t("goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ── progress % ── */
  const progressPct = totalCards > 0 ? Math.round(((totalCards - dueToday) / totalCards) * 100) : 0;

  /** Portrait/tall covers: fixed strip height, center crop. Landscape: height from aspect ratio. */
  const isPortraitCover = coverImgRatio != null && coverImgRatio < 1.6;
  const heroCoverH = deck.cover_image_url
    ? isPortraitCover
      ? 220
      : coverImgRatio
        ? Math.min(Math.max(pageWidth / coverImgRatio, 180), 320)
        : 220
    : undefined;

  return (
    <>
      <ScrollView
        ref={scrollViewRef}
        style={[styles.root, { backgroundColor: C.bg }]}
        contentContainerStyle={styles.contentOuter}
        onScroll={(e) => { if (deckId) scrollPositions[deckId] = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
        showsVerticalScrollIndicator={Platform.OS === 'web'}
      >
        <View style={[styles.pageWrap, { width: pageWidth }]}>

          {/* ════════════ HERO ════════════ */}
          <View
            style={[
              styles.hero,
              deck.cover_image_url && heroCoverH != null && styles.heroWithCoverFixed,
              deck.cover_image_url && heroCoverH != null && { height: heroCoverH },
              deck.cover_image_url
                ? { backgroundColor: C.isDark ? '#0f172a' : '#1e293b' }
                : { backgroundColor: C.isDark ? '#1a2535' : '#C6E3ED' },
            ]}
          >
            {deck.cover_image_url ? (
              <View style={styles.heroImageStrip} pointerEvents="none">
                <Image
                  source={{ uri: deck.cover_image_url }}
                  style={[
                    styles.heroCoverImage,
                    Platform.OS === "web"
                      ? { objectFit: "cover" as const }
                      : null,
                  ]}
                  resizeMode="cover"
                  onLoad={(e) => {
                    const source = e.nativeEvent?.source;
                    if (source?.width && source?.height) {
                      setCoverImgRatio(source.width / source.height);
                    }
                  }}
                />
                <View style={styles.heroOverlay} />
              </View>
            ) : null}

            <View style={deck.cover_image_url ? styles.heroContentOnCover : undefined}>
            {/* Badge row */}
            <View style={styles.heroBadgeRow}>
              <View style={[
                styles.badge,
                deck.cover_image_url
                  ? styles.badgeOnCover
                  : (deck.is_public
                      ? { backgroundColor: C.isDark ? 'rgba(5,150,105,0.18)' : 'rgba(5,150,105,0.12)', borderWidth: 1, borderColor: C.isDark ? 'rgba(5,150,105,0.4)' : 'rgba(5,150,105,0.25)' }
                      : { backgroundColor: C.isDark ? 'rgba(99,102,241,0.12)' : 'rgba(71,85,105,0.1)', borderWidth: 1, borderColor: C.isDark ? 'rgba(99,102,241,0.25)' : 'rgba(71,85,105,0.2)' }),
              ]}>
                <Feather
                  name={deck.is_public ? "globe" : "lock"}
                  size={11}
                  color={deck.cover_image_url ? "#fff" : (deck.is_public ? "#059669" : C.textSub)}
                />
                <Text style={[
                  styles.badgeTxt,
                  deck.cover_image_url
                    ? styles.badgeTxtOnCover
                    : (deck.is_public ? styles.badgeTxtPublic : { color: C.textSub }),
                ]}>
                  {deck.is_public ? t("public") : t("private")}
                </Text>
              </View>
              {isCopiedDeck && (
                <View style={[styles.badgeCopy, deck.cover_image_url && styles.badgeOnCover]}>
                  <Feather name="copy" size={11} color={deck.cover_image_url ? "#fff" : "#8b5cf6"} />
                  <Text style={[styles.badgeTxtCopy, deck.cover_image_url && styles.badgeTxtOnCover]}>
                    {t("copied")}
                  </Text>
                </View>
              )}
            </View>

            {/* Title + description */}
            <Text style={[styles.heroTitle, { color: C.text }, deck.cover_image_url && styles.heroTitleOnCover]}>
              {deck.title}
            </Text>
            {deck.description ? (
              <Text
                style={[styles.heroDesc, { color: C.textSub }, deck.cover_image_url && styles.heroDescOnCover]}
                numberOfLines={deck.cover_image_url ? 2 : undefined}
              >
                {deck.description}
              </Text>
            ) : null}
            </View>
          </View>

          {/* ════════════ STATS ROW ════════════ */}
          <View style={[styles.statsRow, { backgroundColor: C.surface }]}>
            <StatChip value={totalCards} label={t("totalCards")} color="#6366f1" />
            {user ? (
              <>
                <View style={[styles.statsDivider, { backgroundColor: C.borderLight }]} />
                <StatChip
                  value={dueToday}
                  label={t("dueToday")}
                  color="#d97706"
                  onInfoPress={hasDeckStudyLimits ? () => setDueTodayInfoOpen(true) : undefined}
                  infoAccessibilityLabel={t("dueTodayInfoTitle")}
                />
                <View style={[styles.statsDivider, { backgroundColor: C.borderLight }]} />
                <StatChip
                  value={`${progressPct}%`}
                  label={t("learned")}
                  color="#059669"
                  onInfoPress={() => setLearnedInfoOpen(true)}
                  infoAccessibilityLabel={t("learnedPercentInfoTitle")}
                />
              </>
            ) : null}
          </View>

          {/* ────── Progress bar ────── */}
          {!!user && totalCards > 0 && (
            <View style={styles.progressWrap}>
              <View style={[styles.progressTrack, { backgroundColor: C.border }]}>
                <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
              </View>
            </View>
          )}

          {/* ════════════ ACTIONS ════════════ */}
          <View style={styles.actions}>

            {/* Co-author badge */}
            {isCollaborator && (
              <View style={styles.collaboratorBadge}>
                <Feather name="users" size={14} color="#6366f1" />
                <Text style={styles.collaboratorBadgeTxt}>{t("youAreCollaborator")}</Text>
              </View>
            )}

            {user ? (
              <View style={[styles.actionRowPrimary, styles.actionRowPrimaryStack]}>
                {canEdit ? (
                  <ActionBtn
                    label={t("deckReviewCards")}
                    bg={C.isDark ? "#3d9470" : "#2f9e73"}
                    onPress={() =>
                      router.push({ pathname: "/deck-study", params: { id: deck.deck_id, today: "1" } })
                    }
                    fullWidth
                  />
                ) : null}
                <ActionBtn
                  label={t("deckTakeTest")}
                  bg={C.isDark ? "#6a6ec8" : "#5f63c0"}
                  onPress={() => router.push({ pathname: "/deck-quiz-new", params: { id: deck.deck_id } })}
                  fullWidth
                />
              </View>
            ) : null}

            {/* Secondary row — wraps to 2×2 on narrow viewports */}
            {(user || canEdit) ? (
            <View
              style={[
                styles.actionRowSecondary,
                compactSecondaryActions && styles.actionRowSecondaryWrap,
              ]}
            >
              {user ? (
                <ActionBtn
                  icon="download"
                  label={isExportingPdf ? t("exportingPdf") : t("exportPdf")}
                  bg={C.surface}
                  textColor="#2563eb"
                  border
                  borderColor="rgba(37,99,235,0.25)"
                  onPress={handleExportPdf}
                  disabled={isExportingPdf}
                  flex={!compactSecondaryActions}
                  compactLayout={compactSecondaryActions}
                  gridHalf={compactSecondaryActions}
                />
              ) : null}
              {canEdit && (
                <ActionBtn
                  icon="plus-circle"
                  label={t("addCard")}
                  bg={C.surface}
                  textColor="#6366f1"
                  border
                  borderColor="rgba(99,102,241,0.25)"
                  onPress={() => router.push(`/add-card?deckId=${deck.deck_id}`)}
                  flex={!compactSecondaryActions}
                  compactLayout={compactSecondaryActions}
                  gridHalf={compactSecondaryActions}
                />
              )}
              {canEdit && (
                <ActionBtn
                  icon="zap"
                  label={t("aiGenerateCards")}
                  bg={C.surface}
                  textColor={C.tint}
                  border
                  borderColor="rgba(99,102,241,0.25)"
                  onPress={() => setShowGenerateModal(true)}
                  flex={!compactSecondaryActions}
                  compactLayout={compactSecondaryActions}
                  gridHalf={compactSecondaryActions}
                />
              )}
              {user ? (
                <ActionBtn
                  icon="star"
                  label={t("rateComment")}
                  bg={C.surface}
                  textColor="#d97706"
                  border
                  borderColor="rgba(217,119,6,0.25)"
                  onPress={() => router.push(`/deck-rate?id=${deck.deck_id}`)}
                  flex={!compactSecondaryActions}
                  compactLayout={compactSecondaryActions}
                  gridHalf={compactSecondaryActions}
                />
              ) : null}
            </View>
            ) : null}

            {isOwner && (
              <View style={{ width: "100%", marginTop: 10 }}>
                <ActionBtn
                  icon="upload"
                  label={t("importCards")}
                  bg={C.surface}
                  textColor="#0f766e"
                  border
                  borderColor="rgba(15,118,110,0.28)"
                  onPress={() => router.push(`/deck-import?deckId=${deck.deck_id}`)}
                  fullWidth
                />
              </View>
            )}

            {/* Copy/update row */}
            {isOwner && isCopiedDeck && (
              <ActionBtn
                icon="refresh-cw"
                label={isUpdating ? `${t("saving")}...` : t("updateFromOriginal")}
                bg={C.surface}
                textColor={C.tint}
                border
                borderColor="rgba(99,102,241,0.25)"
                onPress={handleUpdateFromOriginal}
                disabled={isUpdating}
                fullWidth
              />
            )}
            {isPublicFromOther && user && (
              <ActionBtn
                icon={hasCopy ? "check" : "download"}
                label={hasCopy ? t("alreadyInCollection") : (isCopying ? `${t("saving")}...` : t("addToMyAccount"))}
                bg={hasCopy ? "#f0fdf4" : "#6366f1"}
                textColor={hasCopy ? "#059669" : "#fff"}
                border={!!hasCopy}
                borderColor="rgba(5,150,105,0.3)"
                onPress={handleAddToMyAccount}
                disabled={hasCopy === true || isCopying}
                fullWidth
              />
            )}
            {isPublicFromOther && !user && (
              <View
                style={{
                  marginTop: 4,
                  padding: 16,
                  borderRadius: 14,
                  backgroundColor: C.isDark ? 'rgba(99,102,241,0.12)' : '#eef0ff',
                  borderWidth: 1,
                  borderColor: C.isDark ? 'rgba(165,180,252,0.25)' : 'rgba(99,102,241,0.25)',
                }}
              >
                <Text style={{ color: C.textSub, fontSize: 15, lineHeight: 22 }}>{t('guestDeckCta')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={() => router.push('/auth/login')}
                    style={{ backgroundColor: C.tint, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>{t('signIn')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push('/auth/signup')}
                    style={{ borderWidth: 1.5, borderColor: C.tint, paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 }}
                  >
                    <Text style={{ color: C.tint, fontWeight: '600', fontSize: 15 }}>{t('signUp')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {isOwner && deck ? (
            <DeckSrsOverridesPanel
              deckId={deck.deck_id}
              overrides={deck.srs_overrides ?? null}
              onSaved={(savedOverrides) => {
                setDeck((prev) =>
                  prev ? { ...prev, srs_overrides: savedOverrides } : prev,
                );
              }}
            />
          ) : null}

          {/* ════════════ COLLABORATORS SECTION (owner only) ════════════ */}
          {isOwner && (
            <View style={[styles.collabSection, { backgroundColor: C.surface }]}>
              {/* Toggle button */}
              <TouchableOpacity
                style={styles.collabToggleBtn}
                onPress={() => {
                  setCollabOpen(v => !v);
                  setInviteMsg(null);
                  setSearchResults([]);
                  setCollaboratorSearch("");
                }}
                activeOpacity={0.8}
              >
                <View style={styles.collabToggleLeft}>
                  <View
                    style={[
                      styles.collabToggleIcon,
                      { backgroundColor: C.isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF' },
                    ]}
                  >
                    <Feather name="users" size={16} color={C.tint} />
                  </View>
                  <Text style={[styles.collabToggleTitle, { color: C.text }]}>{t("collaborators")}</Text>
                  {collaborators.filter(c => c.status !== 'pending' && c.status !== 'declined').length > 0 && (
                    <View style={styles.collabToggleBadge}>
                      <Text style={styles.collabToggleBadgeTxt}>
                        {collaborators.filter(c => c.status !== 'pending' && c.status !== 'declined').length}
                      </Text>
                    </View>
                  )}
                </View>
                <Feather name={collabOpen ? "chevron-up" : "chevron-down"} size={18} color={C.textSub} />
              </TouchableOpacity>

              {/* Expandable content */}
              {collabOpen && (
                <View style={[styles.collabBody, { borderTopColor: C.borderLight }]}>
                  {/* Invite input */}
                  <View style={styles.inviteRow}>
                    <View style={[styles.inviteInputWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <Feather name="search" size={15} color={collaboratorSearch.length > 0 ? "#6366f1" : "#b0b8c8"} />
                      <TextInput
                        style={[styles.inviteInput, webTextInputNoOutline, { color: C.text }]}
                        placeholder={t("searchByUsername")}
                        placeholderTextColor={C.placeholder}
                        value={collaboratorSearch}
                        onChangeText={handleSearchUser}
                        autoCapitalize="none"
                      />
                      {isSearching && <ActivityIndicator size="small" color="#6366f1" />}
                      {collaboratorSearch.length > 0 && !isSearching && (
                        <Pressable onPress={() => { setCollaboratorSearch(""); setSearchResults([]); }} hitSlop={8}>
                          <Feather name="x" size={15} color="#b0b8c8" />
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <View style={styles.searchResultsList}>
                      {searchResults.map((u) => {
                        const existing = collaborators.find((c) => c.user_id === u.user_id);
                        const isPending = existing?.status === 'pending';
                        const isAccepted = existing?.status === 'accepted';
                        const isDisabled = isPending || isAccepted || isInviting;
                        return (
                          <View key={u.user_id} style={[styles.searchResultItem, { backgroundColor: C.surface, borderBottomColor: C.borderLight }]}>
                            <View style={styles.searchResultAvatar}>
                              {u.avatar_url
                                ? <Image source={{ uri: u.avatar_url }} style={styles.searchResultAvatarImg} />
                                : <Text style={styles.searchResultAvatarTxt}>{(u.username ?? "?")[0].toUpperCase()}</Text>
                              }
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.searchResultName}>{u.display_name || u.username}</Text>
                              <Text style={styles.searchResultUsername}>@{u.username}</Text>
                            </View>
                            <TouchableOpacity
                              style={[
                                styles.inviteBtn,
                                isAccepted && styles.inviteBtnDone,
                                isPending && styles.inviteBtnPending,
                              ]}
                              onPress={() => !isDisabled && handleInvite(u.user_id, u.username)}
                              disabled={isDisabled}
                            >
                              <Feather
                                name={isAccepted ? "check" : isPending ? "clock" : "user-plus"}
                                size={14}
                                color={isAccepted ? "#059669" : isPending ? "#d97706" : "#fff"}
                              />
                              <Text style={[
                                styles.inviteBtnTxt,
                                isAccepted && styles.inviteBtnTxtDone,
                                isPending && styles.inviteBtnTxtPending,
                              ]}>
                                {isAccepted ? t("inviteAlready") : isPending ? t("invitePending") : t("invite")}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Invite message */}
                  {inviteMsg && (
                    <View style={[styles.inviteMsg, inviteMsg.ok ? styles.inviteMsgOk : styles.inviteMsgErr]}>
                      <Feather name={inviteMsg.ok ? "check-circle" : "alert-circle"} size={14} color={inviteMsg.ok ? "#059669" : "#dc2626"} />
                      <Text style={[styles.inviteMsgTxt, inviteMsg.ok ? styles.inviteMsgTxtOk : styles.inviteMsgTxtErr]}>{inviteMsg.text}</Text>
                    </View>
                  )}

                  {/* Collaborators list — only accepted */}
                  {collaborators.filter(c => c.status !== 'pending' && c.status !== 'declined').length === 0 ? (
                    <Text style={styles.noCollabTxt}>{t("noCollaborators")}</Text>
                  ) : (
                    <View style={styles.collabList}>
                      {collaborators
                        .filter(c => c.status !== 'pending' && c.status !== 'declined')
                        .map((c) => (
                          <View key={`${c.deck_id}_${c.user_id}`} style={[styles.collabItem, { borderBottomColor: C.borderLight }]}>
                            <View style={styles.collabAvatar}>
                              {c.avatar_url
                                ? <Image source={{ uri: c.avatar_url }} style={styles.collabAvatarImg} />
                                : <Text style={styles.collabAvatarTxt}>{(c.username ?? "?")[0].toUpperCase()}</Text>
                              }
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.collabName, { color: C.text }]}>{c.display_name || c.username}</Text>
                              <Text style={[styles.collabMeta, { color: C.textMuted }]}>@{c.username}</Text>
                            </View>
                            <Pressable
                              style={styles.collabRemoveBtn}
                              onPress={() => setCollaboratorToRemove(c)}
                              hitSlop={8}
                            >
                              <Feather name="user-x" size={15} color="#dc2626" />
                            </Pressable>
                          </View>
                        ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* ════════════ CARDS SECTION ════════════ */}
          <View style={styles.cardsSection}>
            <View style={styles.cardsSectionHeader}>
              <Text style={[styles.cardsSectionTitle, { color: C.text }]}>{t("cardsSectionTitle")}</Text>
              <Text style={[styles.cardsSectionCount, { color: C.tint, backgroundColor: C.isDark ? "rgba(99,102,241,0.18)" : "rgba(99,102,241,0.1)" }]}>
                {hasActiveCardQuery || displayedCards.length !== totalCards
                  ? t("cardsShownOf")
                      .replace("{shown}", String(displayedCards.length))
                      .replace("{total}", String(totalCards))
                  : String(totalCards)}
              </Text>
            </View>

            {cards.length > 0 ? (
              <DeckCardListToolbar
                search={cardSearch}
                onSearchChange={setCardSearch}
                filter={cardFilter}
                onFilterChange={setCardFilter}
                sort={cardSort}
                onSortChange={setCardSort}
                showStudyFilters={Boolean(user)}
                searchPlaceholder={t("searchCards")}
                t={t}
              />
            ) : null}

            {cards.length === 0 ? (
              <View style={styles.emptyCards}>
                <View style={styles.emptyCardsIcon}>
                  <Feather name="credit-card" size={32} color="#c7d2fe" />
                </View>
                <Text style={styles.emptyCardsTitle}>{t("noCardsInDeck")}</Text>
                {canEdit && (
                  <TouchableOpacity
                    style={styles.emptyCardsBtn}
                    onPress={() => router.push(`/add-card?deckId=${deck.deck_id}`)}
                  >
                    <Feather name="plus" size={16} color="#fff" />
                    <Text style={styles.emptyCardsBtnTxt}>{t("addCard")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : displayedCards.length === 0 ? (
              <View style={styles.cardsNoResults}>
                <Feather name="search" size={28} color={C.textMuted} />
                <Text style={[styles.cardsNoResultsTxt, { color: C.textSub }]}>
                  {t("cardsNoResults")}
                </Text>
                <Pressable
                  style={[styles.cardsClearBtn, { borderColor: C.tint, backgroundColor: C.isDark ? "rgba(99,102,241,0.12)" : "#eef0ff" }]}
                  onPress={clearCardQuery}
                >
                  <Text style={[styles.cardsClearBtnTxt, { color: C.tint }]}>{t("cardsClearFilters")}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={numCols === 2 ? styles.cardsTwoColumns : styles.cardsGrid}>
                {cardColumns.map((column, colIdx) => (
                  <View
                    key={colIdx}
                    style={numCols === 2 ? styles.cardsColumn : styles.cardsGridSingleCol}
                  >
                    {column.map(({ item: card, index }) => (
                      <CardTile
                        key={card.card_id}
                        card={card}
                        index={index}
                        isOwner={!!canEdit}
                        canReport={isPublicFromOther && !!user}
                        createdByName={
                          card.created_by
                            ? (membersMap[card.created_by] ?? null)
                            : (deck ? (membersMap[deck.creator_id] ?? null) : null)
                        }
                        onEdit={() =>
                          router.push(`/add-card?deckId=${deckId}&cardId=${card.card_id}`)
                        }
                        onDelete={() => handleDeleteCard(card)}
                        onReport={() => setReportCard(card)}
                        t={t}
                      />
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>

        </View>
      </ScrollView>

      <ConfirmModal
        visible={learnedInfoOpen}
        title={t("learnedPercentInfoTitle")}
        message={t("learnedPercentInfoBody")}
        confirmText={t("ok")}
        cancelText={null}
        icon="info"
        onConfirm={() => setLearnedInfoOpen(false)}
        onCancel={() => setLearnedInfoOpen(false)}
      />

      <ConfirmModal
        visible={dueTodayInfoOpen}
        title={t("dueTodayInfoTitle")}
        message={t("dueTodayInfoBody")}
        confirmText={t("ok")}
        cancelText={null}
        icon="info"
        onConfirm={() => setDueTodayInfoOpen(false)}
        onCancel={() => setDueTodayInfoOpen(false)}
      />

      <ConfirmModal
        visible={Boolean(collaboratorToRemove)}
        title={t("removeCollaborator")}
        message={t("removeCollaboratorConfirm")}
        confirmText={t("removeCollaborator")}
        cancelText={t("cancel")}
        destructive
        icon="user-x"
        onConfirm={handleRemoveCollaborator}
        onCancel={() => setCollaboratorToRemove(null)}
      />

      <ConfirmModal
        visible={Boolean(cardToDelete)}
        title={t("deleteCard")} message={t("deleteCardConfirm")}
        confirmText={t("delete")} cancelText={t("cancel")}
        destructive icon="trash-2"
        onConfirm={performDeleteCard} onCancel={() => setCardToDelete(null)}
      />
      <ConfirmModal
        visible={Boolean(errorModal)}
        title={t("error")} message={errorModal ?? ""}
        confirmText={t("ok")} cancelText={null}
        onConfirm={() => setErrorModal(null)} onCancel={() => setErrorModal(null)}
      />

      <CardComplaintModal
        visible={Boolean(reportCard)}
        cardId={reportCard?.card_id ?? null}
        deckId={deck?.deck_id ?? null}
        cardFront={reportCard?.front_text ?? null}
        deckTitle={deck?.title ?? null}
        reporterId={user?.id ?? null}
        onClose={() => setReportCard(null)}
      />

      {deck && (
        <GenerateCardsModal
          visible={showGenerateModal}
          deckId={deck.deck_id}
          deckTitle={deck.title ?? undefined}
          deckDescription={deck.description}
          onClose={() => setShowGenerateModal(false)}
          onSaved={() => {
            setShowGenerateModal(false);
            loadData();
          }}
        />
      )}
    </>
  );
}

/* ─── StatChip ─── */
function StatChip({
  value,
  label,
  color,
  onInfoPress,
  infoAccessibilityLabel,
}: {
  value: number | string;
  label: string;
  color: string;
  onInfoPress?: () => void;
  infoAccessibilityLabel?: string;
}) {
  return (
    <View style={styles.statChip}>
      {onInfoPress ? (
        <View style={styles.statChipValueRow}>
          <View style={styles.statChipInfoSpacer} />
          <Text style={[styles.statChipValue, { color }]}>{value}</Text>
          <Pressable
            style={styles.statChipInfoBtn}
            onPress={onInfoPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={infoAccessibilityLabel ?? label}
          >
            <Feather name="info" size={13} color={color} />
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.statChipValue, { color }]}>{value}</Text>
      )}
      <Text style={styles.statChipLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/* ─── ActionBtn ─── */
function ActionBtn({
  icon,
  label,
  bg,
  textColor = "#fff",
  border,
  borderColor,
  onPress,
  disabled,
  flex,
  fullWidth,
  compactLayout,
  gridHalf,
}: {
  icon?: keyof typeof Feather.glyphMap;
  label: string;
  bg: string;
  textColor?: string;
  border?: boolean;
  borderColor?: string;
  onPress: () => void;
  disabled?: boolean;
  flex?: boolean;
  fullWidth?: boolean;
  /** Icon above label, smaller type — fits 2×2 action grid on phones */
  compactLayout?: boolean;
  /** ~half row width for 2-column compact grid */
  gridHalf?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionBtn,
        { backgroundColor: bg },
        border && { borderWidth: 1.5, borderColor: borderColor ?? textColor },
        flex && { flex: 1, minWidth: 0 },
        fullWidth && { width: "100%" },
        gridHalf && styles.actionBtnGridHalf,
        compactLayout && styles.actionBtnCompact,
        !icon && styles.actionBtnNoIcon,
        disabled && styles.actionBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {icon ? <Feather name={icon} size={compactLayout ? 20 : 18} color={textColor} /> : null}
      <Text
        style={[
          styles.actionBtnTxt,
          { color: textColor },
          compactLayout && styles.actionBtnTxtCompact,
          !icon && styles.actionBtnTxtNoIcon,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/* ─── Cloze list preview ─── */
function CardTileClozeFront({
  parts,
  gapLabel,
}: {
  parts: ClozeParts;
  gapLabel: string;
}) {
  const C = useAppColors();
  const gap =
    parts.gapFront.trim().length > 0 ? (
      <Text style={[styles.cardClozeGapHint, { color: C.textSub }]}>
        {" "}
        {parts.gapFront.trim()}{" "}
      </Text>
    ) : (
      <Text style={[styles.cardClozeGap, { color: C.textMuted }]}> {gapLabel} </Text>
    );
  return (
    <Text style={[styles.cardFront, { color: C.text }]}>
      {parts.before}
      {gap}
      {parts.after}
    </Text>
  );
}

function CardTileClozeBack({ parts }: { parts: ClozeParts }) {
  const C = useAppColors();
  return (
    <Text style={[styles.cardBack, { color: C.textSub }]}>
      {parts.before}
      <Text style={styles.cardClozeAnswer}>{parts.hidden}</Text>
      {parts.after}
    </Text>
  );
}

/* ─── CardTile ─── */
function CardTile({ card, index, isOwner, canReport, createdByName, onEdit, onDelete, onReport, t }: {
  card: Card;
  index: number;
  isOwner: boolean;
  canReport?: boolean;
  createdByName: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onReport?: () => void;
  t: (k: string) => string;
}) {
  const C = useAppColors();
  const accentColors = ["#4255ff", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9"];
  const accent = accentColors[index % accentColors.length];
  const ctype = normalizeCardType(card.card_type);
  const frontMedia = getCardMediaForSide(card, "front");
  const backMedia = getCardMediaForSide(card, "back");
  const clozeParts = getClozePartsFromCard(card);
  const clozeOk = ctype === "cloze" && clozeParts && isClozeLearnable(clozeParts);
  const gapLabel = t("clozeGapMarker") || CLOZE_GAP_MARKER;
  const backDisplay =
    ctype === "cloze" && clozeParts?.hidden?.trim()
      ? clozeParts.hidden.trim()
      : card.back_text?.trim() ?? "";
  const showBack = clozeOk || backDisplay.length > 0 || backMedia.length > 0;

  return (
    <View style={[styles.cardTile, { backgroundColor: C.surface }]}>
      {/* Number badge + author */}
      <View style={styles.cardTileHeader}>
        <View style={[styles.cardNumBadge, { backgroundColor: `${accent}18` }]}>
          <Text style={[styles.cardNumTxt, { color: accent }]}>{index + 1}</Text>
        </View>
        {createdByName ? (
          <View style={[styles.cardAuthorRow, { backgroundColor: C.surfaceAlt }]}>
            <Feather name="user" size={10} color={C.textMuted} />
            <Text style={[styles.cardAuthorTxt, { color: C.textSub }]}>{createdByName}</Text>
          </View>
        ) : null}
      </View>

      {clozeOk && clozeParts ? (
        <CardTileClozeFront parts={clozeParts} gapLabel={gapLabel} />
      ) : (
        <Text style={[styles.cardFront, { color: C.text }]}>{card.front_text}</Text>
      )}
      {frontMedia.map((item) => (
        <CardSideMedia
          key={item.media_id}
          url={item.url}
          kind={item.media_type}
          layout="list"
        />
      ))}

      {card.notes ? (
        <View style={styles.cardNotesRow}>
          <Feather name="file-text" size={12} color={C.textMuted} />
          <Text style={[styles.cardNotes, { color: C.textMuted }]}>{card.notes}</Text>
        </View>
      ) : null}

      {showBack ? (
        <>
          <View style={styles.cardDividerRow}>
            <View style={[styles.cardDividerLine, { backgroundColor: `${accent}30` }]} />
            <View style={[styles.cardDividerArrow, { backgroundColor: `${accent}18` }]}>
              <Feather name="arrow-down" size={11} color={accent} />
            </View>
            <View style={[styles.cardDividerLine, { backgroundColor: `${accent}30` }]} />
          </View>

          {clozeOk && clozeParts ? (
            <CardTileClozeBack parts={clozeParts} />
          ) : backDisplay.length > 0 ? (
            <Text style={[styles.cardBack, { color: C.textSub }]}>{backDisplay}</Text>
          ) : null}
          {backMedia.map((item) => (
            <CardSideMedia
              key={item.media_id}
              url={item.url}
              kind={item.media_type}
              layout="list"
            />
          ))}
        </>
      ) : null}

      {/* Actions */}
      {(isOwner || canReport) && (
        <View style={[styles.cardActionsRow, { borderTopColor: C.borderLight }]}>
          {isOwner ? (
            <>
              <Pressable style={styles.cardActEdit} onPress={onEdit} hitSlop={6}>
                <Feather name="edit-2" size={14} color="#4255ff" />
                <Text style={styles.cardActEditTxt}>{t("edit")}</Text>
              </Pressable>
              <Pressable style={styles.cardActDel} onPress={onDelete} hitSlop={6}>
                <Feather name="trash-2" size={14} color="#dc2626" />
              </Pressable>
            </>
          ) : canReport ? (
            <Pressable style={styles.cardActReport} onPress={onReport} hitSlop={6}>
              <Feather name="flag" size={14} color="#dc2626" />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

/* ═══════════════════ STYLES ═══════════════════ */
const styles = StyleSheet.create({
  root: { flex: 1 },
  contentOuter: { alignSelf: "stretch", alignItems: "center", paddingBottom: 40 },
  pageWrap: { alignSelf: "center", paddingHorizontal: 0 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorMsg: { fontSize: 16, color: "#6b7280", textAlign: "center", paddingHorizontal: 32 },
  backBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, backgroundColor: "#eef0ff" },
  backBtnTxt: { color: "#6366f1", fontWeight: "600" },

  /* ── HERO ── */
  hero: {
    alignSelf: "stretch",
    width: "100%",
    minHeight: 160,
    backgroundColor: "#C6E3ED",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 36,
    overflow: "hidden",
    position: "relative",
  },
  heroWithCoverFixed: {
    minHeight: undefined,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  heroImageStrip: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  heroCoverImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroContentOnCover: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 12,
    zIndex: 1,
  },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.38)" },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#C6E3ED",
  },
  /* decorative soft circle */
  heroBadgeRow: { flexDirection: "row", gap: 8, marginBottom: 10, zIndex: 1 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  badgePublic: { backgroundColor: "rgba(5,150,105,0.12)", borderWidth: 1, borderColor: "rgba(5,150,105,0.25)" },
  badgePrivate: { backgroundColor: "rgba(71,85,105,0.1)", borderWidth: 1, borderColor: "rgba(71,85,105,0.2)" },
  badgeOnCover: { backgroundColor: "rgba(0,0,0,0.52)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  badgeTxt: { fontSize: 12, fontWeight: "600" },
  badgeTxtPublic: { color: "#047857" },
  badgeTxtPrivate: { color: "#475569" },
  badgeTxtOnCover: { color: "#fff", textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  badgeCopy: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(99,102,241,0.1)", borderWidth: 1, borderColor: "rgba(99,102,241,0.22)",
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
  },
  badgeTxtCopy: { fontSize: 12, fontWeight: "600", color: "#4f46e5" },
  heroTitle: { fontSize: 26, fontWeight: "800", color: "#1e293b", letterSpacing: 0.1, zIndex: 1 },
  heroTitleOnCover: { color: "#fff", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  heroDesc: { marginTop: 6, fontSize: 14, color: "#334155", lineHeight: 20, zIndex: 1 },
  heroDescOnCover: { color: "rgba(255,255,255,0.85)", textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  /* ── STATS ── */
  statsRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: "#fff",
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
    shadowColor: "#4255ff", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
  },
  statsDivider: { width: 1, height: 40, backgroundColor: "#f0f1f5" },
  statChip: { flex: 1, alignItems: "center", gap: 4, minWidth: 0, paddingHorizontal: 2 },
  statChipValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  statChipInfoSpacer: {
    width: 17,
    height: 17,
  },
  statChipInfoBtn: {
    width: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  statChipValue: { fontSize: 18, fontWeight: "800", textAlign: "center" },
  statChipLabel: { fontSize: 11, color: "#9ca3af", fontWeight: "500", textAlign: "center" },

  /* ── PROGRESS ── */
  progressWrap: { marginHorizontal: 16, marginTop: 12 },
  progressTrack: { height: 6, borderRadius: 999, backgroundColor: "#e8eaee", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999, backgroundColor: "#059669" },

  /* ── ACTIONS ── */
  actions: { marginHorizontal: 16, marginTop: 16, gap: 10 },
  actionRowPrimary: { flexDirection: "row", gap: 10 },
  actionRowPrimaryStack: { flexDirection: "column", width: "100%" },
  actionRowSecondary: { flexDirection: "row", gap: 10, width: "100%" },
  actionRowSecondaryWrap: {
    flexWrap: "wrap",
    width: "100%",
    justifyContent: "space-between",
    rowGap: 10,
    columnGap: 10,
  },
  actionBtnGridHalf: {
    width: "48%",
    maxWidth: "48%",
    flexGrow: 0,
    flexShrink: 0,
  },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 14, minHeight: 50,
    shadowColor: "#6366f1", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 2,
  },
  actionBtnCompact: {
    flexDirection: "column",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    minHeight: 76,
    justifyContent: "center",
  },
  actionBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
  actionBtnNoIcon: { gap: 0 },
  actionBtnTxt: { fontSize: 13, fontWeight: "700", textAlign: 'center', flexShrink: 1 },
  actionBtnTxtNoIcon: { fontSize: 15 },
  actionBtnTxtCompact: { fontSize: 11, lineHeight: 14 },

  /* ── CARDS SECTION ── */
  cardsSection: { marginHorizontal: 16, marginTop: 24 },
  cardsSectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 14,
  },
  cardsSectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  cardsSectionCount: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },

  cardsNoResults: { alignItems: "center", paddingVertical: 36, gap: 12 },
  cardsNoResultsTxt: { fontSize: 15, textAlign: "center", paddingHorizontal: 24 },
  cardsClearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    marginTop: 4,
  },
  cardsClearBtnTxt: { fontSize: 14, fontWeight: "600" },

  /* ── Empty state ── */
  emptyCards: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyCardsIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(99,102,241,0.08)", alignItems: "center", justifyContent: "center",
  },
  emptyCardsTitle: { fontSize: 16, color: "#9ca3af" },
  emptyCardsBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#6366f1", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4,
  },
  emptyCardsBtnTxt: { color: "#fff", fontWeight: "600" },

  /* ── Cards list (single column or balanced two columns) ── */
  cardsGrid: { gap: 10 },
  cardsGridSingleCol: { gap: 10 },
  cardsTwoColumns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardsColumn: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },

  /* ── Card Tile ── */
  cardTile: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#4255ff",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },

  cardTileHeader: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", marginBottom: 10,
    flexWrap: "wrap", gap: 6,
  },
  cardNumBadge: {
    alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 999,
  },
  cardNumTxt: { fontSize: 12, fontWeight: "700" },
  cardAuthorRow: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#f3f4f6", borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  cardAuthorTxt: { fontSize: 11, color: "#6b7280", fontWeight: "500" },

  cardMedia: { width: "100%", height: 100, borderRadius: 10, marginBottom: 8, backgroundColor: "#f3f4f6" },
  cardMediaAudio: { alignItems: "center", justifyContent: "center" },

  cardFront: { fontSize: 17, fontWeight: "700", color: "#111827", lineHeight: 24, marginBottom: 10, textAlign: "center" },
  cardClozeGap: { fontStyle: "italic", fontWeight: "600" },
  cardClozeGapHint: { fontStyle: "italic", fontWeight: "500" },
  cardClozeAnswer: { fontWeight: "800", color: "#059669" },

  cardDividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 12, gap: 8 },
  cardDividerLine: { flex: 1, height: 1 },
  cardDividerArrow: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },

  cardBack: { fontSize: 15, color: "#4b5563", lineHeight: 22, marginBottom: 10, textAlign: "center" },

  cardNotesRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 },
  cardNotes: { fontSize: 13, color: "#9ca3af", fontStyle: "italic", lineHeight: 18, textAlign: "center" },

  cardActionsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  cardActEdit: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: "rgba(99,102,241,0.08)" },
  cardActEditTxt: { fontSize: 13, color: "#6366f1", fontWeight: "600" },
  cardActDel: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(220,38,38,0.07)" },
  cardActReport: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(220,38,38,0.07)", marginLeft: "auto" as any },

  /* ── Collaborator badge (for co-authors) ── */
  collaboratorBadge: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "rgba(99,102,241,0.08)", borderWidth: 1, borderColor: "rgba(99,102,241,0.2)",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  collaboratorBadgeTxt: { fontSize: 14, color: "#6366f1", fontWeight: "600" },

  /* ── Collaborators section ── */
  collabSection: {
    marginHorizontal: 16, marginTop: 24,
    backgroundColor: "#fff", borderRadius: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
    overflow: "hidden",
  },
  collabToggleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
  },
  collabToggleLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  collabToggleIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: "#EEF2FF",
    justifyContent: "center", alignItems: "center",
  },
  collabToggleTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  collabToggleBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: "#6366f1",
    justifyContent: "center", alignItems: "center",
    paddingHorizontal: 5,
  },
  collabToggleBadgeTxt: { fontSize: 11, fontWeight: "700", color: "#fff" },
  collabBody: {
    borderTopWidth: 1, borderTopColor: "#f3f4f6",
    padding: 16, gap: 12,
  },
  inviteRow: { gap: 8 },
  inviteInputWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#f7f8fb", borderRadius: 12,
    borderWidth: 1.5, borderColor: "#e8eaee",
    paddingHorizontal: 12, paddingVertical: 10,
  },
  inviteInput: {
    flex: 1, fontSize: 14, color: "#111827", paddingVertical: 0,
  },
  searchResultsList: {
    borderRadius: 12, borderWidth: 1, borderColor: "#e8eaee",
    overflow: "hidden",
  },
  searchResultItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
    backgroundColor: "#fff",
  },
  searchResultAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(99,102,241,0.12)",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  searchResultAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  searchResultAvatarTxt: { fontSize: 15, fontWeight: "700", color: "#6366f1" },
  searchResultName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  searchResultUsername: { fontSize: 12, color: "#9ca3af" },
  inviteBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#6366f1", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  inviteBtnDone: { backgroundColor: "rgba(5,150,105,0.1)", borderWidth: 1, borderColor: "rgba(5,150,105,0.25)" },
  inviteBtnPending: { backgroundColor: "rgba(217,119,6,0.1)", borderWidth: 1, borderColor: "rgba(217,119,6,0.25)" },
  inviteBtnTxt: { fontSize: 13, fontWeight: "600", color: "#fff" },
  inviteBtnTxtDone: { color: "#059669" },
  inviteBtnTxtPending: { color: "#d97706" },
  inviteMsg: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
  },
  inviteMsgOk: { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "rgba(5,150,105,0.2)" },
  inviteMsgErr: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "rgba(220,38,38,0.2)" },
  inviteMsgTxt: { fontSize: 13, fontWeight: "500" },
  inviteMsgTxtOk: { color: "#059669" },
  inviteMsgTxtErr: { color: "#dc2626" },
  noCollabTxt: { fontSize: 14, color: "#9ca3af", textAlign: "center", paddingVertical: 12 },
  collabList: { gap: 2 },
  collabItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
  },
  collabAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: "rgba(99,102,241,0.12)",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  collabAvatarPending: { backgroundColor: "rgba(217,119,6,0.12)", opacity: 0.75 },
  collabAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  collabAvatarTxt: { fontSize: 16, fontWeight: "700", color: "#6366f1" },
  collabName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  collabMeta: { fontSize: 12, color: "#9ca3af" },
  collabRemoveBtn: {
    width: 34, height: 34, borderRadius: 8,
    backgroundColor: "rgba(220,38,38,0.07)",
    alignItems: "center", justifyContent: "center",
  },
  pendingBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "rgba(217,119,6,0.1)",
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: "rgba(217,119,6,0.25)",
  },
  pendingBadgeTxt: { fontSize: 10, fontWeight: "600", color: "#d97706" },
});
