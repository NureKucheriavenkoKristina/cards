import 'react-native-url-polyfill/auto';
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, TouchableOpacity, View as RNView } from 'react-native';

import { Deck } from '@/assets/data/decks';
import { compareDeckTitles } from '@/src/lib/deckSort';
import { supabase } from '@/src/lib/supabase';
import ConfirmModal from '@/src/components/ConfirmModal';
import ListOfDecks from '@/src/components/ListOfDecks';
import { Text, View } from '@/src/components/Themed';
import { useColorScheme } from '@/src/components/useColorScheme';
import Colors from '@/src/constants/Colors';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAppColors } from '@/src/contexts/ThemeContext';

type SortKey =
  | 'newest'
  | 'oldest'
  | 'titleAsc'
  | 'titleDesc'
  | 'ratingAsc'
  | 'ratingDesc'
  | 'cards';

export default function MainScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const colorScheme = useColorScheme();
  const C = useAppColors();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [collaboratedDeckIds, setCollaboratedDeckIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cardCounts, setCardCounts] = useState<Record<string, number>>({});
  const [ratingByDeckId, setRatingByDeckId] = useState<Record<string, number>>({});
  const [ratingCountByDeckId, setRatingCountByDeckId] = useState<Record<string, number>>({});
  const [deckToDelete, setDeckToDelete] = useState<Deck | null>(null);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');

  const loadDecks = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setDecks([]);
      setCardCounts({});
      setRatingByDeckId({});
      setRatingCountByDeckId({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const [{ data: decksData, error: decksError }, { data: cardsData }, { data: collabData }] =
      await Promise.all([
        supabase
          .from('decks')
          .select('*')
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false }),
        supabase.from('cards').select('deck_id'),
        supabase.rpc('get_collaborated_decks'),
      ]);

    if (decksError) {
      setError('Failed to load decks');
      setDecks([]);
      setCardCounts({});
      setRatingByDeckId({});
      setRatingCountByDeckId({});
      setLoading(false);
      return;
    }

    // Merge own decks + collaborated decks (avoid duplicates)
    const ownDecks = (decksData ?? []) as Deck[];
    const collabDecks = (collabData ?? []) as Deck[];
    const collabIds = new Set(collabDecks.map((d) => d.deck_id));
    const uniqueCollabDecks = collabDecks.filter((d) => !ownDecks.some((o) => o.deck_id === d.deck_id));
    const deckList = [...ownDecks, ...uniqueCollabDecks];
    setCollaboratedDeckIds(collabIds);

    const deckIds = deckList.map((d) => d.deck_id);
    setDecks(deckList);

    const counts: Record<string, number> = {};
    if (cardsData) {
      for (const c of cardsData) {
        const did = c.deck_id as string;
        counts[did] = (counts[did] ?? 0) + 1;
      }
    }
    setCardCounts(counts);

    if (deckIds.length > 0) {
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('pack_ratings')
        .select('deck_id, rating')
        .in('deck_id', deckIds);

      if (!ratingsError && ratingsData) {
        const sumByDeck: Record<string, number> = {};
        const countByDeck: Record<string, number> = {};

        for (const r of ratingsData) {
          const did = r.deck_id as string;
          const rating = r.rating as number;
          sumByDeck[did] = (sumByDeck[did] ?? 0) + rating;
          countByDeck[did] = (countByDeck[did] ?? 0) + 1;
        }

        const avgByDeck: Record<string, number> = {};
        for (const did of Object.keys(countByDeck)) {
          avgByDeck[did] = sumByDeck[did] / countByDeck[did];
        }

        setRatingByDeckId(avgByDeck);
        setRatingCountByDeckId(countByDeck);
      } else {
        setRatingByDeckId({});
        setRatingCountByDeckId({});
      }
    } else {
      setRatingByDeckId({});
      setRatingCountByDeckId({});
    }
    setLoading(false);
  }, [user, authLoading]);

  useEffect(() => {
    loadDecks();
  }, [loadDecks]);

  useFocusEffect(
    useCallback(() => {
      loadDecks();
    }, [loadDecks])
  );

  const handlePressDeck = (deck: Deck) => {
    router.push(`/deck-detail?id=${deck.deck_id}`);
  };

  const handleEditDeck = (deck: Deck) => {
    if (collaboratedDeckIds.has(deck.deck_id)) {
      setErrorModal(t('collaboratorCannotEdit'));
      return;
    }
    router.push(`/add-deck?deckId=${deck.deck_id}`);
  };

  const handleDeleteDeck = (deck: Deck) => {
    if (collaboratedDeckIds.has(deck.deck_id)) {
      setErrorModal(t('collaboratorCannotEdit'));
      return;
    }
    setDeckToDelete(deck);
  };

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'newest', label: t('newest') },
    { key: 'oldest', label: t('oldest') },
    { key: 'titleAsc', label: t('sortTitleAZ') },
    { key: 'titleDesc', label: t('sortTitleZA') },
    { key: 'ratingDesc', label: t('sortRatingDesc') },
    { key: 'ratingAsc', label: t('sortRatingAsc') },
    { key: 'cards', label: t('cards') },
  ];

  const performDeleteDeck = async () => {
    if (!deckToDelete) return;
    setDeckToDelete(null);
    await supabase.from('cards').delete().eq('deck_id', deckToDelete.deck_id);
    const { error } = await supabase.from('decks').delete().eq('deck_id', deckToDelete.deck_id);
    if (error) {
      setErrorModal(error.message || 'Failed to delete deck.');
    } else {
      loadDecks();
    }
  };

  const filteredAndSortedDecks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return [...decks]
      .filter((deck) => {
        if (visibilityFilter === 'public' && !deck.is_public) return false;
        if (visibilityFilter === 'private' && deck.is_public) return false;

        if (!normalizedQuery) return true;

        const title = (deck.title ?? '').toLowerCase();
        const description = (deck.description ?? '').toLowerCase();
        return title.includes(normalizedQuery) || description.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sortBy === 'oldest') {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortBy === 'titleAsc') {
          return compareDeckTitles(a, b);
        }
        if (sortBy === 'titleDesc') {
          return compareDeckTitles(b, a);
        }
        if (sortBy === 'ratingDesc' || sortBy === 'ratingAsc') {
          const countA = ratingCountByDeckId[a.deck_id] ?? 0;
          const countB = ratingCountByDeckId[b.deck_id] ?? 0;
          const avgA = countA > 0 ? (ratingByDeckId[a.deck_id] ?? 0) : null;
          const avgB = countB > 0 ? (ratingByDeckId[b.deck_id] ?? 0) : null;
          if (avgA === null && avgB === null) {
            return compareDeckTitles(a, b);
          }
          if (avgA === null) return 1;
          if (avgB === null) return -1;
          const diff = sortBy === 'ratingDesc' ? avgB - avgA : avgA - avgB;
          if (diff !== 0) {
            return diff > 0 ? 1 : -1;
          }
          return compareDeckTitles(a, b);
        }
        if (sortBy === 'cards') {
          return (cardCounts[b.deck_id] ?? 0) - (cardCounts[a.deck_id] ?? 0);
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [decks, searchQuery, sortBy, visibilityFilter, cardCounts, ratingByDeckId, ratingCountByDeckId]);

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4255ff" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : decks.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Feather name="layers" size={48} color="#c7d2fe" />
          </View>
          <Text style={styles.emptyTitle}>{t('noDecksYet')}</Text>
          <Text style={styles.emptySubtitle}>{t('createFirstDeck')}</Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push('/add-deck')}
            accessibilityRole="button"
          >
            <Feather name="plus" size={20} color="#fff" />
            <Text style={styles.emptyButtonText}>{t('createDeck')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.emptyButtonOutline, { borderColor: colorScheme === 'dark' ? '#6366f1' : '#4255ff' }]}
            onPress={() => router.push('/deck-import')}
            accessibilityRole="button"
            accessibilityLabel={t('importDeckFab')}
          >
            <Feather name="upload" size={20} color={colorScheme === 'dark' ? '#a5b4fc' : '#4255ff'} />
            <Text style={[styles.emptyButtonOutlineText, { color: colorScheme === 'dark' ? '#a5b4fc' : '#4255ff' }]}>
              {t('importDeckFab')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ListOfDecks
          decks={filteredAndSortedDecks}
          cardCounts={cardCounts}
          ratingByDeckId={ratingByDeckId}
          ratingCountByDeckId={ratingCountByDeckId}
          collaboratedDeckIds={collaboratedDeckIds}
          onPressDeck={handlePressDeck}
          onEditDeck={handleEditDeck}
          onDeleteDeck={handleDeleteDeck}
          listEmptyComponent={
            <RNView style={styles.searchEmpty}>
              <Text style={[styles.searchEmptyText, { color: colorScheme === 'dark' ? '#9ca3af' : '#6b7280' }]}>
                {t('noDecksFound')}
              </Text>
            </RNView>
          }
          listHeaderComponent={
            <>
              <RNView style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{t('yourDecks')}</Text>
                <Text style={styles.sectionCount}>
                  {filteredAndSortedDecks.length} {filteredAndSortedDecks.length !== 1 ? t('decks') : t('deck')}
                </Text>
              </RNView>
              <RNView style={styles.controlsContainer}>
                <RNView style={[
                  styles.searchContainer,
                  { backgroundColor: C.inputBg, borderColor: C.inputBorder },
                  searchFocused && (C.isDark
                    ? { borderColor: '#6366f1', backgroundColor: C.surface }
                    : styles.searchContainerFocused),
                ]}>
                  <Feather name="search" size={16} color={searchFocused ? C.tint : '#b0b8c8'} />
                  <TextInput
                    style={[styles.searchInput, { color: C.text }]}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={t('searchDecks')}
                    placeholderTextColor={C.placeholder}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                  />
                  {searchQuery.length > 0 ? (
                    <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                      <Feather name="x-circle" size={16} color="#d1d5db" />
                    </Pressable>
                  ) : null}
                </RNView>

                <RNView style={styles.controlBlock}>
                  <Text style={styles.chipsLabel}>{t('sortBy')}</Text>
                  <RNView style={styles.chipsRow}>
                    {sortOptions.map(({ key, label }) => (
                      <Pressable
                        key={key}
                        style={[
                          styles.chip,
                          { backgroundColor: C.surface, borderColor: C.border },
                          sortBy === key && {
                            borderColor: C.tint,
                            backgroundColor: C.isDark ? 'rgba(165,180,252,0.15)' : 'rgba(66,85,255,0.12)',
                          },
                        ]}
                        onPress={() => setSortBy(key)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: C.textSub },
                            sortBy === key && { color: C.tint, fontWeight: '600' },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </RNView>
                </RNView>

                <RNView style={styles.controlBlock}>
                  <Text style={styles.chipsLabel}>{t('filterBy')}</Text>
                  <RNView style={styles.chipsRow}>
                    {(['all', 'public', 'private'] as const).map((f) => (
                      <Pressable
                        key={f}
                        style={[
                          styles.chip,
                          { backgroundColor: C.surface, borderColor: C.border },
                          visibilityFilter === f && {
                            borderColor: C.tint,
                            backgroundColor: C.isDark ? 'rgba(165,180,252,0.15)' : 'rgba(66,85,255,0.12)',
                          },
                        ]}
                        onPress={() => setVisibilityFilter(f)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: C.textSub },
                            visibilityFilter === f && { color: C.tint, fontWeight: '600' },
                          ]}
                        >
                          {t(f)}
                        </Text>
                      </Pressable>
                    ))}
                  </RNView>
                </RNView>
              </RNView>
            </>
          }
        />
      )}

      {decks.length > 0 && (
        <>
          <TouchableOpacity
            style={[styles.importFab, { backgroundColor: colorScheme === 'dark' ? '#1e2235' : '#fff', borderColor: colorScheme === 'dark' ? '#3d3f6e' : '#4255ff' }]}
            onPress={() => router.push('/deck-import')}
            accessibilityRole="button"
            accessibilityLabel={t('importDeckFab')}
          >
            <Feather name="upload" size={22} color={colorScheme === 'dark' ? '#7b82c4' : '#4255ff'} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fab, colorScheme === 'dark' && styles.fabDark]}
            onPress={() => router.push('/add-deck')}
            accessibilityRole="button"
            accessibilityLabel={t('addDeck')}
          >
            <Feather name="plus" size={24} color="#fff" />
          </TouchableOpacity>
        </>
      )}

      <ConfirmModal
        visible={Boolean(deckToDelete)}
        title={t('deleteDeck')}
        message={t('deleteDeckConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        destructive
        icon="trash-2"
        onConfirm={performDeleteDeck}
        onCancel={() => setDeckToDelete(null)}
      />

      <ConfirmModal
        visible={Boolean(errorModal)}
        title={t('error')}
        message={errorModal ?? ''}
        confirmText={t('ok')}
        cancelText={null}
        onConfirm={() => setErrorModal(null)}
        onCancel={() => setErrorModal(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  errorText: {
    fontSize: 16,
    color: '#6b7280',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  sectionCount: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'right',
  },
  controlsContainer: {
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 10,
    paddingHorizontal: 0,
    paddingVertical: 0,
    gap: 10,
    maxWidth: '100%',
  },
  searchContainer: {
    height: 46,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#e8eaee',
    backgroundColor: '#f7f8fb',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchContainerFocused: {
    borderColor: '#1a1a1a',
    backgroundColor: '#fff',
    shadowColor: '#1a1a1a',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    paddingVertical: 0,
    // @ts-ignore — web-only
    outlineWidth: 0,
    outlineStyle: 'none',
  },
  controlBlock: {
    gap: 6,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipsLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    paddingVertical: 5,
    paddingHorizontal: 10,
    minWidth: 54,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: '#4255ff',
    backgroundColor: 'rgba(66, 85, 255, 0.12)',
  },
  chipText: {
    fontSize: 13,
  },
  chipTextActive: {
    color: '#4255ff',
    fontWeight: '600',
  },
  searchEmpty: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  searchEmptyText: {
    fontSize: 16,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(66, 85, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4255ff',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  emptyButtonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  emptyButtonOutlineText: {
    fontSize: 16,
    fontWeight: '600',
  },
  importFab: {
    position: 'absolute',
    right: 20,
    bottom: 96,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#4255ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4255ff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#4255ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  fabDark: {
    backgroundColor: '#3b3e7a',
    shadowColor: '#3b3e7a',
    shadowOpacity: 0.4,
  },
});
