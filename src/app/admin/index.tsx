import Feather from '@expo/vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

import { Text } from '@/src/components/Themed';
import ConfirmModal from '@/src/components/ConfirmModal';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { supabase } from '@/src/lib/supabase';
import { useAppColors } from '@/src/contexts/ThemeContext';
import { getComplaintIssueLabelKey } from '@/src/constants/deckComplaints';
import {
  moderationDisplayText,
  useModerationDisplayTranslations,
} from '@/src/lib/useModerationDisplayTranslations';

/* ─── Types ─── */
type Stats = {
  total_users: number;
  total_decks: number;
  total_cards: number;
  total_complaints: number;
  total_comments: number;
};

type Complaint = {
  id: string;
  created_at: string;
  issue_key: string;
  details: string | null;
  gemini_summary: string | null;
  deck_id: string;
  deck_title: string;
  reporter_id: string;
  reporter_name: string;
};

type CardComplaint = {
  id: string;
  created_at: string;
  issue_key: string;
  details: string | null;
  gemini_summary: string | null;
  card_id: string;
  card_front_text: string;
  deck_id: string;
  deck_title: string;
  reporter_id: string;
  reporter_name: string;
};

type CommentComplaint = {
  id: string;
  created_at: string;
  issue_key: string;
  details: string | null;
  gemini_summary: string | null;
  comment_id: string;
  comment_content: string;
  comment_content_uk: string | null;
  comment_author_id: string;
  deck_id: string;
  deck_title: string;
  reporter_id: string;
  reporter_name: string;
  comment_author_name: string;
};

type Comment = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  deck_id: string;
  username: string;
  deck_title: string;
};

type AdminUser = {
  user_id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  registration_date: string;
  is_admin: boolean;
  deck_count: number;
  last_sign_in: string | null;
};

type Tab = 'overview' | 'complaints' | 'comments' | 'users' | 'support';

type SupportMessage = {
  id: string;
  created_at: string;
  type: 'bug' | 'suggestion' | 'complaint';
  message: string;
  is_read: boolean;
  user_id: string;
  username: string;
  email: string;
};

/* ═══════════════════════════════════════ */
export default function AdminPanelScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { t, locale } = useLanguage();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const C = useAppColors();
  const { width: screenWidth } = useWindowDimensions();
  const isNarrow = screenWidth < 520;

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [cardComplaints, setCardComplaints] = useState<CardComplaint[]>([]);
  const [commentComplaints, setCommentComplaints] = useState<CommentComplaint[]>([]);
  const [complaintFilter, setComplaintFilter] = useState<'decks' | 'words' | 'reviews'>('decks');
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportFilter, setSupportFilter] = useState<'all' | 'unread' | 'bug' | 'suggestion' | 'complaint'>('all');
  const [supportToDelete, setSupportToDelete] = useState<SupportMessage | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Confirm modals
  const [commentToDelete, setCommentToDelete] = useState<Comment | null>(null);
  const [complaintToDismiss, setComplaintToDismiss] = useState<Complaint | null>(null);
  const [deckToDelete, setDeckToDelete] = useState<Complaint | null>(null);
  const [cardComplaintToDismiss, setCardComplaintToDismiss] = useState<CardComplaint | null>(null);
  const [cardToDelete, setCardToDelete] = useState<CardComplaint | null>(null);
  const [commentComplaintToDismiss, setCommentComplaintToDismiss] = useState<CommentComplaint | null>(null);
  const [commentComplaintReviewToDelete, setCommentComplaintReviewToDelete] = useState<CommentComplaint | null>(null);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('adminPanel') });
  }, [navigation, t]);

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/auth/login'); return; }
    if (!isAdmin) router.replace('/(tabs)');
  }, [authLoading, user, isAdmin, router]);

  /* ── Load data ── */
  const load = useCallback(async () => {
    if (!isAdmin) return;
    const [statsRes, complRes, cardComplRes, commentComplRes, commRes, usersRes, supportRes] = await Promise.all([
      supabase.rpc('admin_get_stats'),
      supabase.rpc('admin_get_all_complaints'),
      supabase.rpc('admin_get_all_card_complaints'),
      supabase.rpc('admin_get_all_comment_complaints'),
      supabase.rpc('admin_get_all_comments'),
      supabase.rpc('admin_get_all_users'),
      supabase.rpc('admin_get_all_support_messages'),
    ]);
    if (__DEV__) {
      if (statsRes.error)          console.warn('[admin] stats error', statsRes.error);
      if (complRes.error)          console.warn('[admin] complaints error', complRes.error);
      if (cardComplRes.error)       console.warn('[admin] card complaints error', cardComplRes.error);
      if (commentComplRes.error)   console.warn('[admin] comment complaints error', commentComplRes.error);
      if (commRes.error)           console.warn('[admin] comments error', commRes.error);
      if (usersRes.error)          console.warn('[admin] users error', usersRes.error);
      if (supportRes.error)        console.warn('[admin] support messages error', supportRes.error);
    }
    if (statsRes.data?.[0]) setStats(statsRes.data[0] as Stats);
    setComplaints((complRes.data ?? []) as Complaint[]);
    setCardComplaints((cardComplRes.data ?? []) as CardComplaint[]);
    setCommentComplaints((commentComplRes.data ?? []) as CommentComplaint[]);
    setComments((commRes.data ?? []) as Comment[]);
    setUsers((usersRes.data ?? []) as AdminUser[]);
    setSupportMessages((supportRes.data ?? []) as SupportMessage[]);
    setLoading(false);
    setRefreshing(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!authLoading && isAdmin) { setLoading(true); load(); }
  }, [authLoading, isAdmin, load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const moderationTranslateEntries = useMemo(() => {
    const items: { key: string; text: string }[] = [];
    const add = (key: string, text: string | null | undefined) => {
      if (text?.trim()) items.push({ key, text });
    };
    for (const row of complaints) {
      add(`deck-dt-${row.id}`, row.details);
    }
    for (const row of cardComplaints) {
      add(`card-dt-${row.id}`, row.details);
    }
    for (const row of commentComplaints) {
      if (!row.comment_content_uk?.trim()) {
        add(`rev-cc-${row.id}`, row.comment_content);
      }
      add(`rev-dt-${row.id}`, row.details);
    }
    return items;
  }, [complaints, cardComplaints, commentComplaints]);

  const { map: modDisplay, pending: modTranslatePending, failed: modTranslateFailed } =
    useModerationDisplayTranslations(locale, moderationTranslateEntries);
  const md = (key: string, fallback: string) =>
    moderationDisplayText(modDisplay, key, fallback, locale);

  const quotedReviewText = (row: CommentComplaint) => {
    if (locale === 'uk' && row.comment_content_uk?.trim()) {
      return row.comment_content_uk.trim();
    }
    return md(`rev-cc-${row.id}`, row.comment_content);
  };

  /* ── Actions ── */
  const handleDeleteComment = async () => {
    if (!commentToDelete) return;
    const { error } = await supabase.rpc('admin_delete_comment', { p_id: commentToDelete.id });
    if (error) { console.warn('[admin] delete comment error', error); return; }
    setComments(prev => prev.filter(c => c.id !== commentToDelete.id));
    setCommentToDelete(null);
  };

  const handleDismissComplaint = async () => {
    if (!complaintToDismiss) return;
    const { error } = await supabase.rpc('admin_dismiss_complaint', { p_id: complaintToDismiss.id });
    if (error) { console.warn('[admin] dismiss complaint error', error); return; }
    setComplaints(prev => prev.filter(c => c.id !== complaintToDismiss.id));
    setComplaintToDismiss(null);
  };

  const handleDeleteDeck = async () => {
    if (!deckToDelete) return;
    const { error } = await supabase.rpc('admin_delete_deck', { p_deck_id: deckToDelete.deck_id });
    if (error) { console.warn('[admin] delete deck error', error); return; }
    setComplaints(prev => prev.filter(c => c.deck_id !== deckToDelete.deck_id));
    setDeckToDelete(null);
  };

  const handleToggleAdmin = async (u: AdminUser) => {
    const { error } = await supabase.rpc('admin_set_admin', {
      p_user_id: u.user_id,
      p_is_admin: !u.is_admin,
    });
    if (error) { console.warn('[admin] toggle admin error', error); return; }
    setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, is_admin: !u.is_admin } : x));
  };

  const handleDismissCardComplaint = async () => {
    if (!cardComplaintToDismiss) return;
    const { error } = await supabase.rpc('admin_dismiss_card_complaint', { p_id: cardComplaintToDismiss.id });
    if (error) { console.warn('[admin] dismiss card complaint error', error); return; }
    setCardComplaints(prev => prev.filter(c => c.id !== cardComplaintToDismiss.id));
    setCardComplaintToDismiss(null);
  };

  const handleDismissCommentComplaint = async () => {
    if (!commentComplaintToDismiss) return;
    const { error } = await supabase.rpc('admin_dismiss_comment_complaint', { p_id: commentComplaintToDismiss.id });
    if (error) { console.warn('[admin] dismiss comment complaint error', error); return; }
    setCommentComplaints(prev => prev.filter(c => c.id !== commentComplaintToDismiss.id));
    setCommentComplaintToDismiss(null);
  };

  const handleDeleteReviewCommentFromComplaint = async () => {
    if (!commentComplaintReviewToDelete) return;
    const commentId = commentComplaintReviewToDelete.comment_id;
    const { error } = await supabase.rpc('admin_delete_comment', { p_id: commentId });
    if (error) { console.warn('[admin] delete review comment error', error); return; }
    setComments(prev => prev.filter(c => c.id !== commentId));
    setCommentComplaints(prev => prev.filter(c => c.comment_id !== commentId));
    setCommentComplaintReviewToDelete(null);
  };

  const handleMarkSupportRead = async (msg: SupportMessage) => {
    await supabase.rpc('admin_read_support_message', { p_id: msg.id });
    setSupportMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
  };

  const handleDeleteSupportMessage = async () => {
    if (!supportToDelete) return;
    await supabase.rpc('admin_delete_support_message', { p_id: supportToDelete.id });
    setSupportMessages(prev => prev.filter(m => m.id !== supportToDelete.id));
    setSupportToDelete(null);
  };

  const handleDeleteCard = async () => {
    if (!cardToDelete) return;
    const { error } = await supabase.rpc('admin_delete_card', { p_card_id: cardToDelete.card_id });
    if (error) { console.warn('[admin] delete card error', error); return; }
    setCardComplaints(prev => prev.filter(c => c.card_id !== cardToDelete.card_id));
    setCardToDelete(null);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userToDelete.user_id });
    if (error) { console.warn('[admin] delete user error', error); return; }
    setUsers(prev => prev.filter(x => x.user_id !== userToDelete.user_id));
    setUserToDelete(null);
  };

  if (authLoading || (!isAdmin && !authLoading)) {
    return (
      <View style={[styles.centered, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  /* ── Tab definitions ── */
  const TABS: { key: Tab; icon: keyof typeof Feather.glyphMap; label: string; count?: number }[] = [
    { key: 'overview',   icon: 'bar-chart-2',    label: t('adminTabOverview') },
    { key: 'users',      icon: 'users',           label: t('adminTabUsers'),      count: users.length },
    { key: 'complaints', icon: 'alert-triangle',  label: t('adminTabComplaints'), count: complaints.length + cardComplaints.length + commentComplaints.length },
    { key: 'comments',   icon: 'message-square',  label: t('adminTabComments'),   count: comments.length },
    { key: 'support',    icon: 'inbox',           label: t('adminTabSupport'),    count: supportMessages.filter(m => !m.is_read).length || undefined },
  ];

  /* ──────────────────────────── RENDER ──────────────────────────── */
  return (
    <View style={[styles.shell, isNarrow && { flexDirection: 'column' }, { backgroundColor: C.bg }]}>

      {/* ══ NARROW: horizontal scrollable top tab bar ══ */}
      {isNarrow && (
        <View style={[styles.topBar, { backgroundColor: C.surface, borderBottomColor: C.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.topBarContent}
          >
            {TABS.map(tab => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.topBarItem,
                    active && [styles.topBarItemActive, C.isDark && { backgroundColor: 'rgba(99,102,241,0.15)' }],
                  ]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.8}
                >
                  <Feather name={tab.icon} size={16} color={active ? C.tint : C.textSub} />
                  <Text
                    style={[
                      styles.topBarLabel,
                      active && styles.topBarLabelActive,
                      { color: active ? C.tint : C.textSub },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {(tab.count ?? 0) > 0 && (
                    <View style={[styles.navBadge, C.isDark && { backgroundColor: '#2d3f55' }, active && styles.navBadgeActive]}>
                      <Text style={[styles.navBadgeTxt, active && styles.navBadgeTxtActive]}>
                        {tab.count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.topBarBackBtn}
              onPress={() => router.push('/(tabs)')}
              activeOpacity={0.8}
            >
              <Feather name="arrow-left" size={15} color={C.textSub} />
              <Text style={[styles.backBtnTxt, { display: 'flex', color: C.textSub }]}>{t('adminBackToApp')}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ══ WIDE: left sidebar ══ */}
      {!isNarrow && (
        <View style={[styles.sidebar, { backgroundColor: C.surface, borderRightColor: C.border }]}>
          <View style={[styles.sidebarHeader, { borderBottomColor: C.border }]}>
            <View style={[styles.sidebarIconWrap, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF' }]}>
              <Feather name="shield" size={18} color={C.tint} />
            </View>
            <Text style={[styles.sidebarTitle, { color: C.text }]}>{t('adminPanel')}</Text>
          </View>

          {TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.navItem,
                activeTab === tab.key && [styles.navItemActive, C.isDark && { backgroundColor: 'rgba(99,102,241,0.15)' }],
              ]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.8}
            >
              <Feather name={tab.icon} size={17} color={activeTab === tab.key ? C.tint : C.textSub} />
              <Text
                style={[
                  styles.navLabel,
                  activeTab === tab.key && styles.navLabelActive,
                  { color: activeTab === tab.key ? C.tint : C.textSub },
                ]}
              >
                {tab.label}
              </Text>
              {(tab.count ?? 0) > 0 && (
                <View style={[styles.navBadge, { backgroundColor: C.isDark ? '#2d3f55' : '#f3f4f6' }, activeTab === tab.key && styles.navBadgeActive]}>
                  <Text style={[styles.navBadgeTxt, activeTab === tab.key && styles.navBadgeTxtActive]}>
                    {tab.count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(tabs)')}>
            <Feather name="arrow-left" size={15} color={C.textSub} />
            <Text style={[styles.backBtnTxt, { color: C.textSub }]}>{t('adminBackToApp')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Main content ── */}
      <ScrollView
        style={[styles.main, { backgroundColor: C.bg }]}
        contentContainerStyle={styles.mainContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
        showsVerticalScrollIndicator={Platform.OS === 'web'}
      >
        {loading && !refreshing ? (
          <View style={[styles.centered, { backgroundColor: C.bg }]}>
            <ActivityIndicator color="#6366f1" size="large" />
          </View>
        ) : (
          <>
            {/* ════ OVERVIEW ════ */}
            {activeTab === 'overview' && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Feather name="bar-chart-2" size={18} color="#6366f1" />
                  <Text style={styles.sectionTitle}>{t('adminTabOverview')}</Text>
                </View>
                <View style={styles.statsGrid}>
                  <StatCard icon="users"          color="#6366f1" value={stats?.total_users     ?? 0} label={t('adminStatUsers')} />
                  <StatCard icon="layers"         color="#10b981" value={stats?.total_decks     ?? 0} label={t('adminStatDecks')} />
                  <StatCard icon="credit-card"    color="#f59e0b" value={stats?.total_cards     ?? 0} label={t('adminStatCards')} />
                  <StatCard icon="alert-triangle" color="#ef4444" value={stats?.total_complaints ?? 0} label={t('adminStatComplaints')} />
                  <StatCard icon="message-square" color="#8b5cf6" value={stats?.total_comments  ?? 0} label={t('adminStatComments')} />
                </View>
              </View>
            )}

            {/* ════ USERS ════ */}
            {activeTab === 'users' && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Feather name="users" size={18} color="#6366f1" />
                  <Text style={styles.sectionTitle}>{t('adminTabUsers')}</Text>
                  <View style={[styles.countPill, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF' }]}>
                    <Text style={[styles.countPillTxt, { color: '#6366f1' }]}>{users.length}</Text>
                  </View>
                </View>

                {/* Search */}
                <View style={[styles.searchWrap, { backgroundColor: C.inputBg, borderColor: C.border }]}>
                  <Feather name="search" size={15} color="#9ca3af" style={{ marginLeft: 10 }} />
                  <TextInput
                    style={[styles.searchInput, { color: C.text }]}
                    placeholder={t('adminSearchUsers')}
                    placeholderTextColor={C.placeholder}
                    value={userSearch}
                    onChangeText={setUserSearch}
                  />
                  {userSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setUserSearch('')} style={{ marginRight: 10 }}>
                      <Feather name="x" size={15} color="#9ca3af" />
                    </TouchableOpacity>
                  )}
                </View>

                {filteredUsers.length === 0 ? (
                  <EmptyState icon="users" text={t('adminNoUsers')} />
                ) : (
                  filteredUsers.map(u => (
                    <View key={u.user_id} style={[styles.userCard, { backgroundColor: C.surface }]}>
                      {/* Avatar + info */}
                      <View style={styles.userCardLeft}>
                        <View
                          style={[
                            styles.userAvatar,
                            {
                              backgroundColor: u.is_admin
                                ? (C.isDark ? 'rgba(99,102,241,0.22)' : '#EEF2FF')
                                : (C.isDark ? '#2d3f55' : '#f3f4f6'),
                              borderColor: u.is_admin
                                ? (C.isDark ? 'rgba(165,180,252,0.4)' : '#c7d2fe')
                                : C.border,
                            },
                          ]}
                        >
                          <Text style={[styles.userAvatarTxt, { color: u.is_admin ? C.tint : C.text }]}>
                            {u.username[0]?.toUpperCase() ?? '?'}
                          </Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.userNameRow}>
                            <Text style={[styles.userName, { color: C.text }]} numberOfLines={1}>{u.username}</Text>
                            {u.is_admin && (
                              <View
                                style={[
                                  styles.adminBadge,
                                  C.isDark
                                    ? {
                                        backgroundColor: 'rgba(99,102,241,0.2)',
                                        borderWidth: 1,
                                        borderColor: 'rgba(165,180,252,0.35)',
                                      }
                                    : { backgroundColor: '#EEF2FF' },
                                ]}
                              >
                                <Feather name="shield" size={10} color={C.tint} />
                                <Text style={[styles.adminBadgeTxt, { color: C.tint }]}>{t('adminAdminBadge')}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.userEmail, { color: C.textSub }]} numberOfLines={1}>{u.email}</Text>
                          <View style={styles.userMeta}>
                            <View style={styles.userMetaItem}>
                              <Feather name="layers" size={11} color={C.textMuted} />
                              <Text style={[styles.userMetaTxt, { color: C.textMuted }]}>{u.deck_count} {t('adminUserDecks')}</Text>
                            </View>
                            <View style={styles.userMetaItem}>
                              <Feather name="clock" size={11} color={C.textMuted} />
                              <Text style={[styles.userMetaTxt, { color: C.textMuted }]}>
                                {u.last_sign_in
                                  ? new Date(u.last_sign_in).toLocaleDateString()
                                  : t('adminUserNever')}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Actions — hidden for current user */}
                      {u.user_id !== user?.id && (
                        <View style={styles.userActions}>
                          <TouchableOpacity
                            style={[
                              styles.userBtn,
                              u.is_admin
                                ? { backgroundColor: C.isDark ? 'rgba(217,119,6,0.15)' : '#fffbeb', borderColor: C.isDark ? '#92400e' : '#fcd34d' }
                                : { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF', borderColor: C.isDark ? '#4338ca' : '#c7d2fe' },
                            ]}
                            onPress={() => handleToggleAdmin(u)}
                            activeOpacity={0.8}
                          >
                            <Feather name="shield" size={13} color={u.is_admin ? '#d97706' : '#6366f1'} />
                            <Text style={[styles.userBtnTxt, { color: u.is_admin ? '#d97706' : '#6366f1' }]}>
                              {u.is_admin ? t('adminRemoveAdmin') : t('adminMakeAdmin')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.userBtnDanger, C.isDark && { backgroundColor: 'rgba(220,38,38,0.15)', borderColor: '#7f1d1d' }]}
                            onPress={() => setUserToDelete(u)}
                            activeOpacity={0.8}
                          >
                            <Feather name="trash-2" size={13} color="#dc2626" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}

            {/* ════ COMPLAINTS ════ */}
            {activeTab === 'complaints' && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Feather name="alert-triangle" size={18} color="#ef4444" />
                  <Text style={styles.sectionTitle}>{t('adminTabComplaints')}</Text>
                  <View style={[styles.countPill, C.isDark && { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                    <Text style={styles.countPillTxt}>{complaints.length + cardComplaints.length + commentComplaints.length}</Text>
                  </View>
                </View>

                {/* Filter: Decks / Words / Reviews */}
                <View style={[styles.complaintFilterRow, { flexWrap: 'wrap' }]}>
                  {(['decks', 'words', 'reviews'] as const).map((f) => (
                    <Pressable
                      key={f}
                      style={[
                        styles.filterChip,
                        { backgroundColor: C.surface, borderColor: C.border },
                        complaintFilter === f && { borderColor: C.tint, backgroundColor: C.isDark ? 'rgba(165,180,252,0.15)' : 'rgba(66,85,255,0.12)' },
                      ]}
                      onPress={() => setComplaintFilter(f)}
                    >
                      <Feather
                        name={f === 'decks' ? 'layers' : f === 'words' ? 'credit-card' : 'message-circle'}
                        size={13}
                        color={complaintFilter === f ? C.tint : C.textMuted}
                      />
                      <Text style={[styles.filterChipTxt, { color: complaintFilter === f ? C.tint : C.textSub }, complaintFilter === f && { fontWeight: '700' }]}>
                        {f === 'decks' ? t('adminFilterDecks') : f === 'words' ? t('adminFilterWords') : t('adminFilterReviews')}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {complaintFilter === 'words' ? (
                  cardComplaints.length === 0 ? (
                    <EmptyState icon="check-circle" text={t('adminNoCardComplaints')} />
                  ) : (
                    cardComplaints.map(row => (
                      <View key={row.id} style={[styles.card, { backgroundColor: C.surface }]}>
                        <View style={styles.cardHead}>
                          <View style={[styles.issueBadge, C.isDark && { backgroundColor: 'rgba(217,119,6,0.15)', borderColor: '#92400e' }]}>
                            <Text style={[styles.issueTxt, C.isDark && { color: '#fbbf24' }]}>
                            {t(getComplaintIssueLabelKey(row.issue_key))}
                          </Text>
                          </View>
                          <Text style={[styles.cardDate, { color: C.textMuted }]}>
                            {new Date(row.created_at).toLocaleDateString()}
                          </Text>
                        </View>

                        {/* Card word */}
                        <View style={[styles.cardWordBox, { backgroundColor: C.isDark ? 'rgba(165,180,252,0.1)' : '#f5f3ff', borderColor: C.isDark ? 'rgba(165,180,252,0.25)' : '#ddd6fe' }]}>
                          <Feather name="credit-card" size={13} color={C.tint} />
                          <Text style={[styles.cardWordTxt, { color: C.tint }]} numberOfLines={2}>{row.card_front_text}</Text>
                        </View>

                        {/* Deck link */}
                        <Pressable
                          style={[styles.deckRow, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF' }]}
                          onPress={() => router.push(`/deck-detail?id=${row.deck_id}`)}
                        >
                          <Feather name="layers" size={13} color="#6366f1" />
                          <Text style={styles.deckTitle} numberOfLines={1}>{row.deck_title}</Text>
                          <Feather name="external-link" size={12} color="#6366f1" />
                        </Pressable>

                        <Text style={[styles.metaTxt, { color: C.textSub }]}>
                          {t('adminReporter')}: <Text style={styles.metaBold}>{row.reporter_name}</Text>
                        </Text>
                        {row.details ? (
                          <Text style={[styles.bodyTxt, { color: C.text }]}>
                            {md(`card-dt-${row.id}`, row.details)}
                          </Text>
                        ) : null}

                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            style={[styles.btnDismiss, C.isDark && { backgroundColor: 'rgba(5,150,105,0.15)', borderColor: '#065f46' }]}
                            onPress={() => setCardComplaintToDismiss(row)}
                            activeOpacity={0.8}
                          >
                            <Feather name="check" size={14} color="#059669" />
                            <Text style={styles.btnDismissTxt}>{t('adminDismissCardComplaint')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.btnDanger}
                            onPress={() => setCardToDelete(row)}
                            activeOpacity={0.8}
                          >
                            <Feather name="trash-2" size={14} color="#fff" />
                            <Text style={styles.btnDangerTxt}>{t('delete')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )
                ) : complaintFilter === 'reviews' ? (
                  commentComplaints.length === 0 ? (
                    <EmptyState icon="check-circle" text={t('adminNoCommentComplaints')} />
                  ) : (
                    commentComplaints.map(row => (
                      <View key={row.id} style={[styles.card, { backgroundColor: C.surface }]}>
                        <View style={styles.cardHead}>
                          <View style={[styles.issueBadge, C.isDark && { backgroundColor: 'rgba(217,119,6,0.15)', borderColor: '#92400e' }]}>
                            <Text style={[styles.issueTxt, C.isDark && { color: '#fbbf24' }]}>
                            {t(getComplaintIssueLabelKey(row.issue_key))}
                          </Text>
                          </View>
                          <Text style={[styles.cardDate, { color: C.textMuted }]}>
                            {new Date(row.created_at).toLocaleDateString()}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.quoteBox,
                            {
                              backgroundColor: C.isDark ? 'rgba(52,211,153,0.08)' : '#ecfdf5',
                              borderColor: C.isDark ? 'rgba(52,211,153,0.25)' : '#a7f3d0',
                            },
                          ]}
                        >
                          <Text style={[styles.quoteLabel, { color: '#047857' }]}>
                            {t('adminQuotedReview')}
                          </Text>
                          {modTranslatePending &&
                          locale === 'uk' &&
                          !row.comment_content_uk?.trim() &&
                          !modDisplay[`rev-cc-${row.id}`] ? (
                            <Text style={[styles.quotePending, { color: C.textMuted }]}>
                              {t('adminTranslationPending')}
                            </Text>
                          ) : (
                            <Text style={[styles.quoteText, { color: '#047857' }]}>
                              {quotedReviewText(row)}
                            </Text>
                          )}
                          {locale === 'uk' &&
                          !row.comment_content_uk?.trim() &&
                          modTranslateFailed &&
                          quotedReviewText(row) === row.comment_content ? (
                            <Text style={[styles.quoteTranslateHint, { color: C.textMuted }]}>
                              {t('adminTranslationUnavailable')}
                            </Text>
                          ) : null}
                          {locale === 'uk' &&
                          quotedReviewText(row) !== row.comment_content ? (
                            <Text style={[styles.originalHint, { color: C.textMuted }]}>
                              {t('adminOriginalText')}: {row.comment_content}
                            </Text>
                          ) : null}
                        </View>

                        <Pressable
                          style={[styles.deckRow, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF' }]}
                          onPress={() => router.push(`/deck-detail?id=${row.deck_id}`)}
                        >
                          <Feather name="layers" size={13} color="#6366f1" />
                          <Text style={styles.deckTitle} numberOfLines={1}>{row.deck_title}</Text>
                          <Feather name="external-link" size={12} color="#6366f1" />
                        </Pressable>

                        <Text style={[styles.metaTxt, { color: C.textSub }]}>
                          {t('adminReporter')}: <Text style={styles.metaBold}>{row.reporter_name}</Text>
                        </Text>
                        <Text style={[styles.metaTxt, { color: C.textSub }]}>
                          {t('adminReviewCommentAuthor')}: <Text style={styles.metaBold}>{row.comment_author_name}</Text>
                        </Text>
                        {row.details ? (
                          <Text style={[styles.bodyTxt, { color: C.text }]}>
                            {md(`rev-dt-${row.id}`, row.details)}
                          </Text>
                        ) : null}

                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            style={[styles.btnDismiss, C.isDark && { backgroundColor: 'rgba(5,150,105,0.15)', borderColor: '#065f46' }]}
                            onPress={() => setCommentComplaintToDismiss(row)}
                            activeOpacity={0.8}
                          >
                            <Feather name="check" size={14} color="#059669" />
                            <Text style={styles.btnDismissTxt}>{t('adminDismissCommentComplaint')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.btnDanger}
                            onPress={() => setCommentComplaintReviewToDelete(row)}
                            activeOpacity={0.8}
                          >
                            <Feather name="trash-2" size={14} color="#fff" />
                            <Text style={styles.btnDangerTxt}>{t('delete')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )
                ) : complaints.length === 0 ? (
                  <EmptyState icon="check-circle" text={t('adminNoComplaints')} />
                ) : (
                  complaints.map(row => (
                    <View key={row.id} style={[styles.card, { backgroundColor: C.surface }]}>
                      {/* Card header */}
                      <View style={styles.cardHead}>
                        <View style={[styles.issueBadge, C.isDark && { backgroundColor: 'rgba(217,119,6,0.15)', borderColor: '#92400e' }]}>
                          <Text style={[styles.issueTxt, C.isDark && { color: '#fbbf24' }]}>
                            {t(getComplaintIssueLabelKey(row.issue_key))}
                          </Text>
                        </View>
                        <Text style={[styles.cardDate, { color: C.textMuted }]}>
                          {new Date(row.created_at).toLocaleDateString()}
                        </Text>
                      </View>

                      {/* Deck */}
                      <Pressable
                        style={[styles.deckRow, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF' }]}
                        onPress={() => router.push(`/deck-detail?id=${row.deck_id}`)}
                      >
                        <Feather name="layers" size={13} color="#6366f1" />
                        <Text style={styles.deckTitle} numberOfLines={1}>{row.deck_title}</Text>
                        <Feather name="external-link" size={12} color="#6366f1" />
                      </Pressable>

                      {/* Reporter */}
                      <Text style={[styles.metaTxt, { color: C.textSub }]}>
                        {t('adminReporter')}: <Text style={styles.metaBold}>{row.reporter_name}</Text>
                      </Text>

                      {/* Details */}
                      {row.details ? (
                        <Text style={[styles.bodyTxt, { color: C.text }]}>
                          {md(`deck-dt-${row.id}`, row.details)}
                        </Text>
                      ) : null}

                      {/* Actions */}
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={[styles.btnDismiss, C.isDark && { backgroundColor: 'rgba(5,150,105,0.15)', borderColor: '#065f46' }]}
                          onPress={() => setComplaintToDismiss(row)}
                          activeOpacity={0.8}
                        >
                          <Feather name="check" size={14} color="#059669" />
                          <Text style={styles.btnDismissTxt}>{t('adminDismissComplaint')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.btnDanger}
                          onPress={() => setDeckToDelete(row)}
                          activeOpacity={0.8}
                        >
                          <Feather name="trash-2" size={14} color="#fff" />
                          <Text style={styles.btnDangerTxt}>{t('delete')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* ════ SUPPORT ════ */}
            {activeTab === 'support' && (() => {
              const SUPPORT_FILTERS: { key: typeof supportFilter; label: string; icon: keyof typeof Feather.glyphMap; color: string }[] = [
                { key: 'all',        label: t('adminSupportFilterAll'),        icon: 'inbox',          color: '#6366f1' },
                { key: 'unread',     label: t('adminSupportUnread'),           icon: 'bell',           color: '#0ea5e9' },
                { key: 'bug',        label: t('adminSupportFilterBug'),        icon: 'alert-circle',   color: '#ef4444' },
                { key: 'suggestion', label: t('adminSupportFilterSuggestion'), icon: 'zap',            color: '#f59e0b' },
                { key: 'complaint',  label: t('adminSupportFilterComplaint'),  icon: 'alert-triangle', color: '#8b5cf6' },
              ];
              const filtered = supportFilter === 'all'    ? supportMessages
                             : supportFilter === 'unread' ? supportMessages.filter(m => !m.is_read)
                             : supportMessages.filter(m => m.type === supportFilter);
              const TYPE_META: Record<string, { color: string; icon: keyof typeof Feather.glyphMap; label: string }> = {
                bug:        { color: '#ef4444', icon: 'alert-circle',   label: t('adminSupportFilterBug') },
                suggestion: { color: '#f59e0b', icon: 'zap',            label: t('adminSupportFilterSuggestion') },
                complaint:  { color: '#8b5cf6', icon: 'alert-triangle', label: t('adminSupportFilterComplaint') },
              };
              return (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Feather name="inbox" size={18} color="#6366f1" />
                    <Text style={styles.sectionTitle}>{t('adminTabSupport')}</Text>
                    <View style={[styles.countPill, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#eef0ff' }]}>
                      <Text style={[styles.countPillTxt, { color: '#6366f1' }]}>{supportMessages.length}</Text>
                    </View>
                  </View>

                  {/* Filters */}
                  <View style={styles.complaintFilterRow}>
                    {SUPPORT_FILTERS.map(f => {
                      const active = supportFilter === f.key;
                      const cnt = f.key === 'all'    ? supportMessages.length
                                : f.key === 'unread' ? supportMessages.filter(m => !m.is_read).length
                                : supportMessages.filter(m => m.type === f.key).length;
                      return (
                        <TouchableOpacity
                          key={f.key}
                          style={[styles.filterChip, {
                            borderColor: active ? f.color : C.border,
                            backgroundColor: active ? (C.isDark ? `${f.color}22` : `${f.color}11`) : C.inputBg,
                          }]}
                          onPress={() => setSupportFilter(f.key)}
                          activeOpacity={0.8}
                        >
                          <Feather name={f.icon} size={13} color={active ? f.color : C.textMuted} />
                          <Text style={[styles.filterChipTxt, { color: active ? f.color : C.textMuted }]}>
                            {f.label} {cnt > 0 ? `(${cnt})` : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {filtered.length === 0 ? (
                    <EmptyState icon="inbox" text={t('adminSupportEmpty')} />
                  ) : (
                    filtered.map(msg => {
                      const meta = TYPE_META[msg.type] ?? TYPE_META.bug;
                      return (
                        <View key={msg.id} style={[
                          styles.card,
                          { backgroundColor: C.surface },
                          !msg.is_read && { borderLeftWidth: 3, borderLeftColor: meta.color },
                        ]}>
                          {/* Top row: avatar + user info + type pill */}
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                            <View style={[styles.avatar, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF', flexShrink: 0 }]}>
                              <Text style={styles.avatarTxt}>{msg.username[0]?.toUpperCase() ?? '?'}</Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                              <Text style={[styles.commentUser, { color: C.text }]} numberOfLines={1}>
                                {msg.username}
                                {msg.email?.trim() ? <Text style={[styles.metaTxt, { color: C.textMuted }]}> ({msg.email})</Text> : null}
                              </Text>
                              <Text style={[styles.metaTxt, { color: C.textMuted, fontSize: 11 }]} numberOfLines={1}>
                                {new Date(msg.created_at).toLocaleDateString()} · {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                              {/* Type pill — moves under username on narrow screens */}
                              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                                <View style={[styles.supportTypePill, {
                                  backgroundColor: C.isDark ? `${meta.color}25` : `${meta.color}15`,
                                  borderColor: meta.color,
                                }]}>
                                  <Feather name={meta.icon} size={12} color={meta.color} />
                                  <Text style={[styles.supportTypeTxt, { color: meta.color }]}>{meta.label}</Text>
                                </View>
                              </View>
                            </View>
                          </View>

                          {/* Unread dot label */}
                          {!msg.is_read && (
                            <View style={styles.unreadRow}>
                              <View style={[styles.unreadDot, { backgroundColor: '#0ea5e9' }]} />
                              <Text style={[styles.unreadTxt, { color: '#0ea5e9' }]}>{t('adminSupportUnread')}</Text>
                            </View>
                          )}

                          {/* Message body */}
                          <Text style={[styles.bodyTxt, { color: C.text, marginTop: 10 }]}>{msg.message}</Text>

                          {/* Actions */}
                          <View style={styles.cardActions}>
                            {!msg.is_read && (
                              <TouchableOpacity
                                style={[styles.btnDismiss, C.isDark && { backgroundColor: 'rgba(5,150,105,0.1)', borderColor: '#065f46' }]}
                                onPress={() => handleMarkSupportRead(msg)}
                                activeOpacity={0.8}
                              >
                                <Feather name="check" size={13} color="#059669" />
                                <Text style={styles.btnDismissTxt}>{t('adminSupportMarkRead')}</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={[styles.btnDeleteComment, C.isDark && { backgroundColor: 'rgba(220,38,38,0.12)', borderColor: '#7f1d1d' }]}
                              onPress={() => setSupportToDelete(msg)}
                              activeOpacity={0.8}
                            >
                              <Feather name="trash-2" size={13} color="#dc2626" />
                              <Text style={styles.btnDeleteCommentTxt}>{t('adminSupportDelete')}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              );
            })()}

            {/* ════ COMMENTS ════ */}
            {activeTab === 'comments' && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Feather name="message-square" size={18} color="#8b5cf6" />
                  <Text style={styles.sectionTitle}>{t('adminTabComments')}</Text>
                  <View style={[styles.countPill, { backgroundColor: C.isDark ? 'rgba(139,92,246,0.15)' : '#f3e8ff' }]}>
                    <Text style={[styles.countPillTxt, { color: '#8b5cf6' }]}>{comments.length}</Text>
                  </View>
                </View>

                {comments.length === 0 ? (
                  <EmptyState icon="message-circle" text={t('adminNoComments')} />
                ) : (
                  comments.map(row => (
                    <View key={row.id} style={[styles.card, { backgroundColor: C.surface }]}>
                      <View style={styles.commentHead}>
                        {/* Avatar */}
                        <View style={[styles.avatar, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF' }]}>
                          <Text style={styles.avatarTxt}>{row.username[0]?.toUpperCase() ?? '?'}</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.commentUser, { color: C.text }]} numberOfLines={1}>{row.username}</Text>
                          <Pressable
                            style={styles.commentDeckRow}
                            onPress={() => router.push(`/deck-detail?id=${row.deck_id}`)}
                          >
                            <Feather name="layers" size={11} color="#6366f1" />
                            <Text style={styles.commentDeckTxt} numberOfLines={1}>{row.deck_title}</Text>
                          </Pressable>
                        </View>
                        <Text style={[styles.cardDate, { color: C.textMuted, flexShrink: 0 }]}>
                          {new Date(row.created_at).toLocaleDateString()}
                        </Text>
                      </View>

                      <Text style={[styles.commentContent, { color: C.text }]}>{row.content}</Text>

                      <TouchableOpacity
                        style={[styles.btnDeleteComment, C.isDark && { backgroundColor: 'rgba(220,38,38,0.12)', borderColor: '#7f1d1d' }]}
                        onPress={() => setCommentToDelete(row)}
                        activeOpacity={0.8}
                      >
                        <Feather name="trash-2" size={13} color="#dc2626" />
                        <Text style={styles.btnDeleteCommentTxt}>{t('adminDeleteComment')}</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Confirm modals ── */}
      <ConfirmModal
        visible={Boolean(supportToDelete)}
        title={t('adminSupportDelete')}
        message={t('adminSupportDeleteConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        destructive
        icon="trash-2"
        onConfirm={handleDeleteSupportMessage}
        onCancel={() => setSupportToDelete(null)}
      />
      <ConfirmModal
        visible={Boolean(commentToDelete)}
        title={t('adminDeleteComment')}
        message={t('adminDeleteCommentConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        destructive
        icon="trash-2"
        onConfirm={handleDeleteComment}
        onCancel={() => setCommentToDelete(null)}
      />
      <ConfirmModal
        visible={Boolean(complaintToDismiss)}
        title={t('adminDismissComplaint')}
        message={`Close complaint about "${complaintToDismiss?.deck_title}"?`}
        confirmText={t('adminDismissComplaint')}
        cancelText={t('cancel')}
        icon="check-circle"
        onConfirm={handleDismissComplaint}
        onCancel={() => setComplaintToDismiss(null)}
      />
      <ConfirmModal
        visible={Boolean(deckToDelete)}
        title={t('adminDeleteDeck')}
        message={t('adminDeleteDeckConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        destructive
        icon="trash-2"
        onConfirm={handleDeleteDeck}
        onCancel={() => setDeckToDelete(null)}
      />
      <ConfirmModal
        visible={Boolean(userToDelete)}
        title={t('adminDeleteUser')}
        message={t('adminDeleteUserConfirm')}
        confirmText={t('adminDeleteUser')}
        cancelText={t('cancel')}
        destructive
        icon="trash-2"
        onConfirm={handleDeleteUser}
        onCancel={() => setUserToDelete(null)}
      />
      <ConfirmModal
        visible={Boolean(cardComplaintToDismiss)}
        title={t('adminDismissCardComplaint')}
        message={`Close complaint about "${cardComplaintToDismiss?.card_front_text}"?`}
        confirmText={t('adminDismissCardComplaint')}
        cancelText={t('cancel')}
        icon="check-circle"
        onConfirm={handleDismissCardComplaint}
        onCancel={() => setCardComplaintToDismiss(null)}
      />
      <ConfirmModal
        visible={Boolean(commentComplaintToDismiss)}
        title={t('adminDismissCommentComplaint')}
        message={t('adminDismissCommentComplaintConfirm')}
        confirmText={t('adminDismissCommentComplaint')}
        cancelText={t('cancel')}
        icon="check-circle"
        onConfirm={handleDismissCommentComplaint}
        onCancel={() => setCommentComplaintToDismiss(null)}
      />
      <ConfirmModal
        visible={Boolean(commentComplaintReviewToDelete)}
        title={t('adminDeleteComment')}
        message={t('adminDeleteCommentConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        destructive
        icon="trash-2"
        onConfirm={handleDeleteReviewCommentFromComplaint}
        onCancel={() => setCommentComplaintReviewToDelete(null)}
      />
      <ConfirmModal
        visible={Boolean(cardToDelete)}
        title={t('adminDeleteCard')}
        message={t('adminDeleteCardConfirm')}
        confirmText={t('delete')}
        cancelText={t('cancel')}
        destructive
        icon="trash-2"
        onConfirm={handleDeleteCard}
        onCancel={() => setCardToDelete(null)}
      />
    </View>
  );
}

/* ─── Sub-components ─── */
function StatCard({ icon, color, value, label }: {
  icon: keyof typeof Feather.glyphMap;
  color: string;
  value: number;
  label: string;
}) {
  const C = useAppColors();
  return (
    <View style={[styles.statCard, { borderTopColor: color, backgroundColor: C.surface }]}>
      <View style={[styles.statIconWrap, { backgroundColor: `${color}18` }]}>
        <Feather name={icon} size={20} color={color} />
      </View>
      <Text style={[styles.statVal, { color }]}>{value.toLocaleString()}</Text>
      <Text style={[styles.statLabel, { color: C.textSub }]}>{label}</Text>
    </View>
  );
}

function EmptyState({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  const C = useAppColors();
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIcon, { backgroundColor: C.isDark ? '#1d2a3a' : '#f9fafb' }]}>
        <Feather name={icon} size={32} color={C.textMuted} />
      </View>
      <Text style={[styles.emptyTxt, { color: C.textSub }]}>{text}</Text>
    </View>
  );
}

/* ═══════════════════════════════════════ STYLES ═══════════════════════════════════════ */
const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: 'row',
  },

  /* ── Top bar (narrow screens) ── */
  topBar: {
    borderBottomWidth: 1,
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  topBarItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  topBarItemActive: { backgroundColor: '#EEF2FF' },
  topBarLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  topBarLabelActive: { color: '#6366f1', fontWeight: '700' },
  topBarBackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    marginLeft: 8,
    borderLeftWidth: 1, borderLeftColor: '#e5e7eb',
  },

  /* ── Sidebar ── */
  sidebar: {
    width: Platform.OS === 'web' ? 220 : 64,
    borderRightWidth: 1,
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 10,
    gap: 4,
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingBottom: 16,
    marginBottom: 4,
    borderBottomWidth: 1,
  },
  sidebarIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center', alignItems: 'center',
  },
  sidebarTitle: {
    fontSize: 14, fontWeight: '700',
    display: Platform.OS === 'web' ? 'flex' : 'none' as any,
  },
  navItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10,
  },
  navItemActive: { backgroundColor: '#EEF2FF' },
  navLabel: {
    flex: 1, fontSize: 14, fontWeight: '500', color: '#6b7280',
    display: Platform.OS === 'web' ? 'flex' : 'none' as any,
  },
  navLabelActive: { color: '#6366f1', fontWeight: '700' },
  navBadge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  navBadgeActive: { backgroundColor: '#6366f1' },
  navBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#6b7280' },
  navBadgeTxtActive: { color: '#fff' },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 'auto' as any, paddingHorizontal: 10, paddingVertical: 10,
  },
  backBtnTxt: {
    fontSize: 13, color: '#6b7280',
    display: Platform.OS === 'web' ? 'flex' : 'none' as any,
  },

  /* ── Main ── */
  main: { flex: 1 },
  mainContent: { padding: 20, paddingBottom: 60, gap: 0 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },

  section: { gap: 12 },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  countPill: {
    backgroundColor: '#fef2f2', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  countPillTxt: { fontSize: 12, fontWeight: '700', color: '#ef4444' },

  /* ── Stats ── */
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  statCard: {
    flex: 1, minWidth: 140,
    borderRadius: 14,
    padding: 16, gap: 8,
    borderTopWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  statIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    alignSelf: 'flex-start',
  },
  statVal: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 13, color: '#6b7280', fontWeight: '500' },

  /* ── Cards ── */
  card: {
    borderRadius: 14, padding: 16,
    gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDate: { fontSize: 12, color: '#9ca3af' },

  issueBadge: {
    backgroundColor: '#fef9ec', borderWidth: 1, borderColor: '#fcd34d',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  issueTxt: { fontSize: 12, fontWeight: '700', color: '#92400e' },

  deckRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  deckTitle: { fontSize: 13, fontWeight: '600', color: '#6366f1', maxWidth: 280 },

  complaintFilterRow: {
    flexDirection: 'row', gap: 8, marginBottom: 12,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 999, borderWidth: 1,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  filterChipTxt: { fontSize: 13 },

  cardWordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  quoteBox: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  quoteLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  quoteText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  quotePending: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  quoteTranslateHint: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  originalHint: { fontSize: 12, lineHeight: 17, fontStyle: 'italic', marginTop: 2 },
  cardWordTxt: { fontSize: 13, fontWeight: '600', flex: 1, flexShrink: 1 },

  metaTxt: { fontSize: 13, color: '#6b7280' },
  metaBold: { fontWeight: '600' },
  bodyTxt: { fontSize: 14, lineHeight: 20 },

  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    justifyContent: 'flex-end',
  },
  btnDismiss: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0',
    borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12,
  },
  btnDismissTxt: { fontSize: 12, fontWeight: '600', color: '#059669' },
  btnDanger: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#ef4444', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12,
  },
  btnDangerTxt: { fontSize: 12, fontWeight: '600', color: '#fff' },

  /* ── Support cards ── */
  supportTypePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    flexShrink: 0,
  },
  supportTypeTxt: { fontSize: 12, fontWeight: '600' },
  unreadRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  unreadTxt: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  /* ── Comments ── */
  commentHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
  },
  avatarTxt: { fontSize: 15, fontWeight: '700', color: '#6366f1' },
  commentUser: { fontSize: 14, fontWeight: '700' },
  commentDeckRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  commentDeckTxt: { fontSize: 12, color: '#6366f1', flex: 1 },
  commentContent: { fontSize: 15, lineHeight: 22 },
  btnDeleteComment: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#fef2f2', borderRadius: 8,
    borderWidth: 1, borderColor: '#fecaca',
  },
  btnDeleteCommentTxt: { fontSize: 13, fontWeight: '600', color: '#dc2626' },

  /* ── Search ── */
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1, fontSize: 14,
    outlineWidth: 0, outlineStyle: 'none',
    backgroundColor: 'transparent',
  } as any,

  /* ── Users ── */
  userCard: {
    borderRadius: 14, padding: 14,
    gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  userCardLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0 },
  userAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#e5e7eb',
  },
  userAvatarAdmin: { borderColor: '#c7d2fe', backgroundColor: '#EEF2FF' },
  userAvatarTxt: { fontSize: 16, fontWeight: '700' },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  userName: { fontSize: 15, fontWeight: '700' },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#EEF2FF', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  adminBadgeTxt: { fontSize: 11, fontWeight: '700', color: '#6366f1' },
  userEmail: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  userMeta: { flexDirection: 'row', gap: 12, marginTop: 5, flexWrap: 'wrap' },
  userMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  userMetaTxt: { fontSize: 12, color: '#9ca3af' },
  userActions: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  userBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1,
  },
  userBtnPrimary: { backgroundColor: '#EEF2FF', borderColor: '#c7d2fe' },
  userBtnWarning: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  userBtnTxt: { fontSize: 12, fontWeight: '600' },
  userBtnDanger: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
    justifyContent: 'center', alignItems: 'center',
  },

  /* ── Empty ── */
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#f9fafb', justifyContent: 'center', alignItems: 'center',
  },
  emptyTxt: { fontSize: 15, color: '#9ca3af' },
});
