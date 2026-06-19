import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAppColors } from '@/src/contexts/ThemeContext';
import { useWebStudyReminderState } from '@/src/contexts/WebStudyReminderContext';

interface Invitation {
  deck_id: string;
  deck_title: string;
  invited_by: string;
  inviter_name: string;
  created_at: string;
}

type BellItem =
  | {
      type: 'study-reminder';
      id: string;
      title: string;
      body: string;
      dismissKind: 'daily' | 'queued';
    }
  | { type: 'invitation'; id: string; invitation: Invitation };

export default function NotificationBell() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const C = useAppColors();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [open, setOpen] = useState(false);
  const [responding, setResponding] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; ok: boolean } | null>(null);
  const {
    dailyDue,
    dailyReminderId,
    queuedReminders,
    dismissDailyForToday,
    dismissBellItem,
  } = useWebStudyReminderState();

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.rpc('get_my_invitations');
    if (data) setInvitations(data as Invitation[]);
  }, [user]);

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`notif_bell_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deck_collaborators', filter: `user_id=eq.${user.id}` },
        load,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, user]);

  const respond = async (deckId: string, accept: boolean) => {
    setResponding(deckId);
    await supabase.rpc('respond_to_invitation', { p_deck_id: deckId, p_accept: accept });
    setResponding(null);
    setFlash({ id: deckId, ok: accept });
    setTimeout(() => {
      setFlash(null);
      setInvitations(prev => prev.filter(i => i.deck_id !== deckId));
    }, 1200);
  };

  const items: BellItem[] = [
    ...(dailyDue
      ? [
          {
            type: 'study-reminder' as const,
            id: dailyReminderId,
            title: t('pushRepeatWordsTitle'),
            body: t('pushRepeatWordsBody'),
            dismissKind: 'daily' as const,
          },
        ]
      : []),
    ...queuedReminders.map((reminder) => ({
      type: 'study-reminder' as const,
      id: reminder.id,
      title: reminder.title,
      body: reminder.body,
      dismissKind: 'queued' as const,
    })),
    ...invitations.map((invitation) => ({
      type: 'invitation' as const,
      id: invitation.deck_id,
      invitation,
    })),
  ];

  const count = items.length;

  if (!user) return null;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.btn} onPress={() => setOpen(v => !v)} activeOpacity={0.7}>
        <Feather name="bell" size={20} color={C.iconTint} />
        {count > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{count > 9 ? '9+' : String(count)}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          {/* stopPropagation so tapping inside panel doesn't close it */}
          <Pressable style={[styles.panel, { backgroundColor: C.surface }]} onPress={e => e.stopPropagation()}>
            {/* Header */}
            <View style={[styles.panelHeader, { backgroundColor: C.surfaceAlt, borderBottomColor: C.border }]}>
              <View style={styles.panelHeaderLeft}>
                <Feather name="bell" size={16} color="#6366f1" />
                <Text style={[styles.panelTitle, { color: C.text }]}>{t('notifications')}</Text>
                {count > 0 && (
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>{count}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => setOpen(false)} style={styles.closeBtn} hitSlop={8}>
                <Feather name="x" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            {/* Content */}
            {items.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Feather name="bell-off" size={28} color="#D1D5DB" />
                </View>
                <Text style={styles.emptyText}>{t('noNotifications')}</Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => item.id}
                extraData={count}
                style={styles.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  if (item.type === 'study-reminder') {
                    const dismissOne = () => {
                      if (item.dismissKind === 'daily') dismissDailyForToday();
                      else dismissBellItem(item.id);
                    };
                    return (
                      <View style={[styles.card, { borderBottomColor: C.border }]}>
                        <View style={[styles.cardIconWrap, { backgroundColor: C.iconBg }]}>
                          <Feather name="clock" size={18} color={C.iconTint} />
                        </View>
                        <View style={styles.cardBody}>
                          <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={2}>
                            {item.title}
                          </Text>
                          <Text style={styles.cardDeck} numberOfLines={2}>
                            {item.body}
                          </Text>
                        </View>
                        <View style={styles.cardActions}>
                          <TouchableOpacity
                            style={styles.acceptBtn}
                            onPress={() => {
                              dismissOne();
                              setOpen(false);
                              router.push('/(tabs)');
                            }}
                            activeOpacity={0.8}
                          >
                            <Feather name="play" size={14} color="#fff" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.declineBtn}
                            onPress={dismissOne}
                            activeOpacity={0.8}
                          >
                            <Feather name="x" size={14} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  }

                  const invitation = item.invitation;
                  const isFlashing = flash?.id === invitation.deck_id;
                  return (
                    <View style={[styles.card, { borderBottomColor: C.border }, isFlashing && styles.cardFlash]}>
                      {/* Icon */}
                      <View style={[styles.cardIconWrap, { backgroundColor: C.iconBg }, isFlashing && (flash?.ok ? styles.cardIconOk : styles.cardIconNo)]}>
                        <Feather
                          name={isFlashing ? (flash?.ok ? 'check' : 'x') : 'users'}
                          size={18}
                          color={isFlashing ? '#fff' : C.iconTint}
                        />
                      </View>

                      {/* Text */}
                      <View style={styles.cardBody}>
                        {isFlashing ? (
                          <Text style={[styles.flashMsg, flash?.ok ? styles.flashOk : styles.flashNo]}>
                            {flash?.ok ? t('invitationAccepted') : t('invitationDeclined')}
                          </Text>
                        ) : (
                          <>
                            <Text style={[styles.cardTitle, { color: C.text }]} numberOfLines={2}>
                              {t('coauthorInviteFrom')}{' '}
                              <Text style={[styles.cardBold, { color: C.text }]}>{invitation.inviter_name}</Text>
                            </Text>
                            <Text style={styles.cardDeck} numberOfLines={1}>
                              "{invitation.deck_title}"
                            </Text>
                          </>
                        )}
                      </View>

                      {/* Buttons */}
                      {!isFlashing && (
                        <View style={styles.cardActions}>
                          {responding === invitation.deck_id ? (
                            <ActivityIndicator size="small" color="#6366f1" />
                          ) : (
                            <>
                              <TouchableOpacity
                                style={styles.acceptBtn}
                                onPress={() => respond(invitation.deck_id, true)}
                                activeOpacity={0.8}
                              >
                                <Feather name="check" size={14} color="#fff" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.declineBtn}
                                onPress={() => respond(invitation.deck_id, false)}
                                activeOpacity={0.8}
                              >
                                <Feather name="x" size={14} color="#fff" />
                              </TouchableOpacity>
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  );
                }}
              />
            )}

            {/* Footer hint */}
            {items.some((item) => item.type === 'invitation') && (
              <View style={styles.footer}>
                <Feather name="check-circle" size={12} color="#9CA3AF" />
                <Text style={styles.footerText}>
                  {t('accept')} / {t('decline')}
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const PANEL_WIDTH = 340;

const styles = StyleSheet.create({
  wrap: { position: 'relative' },

  btn: { padding: 8, position: 'relative' },

  badge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: Platform.OS === 'web' ? 'flex-start' : 'center',
    alignItems: Platform.OS === 'web' ? 'flex-end' : 'center',
    paddingTop: Platform.OS === 'web' ? 56 : 0,
    paddingRight: Platform.OS === 'web' ? 12 : 0,
  },

  panel: {
    width: PANEL_WIDTH,
    maxHeight: 500,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
  },

  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FAFAFA',
  },
  panelHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 15, fontWeight: '600', color: '#111827' },
  headerBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  closeBtn: { padding: 4 },

  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { color: '#9CA3AF', fontSize: 14 },

  list: { maxHeight: 400 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cardFlash: { backgroundColor: '#F9FAFB' },

  cardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardIconOk: { backgroundColor: '#22c55e' },
  cardIconNo: { backgroundColor: '#ef4444' },

  cardBody: { flex: 1 },
  cardTitle: { fontSize: 13, color: '#374151', lineHeight: 18 },
  cardBold: { fontWeight: '700', color: '#111827' },
  cardDeck: { fontSize: 12, color: '#6366f1', marginTop: 3, fontStyle: 'italic' },

  flashMsg: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  flashOk: { color: '#16a34a' },
  flashNo: { color: '#dc2626' },

  cardActions: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  acceptBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FAFAFA',
  },
  footerText: { fontSize: 11, color: '#9CA3AF' },
});
