import Feather from '@expo/vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import React, { useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';

/** Web: hide browser default focus outline on TextInput. */
const webTextInputNoOutline: TextStyle | undefined =
  Platform.OS === 'web'
    ? ({ outlineWidth: 0, outlineStyle: 'none' } as unknown as TextStyle)
    : undefined;

import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAppColors } from '@/src/contexts/ThemeContext';
import { supabase } from '@/src/lib/supabase';

type MessageType = 'bug' | 'suggestion' | 'complaint';

const SECTIONS = [
  { icon: 'layers' as const,      titleKey: 'helpSection1Title', textKey: 'helpSection1Text' },
  { icon: 'credit-card' as const, titleKey: 'helpSection2Title', textKey: 'helpSection2Text' },
  { icon: 'book-open' as const,   titleKey: 'helpSection3Title', textKey: 'helpSection3Text' },
  { icon: 'globe' as const,       titleKey: 'helpSection4Title', textKey: 'helpSection4Text' },
  { icon: 'zap' as const,         titleKey: 'helpSection5Title', textKey: 'helpSection5Text' },
  { icon: 'life-buoy' as const,   titleKey: 'helpSection6Title', textKey: 'helpSection6Text' },
];

export default function HelpScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const C = useAppColors();
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('help') });
  }, [navigation, t]);

  const [msgType, setMsgType] = useState<MessageType>('bug');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const MESSAGE_TYPES: { key: MessageType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
    { key: 'bug',        label: t('helpContactTypeBug'),        icon: 'alert-circle' },
    { key: 'suggestion', label: t('helpContactTypeSuggestion'), icon: 'lightbulb' },
    { key: 'complaint',  label: t('helpContactTypeComplaint'),  icon: 'alert-triangle' },
  ];

  const handleSend = async () => {
    if (!message.trim()) return;
    if (!user) { setStatus('error'); return; }
    setIsSending(true);
    setStatus('idle');
    const { error } = await supabase.from('support_messages').insert({
      user_id: user.id,
      type: msgType,
      message: message.trim(),
    });
    setIsSending(false);
    if (error) { setStatus('error'); return; }
    setStatus('success');
    setMessage('');
  };

  const bg = C.bg;
  const surface = C.surface;

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── HERO ── */}
        <View style={[styles.hero, { backgroundColor: C.isDark ? '#1a2535' : '#eef0ff' }]}>
          <View style={[styles.heroIcon, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.1)' }]}>
            <Feather name="book-open" size={32} color="#6366f1" />
          </View>
          <Text style={[styles.heroTitle, { color: C.text }]}>{t('helpIntroTitle')}</Text>
          <Text style={[styles.heroSub, { color: C.textSub }]}>{t('helpIntroText')}</Text>
        </View>

        {/* ── GUIDE SECTIONS ── */}
        <View style={styles.sections}>
          {SECTIONS.map((s, i) => (
            <View key={i} style={[styles.sectionCard, { backgroundColor: surface, borderColor: C.borderLight }]}>
              <View style={[styles.sectionIconWrap, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.12)' : '#eef0ff' }]}>
                <Feather name={s.icon} size={18} color="#6366f1" />
              </View>
              <View style={styles.sectionBody}>
                <Text style={[styles.sectionTitle, { color: C.text }]}>{t(s.titleKey)}</Text>
                <Text style={[styles.sectionText, { color: C.textSub }]}>{t(s.textKey)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── CONTACT FORM ── */}
        <View style={[styles.formCard, { backgroundColor: surface, borderColor: C.borderLight }]}>
          {/* Header */}
          <View style={styles.formHeader}>
            <View style={[styles.formHeaderIcon, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#eef0ff' }]}>
              <Feather name="send" size={18} color="#6366f1" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.formTitle, { color: C.text }]}>{t('helpContactTitle')}</Text>
              <Text style={[styles.formSubtitle, { color: C.textSub }]}>{t('helpContactSubtitle')}</Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: C.borderLight }]} />

          {/* Type picker */}
          <Text style={[styles.label, { color: C.textSub }]}>{t('helpContactType')}</Text>
          <View style={styles.typeRow}>
            {MESSAGE_TYPES.map(mt => {
              const active = msgType === mt.key;
              return (
                <TouchableOpacity
                  key={mt.key}
                  style={[
                    styles.typeChip,
                    {
                      borderColor: active ? C.tint : C.border,
                      backgroundColor: active
                        ? (C.isDark ? 'rgba(165,180,252,0.18)' : 'rgba(99,102,241,0.1)')
                        : C.inputBg,
                    },
                  ]}
                  onPress={() => setMsgType(mt.key)}
                  activeOpacity={0.8}
                >
                  <Feather name={mt.icon} size={13} color={active ? C.tint : C.textMuted} />
                  <Text style={[styles.typeChipTxt, { color: active ? C.tint : C.textMuted }]} numberOfLines={2}>
                    {mt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Message input */}
          <Text style={[styles.label, { color: C.textSub, marginTop: 16 }]}>{t('helpContactMessage')}</Text>
          <View style={[
            styles.inputWrap,
            { backgroundColor: C.inputBg, borderColor: C.inputBorder },
          ]}>
            <TextInput
              style={[styles.input, webTextInputNoOutline, { color: C.text }]}
              placeholder={t('helpContactMessagePlaceholder')}
              placeholderTextColor={C.placeholder}
              value={message}
              onChangeText={text => { setMessage(text); setStatus('idle'); }}
              multiline
              textAlignVertical="top"
            />
            {message.length > 0 && (
              <Pressable onPress={() => setMessage('')} hitSlop={8} style={styles.clearBtn}>
                <Feather name="x-circle" size={16} color={C.placeholder} />
              </Pressable>
            )}
          </View>

          {/* Status */}
          {status === 'success' && (
            <View style={styles.statusRow}>
              <Feather name="check-circle" size={15} color="#10b981" />
              <Text style={[styles.statusTxt, { color: '#10b981' }]}>{t('helpContactSuccess')}</Text>
            </View>
          )}
          {status === 'error' && (
            <View style={styles.statusRow}>
              <Feather name="alert-circle" size={15} color="#ef4444" />
              <Text style={[styles.statusTxt, { color: '#ef4444' }]}>
                {!user ? t('helpContactLoginRequired') : t('helpContactError')}
              </Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: !message.trim() || isSending ? C.border : '#6366f1' },
            ]}
            disabled={!message.trim() || isSending}
            activeOpacity={0.85}
            onPress={handleSend}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Feather name="send" size={16} color="#fff" />
            )}
            <Text style={styles.sendBtnTxt}>
              {isSending ? t('helpContactSending') : t('helpContactSend')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 24 },

  // Hero
  hero: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 12,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroSub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 480,
  },

  // Sections
  sections: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  sectionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  sectionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sectionBody: { flex: 1, gap: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionText:  { fontSize: 13, lineHeight: 20 },

  // Form
  formCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 0,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  formHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formTitle:    { fontSize: 16, fontWeight: '700' },
  formSubtitle: { fontSize: 13, marginTop: 2 },
  divider:      { height: 1, marginBottom: 16 },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  typeChipTxt: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  inputWrap: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 110,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    minHeight: 90,
  },
  clearBtn:  { paddingTop: 2, marginLeft: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  statusTxt: { fontSize: 13 },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 12,
  },
  sendBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
