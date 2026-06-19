import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Deck } from '@/assets/data/decks';
import {
  DECK_COMPLAINT_ISSUE_KEYS,
  type DeckComplaintIssueKey,
} from '@/src/constants/deckComplaints';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAppColors } from '@/src/contexts/ThemeContext';
import { translateModerationDisplayText } from '@/src/lib/geminiComplaint';
import { supabase } from '@/src/lib/supabase';
import { Text } from './Themed';

const ISSUE_LABEL_KEYS: Record<DeckComplaintIssueKey, string> = {
  spam_scam: 'complaintIssueSpamScam',
  hate_harassment: 'complaintIssueHateHarassment',
  sexual_violence: 'complaintIssueSexualViolence',
  copyright: 'complaintIssueCopyright',
  misleading: 'complaintIssueMisleading',
  other: 'complaintIssueOther',
};

export type CommentComplaintTarget = {
  id: string;
  content: string;
  user_id: string;
};

export interface CommentComplaintModalProps {
  visible: boolean;
  deck: Deck | null;
  comment: CommentComplaintTarget | null;
  reporterId: string | null;
  onClose: () => void;
}

export function CommentComplaintModal({
  visible,
  deck,
  comment,
  reporterId,
  onClose,
}: CommentComplaintModalProps) {
  const { t } = useLanguage();
  const C = useAppColors();
  const [issueKey, setIssueKey] = useState<DeckComplaintIssueKey | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = useCallback(() => {
    setIssueKey(null);
    setDetails('');
    setSubmitting(false);
    setError(null);
    setDone(false);
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
    }
  }, [visible, reset]);

  const handleSubmit = async () => {
    if (!deck || !comment) return;
    if (!reporterId) {
      setError(t('mustBeLoggedIn'));
      return;
    }
    if (!issueKey) {
      setError(t('complaintSelectIssue'));
      return;
    }
    setError(null);
    setSubmitting(true);
    const trimmed = details.trim();
    const comment_content_uk = await translateModerationDisplayText(comment.content, 'uk');
    const { error: insertError } = await supabase.from('pack_comment_complaints').insert({
      comment_id: comment.id,
      deck_id: deck.deck_id,
      reporter_id: reporterId,
      issue_key: issueKey,
      details: trimmed.length > 0 ? trimmed : null,
      ...(comment_content_uk.trim() ? { comment_content_uk: comment_content_uk.trim() } : {}),
    });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message || t('complaintFailed'));
      return;
    }
    setDone(true);
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlayPress} onPress={handleClose}>
          <Pressable
            style={[styles.card, { backgroundColor: C.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: C.text }]}>{t('complaintReviewTitle')}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={12} disabled={submitting}>
                <Feather name="x" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>
            {deck ? (
              <Text style={[styles.deckName, { color: C.textSub }]} numberOfLines={2}>
                {deck.title}
              </Text>
            ) : null}
            {comment ? (
              <Text style={[styles.excerpt, { color: C.text }]} numberOfLines={4}>
                {comment.content}
              </Text>
            ) : null}

            {done ? (
              <View style={styles.doneBlock}>
                <View style={styles.doneIcon}>
                  <Feather name="check" size={28} color="#059669" />
                </View>
                <Text style={[styles.doneText, { color: C.textSub }]}>{t('complaintThankYou')}</Text>
                <TouchableOpacity style={styles.doneOkButton} onPress={handleClose} activeOpacity={0.85}>
                  <Text style={styles.primaryBtnText}>{t('ok')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={[styles.sectionLabel, { color: C.text }]}>{t('complaintWhatsWrong')}</Text>
                <ScrollView
                  style={styles.issueList}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {DECK_COMPLAINT_ISSUE_KEYS.map((key) => {
                    const selected = issueKey === key;
                    return (
                      <Pressable
                        key={key}
                        style={[
                          styles.issueRow,
                          { backgroundColor: C.inputBg, borderColor: C.inputBorder },
                          selected && {
                            borderColor: C.tint,
                            backgroundColor: C.isDark ? 'rgba(165,180,252,0.1)' : 'rgba(66,85,255,0.06)',
                          },
                        ]}
                        onPress={() => {
                          setIssueKey(key);
                          setError(null);
                        }}
                      >
                        <View
                          style={[
                            styles.radioOuter,
                            { borderColor: C.isDark ? '#4b5563' : '#c4c9d4' },
                            selected && { borderColor: C.tint },
                          ]}
                        >
                          {selected ? <View style={[styles.radioInner, { backgroundColor: C.tint }]} /> : null}
                        </View>
                        <Text style={[styles.issueLabel, { color: C.text }, selected && { fontWeight: '600' }]}>
                          {t(ISSUE_LABEL_KEYS[key])}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.sectionLabel, { color: C.text }]}>{t('complaintDetailsLabel')}</Text>
                <TextInput
                  style={[
                    styles.textArea,
                    { backgroundColor: C.inputBg, borderColor: C.inputBorder, color: C.text },
                  ]}
                  value={details}
                  onChangeText={setDetails}
                  placeholder={t('complaintDetailsPlaceholder')}
                  placeholderTextColor={C.placeholder}
                  multiline
                  maxLength={2000}
                  textAlignVertical="top"
                  editable={!submitting}
                />

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: C.border }]}
                    onPress={handleClose}
                    disabled={submitting}
                  >
                    <Text style={[styles.secondaryBtnText, { color: C.textSub }]}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>{t('complaintSubmit')}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  overlayPress: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
  },
  card: {
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  deckName: {
    fontSize: 14,
    marginBottom: 8,
  },
  excerpt: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
    fontStyle: 'italic',
    opacity: 0.92,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  issueList: {
    maxHeight: 220,
    marginBottom: 14,
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  issueLabel: {
    flex: 1,
    fontSize: 14,
  },
  textArea: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4255ff',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  doneBlock: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  doneIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  doneText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  doneOkButton: {
    alignSelf: 'stretch',
    width: '100%' as const,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#4255ff',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
});
