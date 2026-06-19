import Feather from '@expo/vector-icons/Feather';
import { User } from '@supabase/supabase-js';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { Deck } from '@/assets/data/decks';
import { getNextSrsDayBoundary, getSrsDayStart } from '@/src/lib/srsDayBoundary';
import { supabase } from '@/src/lib/supabase';
import { CommentComplaintModal, type CommentComplaintTarget } from '@/src/components/CommentComplaintModal';
import { Text } from '@/src/components/Themed';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useStudySettings } from '@/src/contexts/StudySettingsContext';
import { useAppColors } from '@/src/contexts/ThemeContext';

type RatingRow = {
  user_id: string;
  rating: number;
  created_at?: string;
};

type CommentRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

/** One row per user: rating + latest comment (one comment per user per deck in practice). */
type FeedEntry = {
  userId: string;
  rating: number | null;
  ratingAt?: string;
  comment: string | null;
  commentId: string | null;
  commentAt?: string;
};

function buildFeedEntries(rows: RatingRow[], commentRows: CommentRow[]): FeedEntry[] {
  const latestCommentByUser = new Map<string, CommentRow>();
  for (const c of commentRows) {
    const prev = latestCommentByUser.get(c.user_id);
    if (!prev || parseTime(c.created_at) > parseTime(prev.created_at)) {
      latestCommentByUser.set(c.user_id, c);
    }
  }

  const ratingByUser = new Map<string, RatingRow>();
  for (const r of rows) {
    if (!ratingByUser.has(r.user_id)) {
      ratingByUser.set(r.user_id, r);
    }
  }

  const userIds = new Set<string>();
  for (const r of rows) userIds.add(r.user_id);
  for (const c of commentRows) userIds.add(c.user_id);

  const entries: FeedEntry[] = [];
  for (const uid of userIds) {
    const rat = ratingByUser.get(uid);
    const com = latestCommentByUser.get(uid);
    entries.push({
      userId: uid,
      rating: rat ? Number(rat.rating) : null,
      ratingAt: rat?.created_at,
      comment: com?.content ?? null,
      commentId: com?.id ?? null,
      commentAt: com?.created_at,
    });
  }
  return entries;
}

function entryActivityAt(e: FeedEntry): number {
  const times = [parseTime(e.ratingAt), parseTime(e.commentAt)].filter((t) => t > 0);
  return times.length ? Math.max(...times) : 0;
}

function entryActivityIso(e: FeedEntry): string | undefined {
  const t = entryActivityAt(e);
  return t > 0 ? new Date(t).toISOString() : undefined;
}

type DateFilter = 'all' | 'today' | 'week' | 'month';
type SortOrder = 'newest' | 'oldest';

function parseTime(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function inDateFilter(
  iso: string | undefined,
  filter: DateFilter,
  srsDayStartHour: number
): boolean {
  if (filter === 'all' || !iso) return true;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return true;
  const now = new Date();
  const srsStart = getSrsDayStart(now, srsDayStartHour).getTime();
  const t = d.getTime();
  if (filter === 'today') {
    const end = getNextSrsDayBoundary(now, srsDayStartHour).getTime();
    return t >= srsStart && t < end;
  }
  if (filter === 'week') {
    const weekAgo = srsStart - 7 * 24 * 60 * 60 * 1000;
    return t >= weekAgo;
  }
  if (filter === 'month') {
    const monthAgo = new Date(now);
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return t >= monthAgo.getTime();
  }
  return true;
}

function FilterChips({
  t,
  dateFilter,
  setDateFilter,
  sort,
  setSort,
}: {
  t: (k: string) => string;
  dateFilter: DateFilter;
  setDateFilter: (v: DateFilter) => void;
  sort: SortOrder;
  setSort: (v: SortOrder) => void;
}) {
  const C = useAppColors();
  const chipBase = { backgroundColor: C.surface, borderColor: C.border };
  return (
    <View style={chipStyles.chipsWrap}>
      <View style={chipStyles.chipsRow}>
        <Text style={chipStyles.chipsLabel}>{t('filterBy')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={chipStyles.chipsScroll}>
          {(
            [
              ['all', t('filterAll')],
              ['today', t('filterToday')],
              ['week', t('filterWeek')],
              ['month', t('filterMonth')],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              style={[chipStyles.chip, chipBase, dateFilter === key && chipStyles.chipActive]}
              onPress={() => setDateFilter(key)}
            >
              <Text style={[chipStyles.chipText, dateFilter === key && chipStyles.chipTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={chipStyles.chipsRow}>
        <Text style={chipStyles.chipsLabel}>{t('sortBy')}</Text>
        <View style={chipStyles.sortRow}>
          <Pressable style={[chipStyles.chip, chipBase, sort === 'newest' && chipStyles.chipActive]} onPress={() => setSort('newest')}>
            <Text style={[chipStyles.chipText, sort === 'newest' && chipStyles.chipTextActive]}>{t('sortNewest')}</Text>
          </Pressable>
          <Pressable style={[chipStyles.chip, chipBase, sort === 'oldest' && chipStyles.chipActive]} onPress={() => setSort('oldest')}>
            <Text style={[chipStyles.chipText, sort === 'oldest' && chipStyles.chipTextActive]}>{t('sortOldest')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

}

const chipStyles = StyleSheet.create({
  chipsWrap: {
    gap: 8,
    marginBottom: 4,
  },
  chipsRow: {
    gap: 6,
  },
  chipsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: {
    borderColor: '#4255ff',
    backgroundColor: 'rgba(66, 85, 255, 0.1)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#4255ff',
  },
});

async function buildDisplayNameMap(
  userIds: string[],
  currentUser: User | null,
  tYou: string,
  tUnknown: string,
): Promise<Record<string, string>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  const out: Record<string, string> = {};

  if (unique.length > 0) {
    // Use SECURITY DEFINER RPC to read usernames from auth.users metadata
    const { data } = await supabase.rpc('get_users_display_names', {
      p_user_ids: unique,
    });
    for (const row of (data ?? []) as { user_id: string; display_name: string }[]) {
      if (row.user_id && row.display_name?.trim()) {
        out[row.user_id] = row.display_name.trim();
      }
    }
  }

  // Always show current user's own name from their session metadata
  if (currentUser?.id) {
    const meta = (currentUser.user_metadata?.username as string | undefined)?.trim();
    const fromEmail = currentUser.email?.includes('@') ? currentUser.email.split('@')[0] : '';
    const selfLabel = meta || fromEmail || tYou;
    out[currentUser.id] = out[currentUser.id] || selfLabel;
  }

  for (const id of unique) {
    if (!out[id]) {
      out[id] = tUnknown;
    }
  }

  return out;
}

export default function DeckRateScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const deckId = typeof params.id === 'string' ? params.id : null;

  const { user } = useAuth();
  const { t } = useLanguage();
  const { settings: studySettings } = useStudySettings();
  const C = useAppColors();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [avgRating, setAvgRating] = useState<number>(0);
  const [ratingCount, setRatingCount] = useState<number>(0);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [loadedMyRating, setLoadedMyRating] = useState<number | null>(null);
  const [ratingRows, setRatingRows] = useState<RatingRow[]>([]);

  const [commentText, setCommentText] = useState('');
  const [loadedMyComment, setLoadedMyComment] = useState('');
  const [myCommentId, setMyCommentId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
  const [reportComment, setReportComment] = useState<CommentComplaintTarget | null>(null);

  const [feedSort, setFeedSort] = useState<SortOrder>('newest');
  const [feedDateFilter, setFeedDateFilter] = useState<DateFilter>('all');

  const loadData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;

    if (!deckId) {
      setError(t('deckNotFound'));
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) setLoading(true);
    setError(null);
    setSubmitError(null);

    const [{ data: deckData, error: deckError }, { data: ratingsData }, { data: commentsData }] = await Promise.all([
      supabase.from('decks').select('*').eq('deck_id', deckId).single(),
      supabase.from('pack_ratings').select('user_id,rating,created_at').eq('deck_id', deckId),
      supabase
        .from('pack_comments')
        .select('id,user_id,content,created_at')
        .eq('deck_id', deckId)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (deckError) {
      setError(deckError.message ?? t('failedToLoadData'));
      setDeck(null);
      setAvgRating(0);
      setRatingCount(0);
      setMyRating(null);
      setLoadedMyRating(null);
      setRatingRows([]);
      setComments([]);
      setNameByUserId({});
      setLoadedMyComment('');
      setMyCommentId(null);
      setCommentText('');
      if (!silent) setLoading(false);
      return;
    }

    setDeck(deckData as Deck);

    const rows = (ratingsData ?? []) as RatingRow[];
    setRatingRows(rows);

    if (rows.length === 0) {
      setAvgRating(0);
      setRatingCount(0);
      setMyRating(null);
      setLoadedMyRating(null);
    } else {
      const sum = rows.reduce((acc, r) => acc + Number(r.rating ?? 0), 0);
      setRatingCount(rows.length);
      setAvgRating(sum / rows.length);

      if (user?.id) {
        const mine = rows.find((r) => r.user_id === user.id);
        const val = mine ? Number(mine.rating) : null;
        setMyRating(val);
        setLoadedMyRating(val);
      } else {
        setMyRating(null);
        setLoadedMyRating(null);
      }
    }

    const commentRows = (commentsData ?? []) as CommentRow[];
    setComments(commentRows);

    if (user?.id) {
      const mineComments = commentRows
        .filter((c) => c.user_id === user.id)
        .sort((a, b) => parseTime(b.created_at) - parseTime(a.created_at));
      const latestMine = mineComments[0];
      if (latestMine) {
        setMyCommentId(latestMine.id);
        setLoadedMyComment(latestMine.content);
        setCommentText(latestMine.content);
      } else {
        setMyCommentId(null);
        setLoadedMyComment('');
        setCommentText('');
      }
    } else {
      setMyCommentId(null);
      setLoadedMyComment('');
      setCommentText('');
    }

    const idsFromRatings = rows.map((r) => r.user_id);
    const idsFromComments = commentRows.map((c) => c.user_id);
    const allIds = [...idsFromRatings, ...idsFromComments];

    const names = await buildDisplayNameMap(allIds, user ?? null, t('you'), t('unknownUser'));
    setNameByUserId(names);

    if (!silent) setLoading(false);
  }, [deckId, t, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('rateComment'),
    });
  }, [navigation, t]);

  const displayName = useCallback(
    (uid: string) => {
      if (user?.id && uid === user.id) {
        return nameByUserId[uid] ?? t('you');
      }
      return nameByUserId[uid] ?? t('unknownUser');
    },
    [nameByUserId, t, user?.id],
  );

  const feedEntries = useMemo(() => buildFeedEntries(ratingRows, comments), [ratingRows, comments]);

  const filteredFeed = useMemo(() => {
    let list = feedEntries.filter((e) =>
      inDateFilter(entryActivityIso(e), feedDateFilter, studySettings.srsDayStartHour)
    );
    list = [...list].sort((a, b) => {
      const ta = entryActivityAt(a);
      const tb = entryActivityAt(b);
      return feedSort === 'newest' ? tb - ta : ta - tb;
    });
    return list;
  }, [feedEntries, feedDateFilter, feedSort, studySettings.srsDayStartHour]);

  const canSubmit = useMemo(() => {
    if (!user) return false;
    const commentChanged = commentText.trim() !== loadedMyComment.trim();
    const a = myRating;
    const b = loadedMyRating;
    const ratingChanged =
      (a === null) !== (b === null) || (a !== null && b !== null && Number(a) !== Number(b));
    return (commentChanged || ratingChanged) && !submitting;
  }, [user, commentText, loadedMyComment, myRating, loadedMyRating, submitting]);

  const hasSavedReview = loadedMyRating !== null || loadedMyComment.trim().length > 0;

  const handleSubmit = useCallback(async () => {
    if (!user) {
      setSubmitError(t('mustBeLoggedIn'));
      return;
    }
    if (!deckId) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Always upsert when a star value is set so the DB stays in sync (e.g. after edits that only touch the comment).
      if (myRating !== null) {
        const { error: ratingErr } = await supabase.from('pack_ratings').upsert(
          {
            user_id: user.id,
            deck_id: deckId,
            rating: myRating,
          },
          { onConflict: 'user_id,deck_id' },
        );

        if (ratingErr) {
          throw new Error(ratingErr.message ?? t('failedToLoadData'));
        }
      }

      const trimmed = commentText.trim();
      // Update/delete by (deck_id, user_id): PostgREST returns no error when .eq('id', …) matches 0 rows,
      // so updating by primary id alone can fail silently if id shape/column differs from the DB.
      if (trimmed.length === 0) {
        const { error: delErr } = await supabase
          .from('pack_comments')
          .delete()
          .eq('deck_id', deckId)
          .eq('user_id', user.id);
        if (delErr) {
          throw new Error(delErr.message ?? t('failedToLoadData'));
        }
      } else {
        const { data: updatedRows, error: updErr } = await supabase
          .from('pack_comments')
          .update({ content: trimmed })
          .eq('deck_id', deckId)
          .eq('user_id', user.id)
          .select('id');

        if (updErr) {
          throw new Error(updErr.message ?? t('failedToLoadData'));
        }

        if (!updatedRows?.length) {
          const { error: insErr } = await supabase.from('pack_comments').insert({
            user_id: user.id,
            deck_id: deckId,
            content: trimmed,
          });
          if (insErr) {
            throw new Error(insErr.message ?? t('failedToLoadData'));
          }
        }
      }

      await loadData({ silent: true });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : t('unexpectedError'));
    } finally {
      setSubmitting(false);
    }
  }, [commentText, deckId, loadData, myRating, loadedMyRating, t, user]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color="#4255ff" />
      </View>
    );
  }

  if (error || !deck) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <Text style={styles.errorText}>{error ?? t('deckNotFound')}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
          <Text style={styles.btnText}>{t('goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const stars = [1, 2, 3, 4, 5];

  return (
    <>
    <ScrollView style={[styles.container, { backgroundColor: C.bg }]} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.hero, { backgroundColor: C.surface }]}>
        <View style={{ gap: 6 }}>
          <Text style={styles.heroTitle}>{deck.title}</Text>
          <Text style={styles.heroSub}>
            {ratingCount > 0 ? `${avgRating.toFixed(1)} • ${ratingCount} ${t('ratings')}` : t('noRatingsYet')}
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: C.surface }]}>
        <Text style={styles.sectionLabel}>{t('yourRating')}</Text>
        <View style={styles.starRow}>
          {stars.map((n) => {
            const active = myRating !== null ? myRating >= n : false;
            return (
              <Pressable key={n} onPress={() => setMyRating(n)} hitSlop={8} style={styles.starBtn}>
                <Feather name="star" size={22} color={active ? '#f59e0b' : '#cbd5e1'} />
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.divider, { backgroundColor: C.borderLight }]} />

        <Text style={styles.sectionLabel}>{t('comment')}</Text>
        <TextInput
          style={[styles.commentInput, { backgroundColor: C.inputBg, borderColor: C.inputBorder, color: C.text }]}
          value={commentText}
          onChangeText={setCommentText}
          placeholder={t('commentPlaceholder')}
          placeholderTextColor={C.placeholder}
          multiline
        />

        {submitError ? (
          <View style={styles.errorBoxRow}>
            <Feather name="alert-circle" size={14} color="#dc2626" />
            <Text style={styles.errorBoxText}>{submitError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.btnSubmit, !canSubmit && styles.btnSubmitDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.btnSubmitText}>{hasSavedReview ? t('update') : t('save')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t('reviewsFeed')}</Text>
      </View>
      <FilterChips
        t={t}
        dateFilter={feedDateFilter}
        setDateFilter={setFeedDateFilter}
        sort={feedSort}
        setSort={setFeedSort}
      />

      {filteredFeed.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: C.surface }]}>
          <Text style={styles.emptyText}>{t('noReviewsYet')}</Text>
        </View>
      ) : (
        filteredFeed.map((entry) => {
          const when = entryActivityIso(entry);
          return (
            <View key={entry.userId} style={[styles.reviewCard, { backgroundColor: C.surface }]}>
              <View style={styles.commentTopRow}>
                <Text style={styles.commentAuthor}>{displayName(entry.userId)}</Text>
                <View style={styles.commentTopRight}>
                  {user?.id &&
                  entry.commentId &&
                  entry.comment?.trim() &&
                  entry.userId !== user.id ? (
                    <TouchableOpacity
                      onPress={() =>
                        entry.commentId &&
                        setReportComment({
                          id: entry.commentId,
                          content: entry.comment.trim(),
                          user_id: entry.userId,
                        })
                      }
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('reportReview')}
                    >
                      <Feather name="flag" size={16} color={C.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                  <Text style={styles.commentDate}>{when ? new Date(when).toLocaleString() : ''}</Text>
                </View>
              </View>
              {entry.rating !== null ? (
                <View style={styles.starRowSmall}>
                  {stars.map((n) => {
                    const rv = entry.rating as number;
                    return (
                      <Feather key={n} name="star" size={16} color={rv >= n ? '#f59e0b' : '#e5e7eb'} />
                    );
                  })}
                  <Text style={styles.ratingNum}>{entry.rating}/5</Text>
                </View>
              ) : null}
              {entry.comment ? <Text style={styles.commentContent}>{entry.comment}</Text> : null}
            </View>
          );
        })
      )}
    </ScrollView>
    <CommentComplaintModal
      visible={Boolean(reportComment && deck)}
      deck={deck}
      comment={reportComment}
      reporterId={user?.id ?? null}
      onClose={() => setReportComment(null)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 14,
  },
  hero: {
    borderRadius: 18,
    padding: 18,
    gap: 8,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  heroSub: {
    fontSize: 13,
    color: '#6b7280',
  },
  card: {
    borderRadius: 18,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  starRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  starRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  ratingNum: {
    marginLeft: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#f59e0b',
  },
  starBtn: {
    padding: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f1f5',
    marginVertical: 2,
  },
  commentInput: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    minHeight: 96,
  },
  errorBoxRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorBoxText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  btnSubmit: {
    marginTop: 4,
    borderRadius: 14,
    paddingVertical: 14,
    backgroundColor: '#4255ff',
    alignItems: 'center',
  },
  btnSubmitDisabled: {
    opacity: 0.5,
  },
  btnSubmitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  btn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: '#4255ff',
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  empty: {
    borderRadius: 18,
    padding: 18,
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
  reviewCard: {
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  commentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  commentTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  commentDate: {
    fontSize: 11,
    color: '#9ca3af',
  },
  commentContent: {
    fontSize: 14,
  },
  errorText: {
    color: '#6b7280',
    textAlign: 'center',
  },
});
