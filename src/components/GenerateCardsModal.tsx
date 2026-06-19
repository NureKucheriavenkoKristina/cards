import Feather from '@expo/vector-icons/Feather';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAppColors } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { generateCards, GeneratedCard } from '@/src/lib/gemini';
import { keyboardAvoidingBehavior } from '@/src/lib/keyboardAvoiding';
import { supabase } from '@/src/lib/supabase';

const COUNT_OPTIONS = [5, 10, 15, 20];

interface Props {
  visible: boolean;
  deckId: string;
  deckTitle?: string;
  deckDescription?: string | null;
  onClose: () => void;
  onSaved: (count: number) => void;
}

export default function GenerateCardsModal({ visible, deckId, deckTitle, deckDescription, onClose, onSaved }: Props) {
  const C = useAppColors();
  const { t, locale } = useLanguage();

  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(10);
  const [cards, setCards] = useState<GeneratedCard[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'preview'>('form');

  const handleClose = () => {
    setTopic('');
    setCards([]);
    setError(null);
    setStep('form');
    onClose();
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    setError(null);
    const { cards: generated, error: genError } = await generateCards(
      topic.trim(),
      count,
      locale === 'uk' ? 'uk' : 'en',
      deckTitle,
      deckDescription,
    );
    setIsGenerating(false);
    if (generated.length === 0) {
      if (genError === 'no_api_key') {
        setError(t('aiGenerateCardsNoKey'));
      } else if (genError === 'service_error') {
        setError(t('aiGenerateCardsServiceDown'));
      } else {
        setError(t('aiGenerateCardsEmpty'));
      }
      return;
    }
    setCards(generated);
    setStep('preview');
  };

  const handleSave = async () => {
    if (cards.length === 0) return;
    setIsSaving(true);
    setError(null);
    const rows = cards.map(c => ({
      deck_id: deckId,
      card_type: 'basic' as const,
      front_text: c.front.trim(),
      back_text: c.back.trim(),
    }));
    const { error: insertError } = await supabase.from('cards').insert(rows);
    setIsSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onSaved(cards.length);
    handleClose();
  };

  const removeCard = (idx: number) => {
    setCards(prev => prev.filter((_, i) => i !== idx));
  };

  const bg = C.isDark ? '#1a2535' : '#fff';
  const overlay = C.isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={keyboardAvoidingBehavior()}
        style={[styles.overlay, { backgroundColor: overlay }]}
      >
        <View style={[styles.sheet, { backgroundColor: bg }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: C.borderLight }]}>
            <View style={styles.headerLeft}>
              <View style={[styles.headerIcon, { backgroundColor: C.aiAccentBg }]}>
                <Feather name="zap" size={18} color={C.tint} />
              </View>
              <Text style={[styles.headerTitle, { color: C.text }]}>{t('aiGenerateCards')}</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={10}>
              <Feather name="x" size={22} color={C.textSub} />
            </Pressable>
          </View>

          {step === 'form' ? (
            <View style={styles.body}>
              {/* Topic input */}
              <Text style={[styles.label, { color: C.textSub }]}>{t('aiGenerateCardsTopic')}</Text>
              <View style={[styles.inputWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                <Feather name="edit-3" size={15} color={C.placeholder} style={{ marginRight: 8 }} />
                <TextInput
                  style={[styles.input, { color: C.text }]}
                  placeholder={t('aiGenerateCardsTopicPlaceholder')}
                  placeholderTextColor={C.placeholder}
                  value={topic}
                  onChangeText={setTopic}
                  multiline
                  textAlignVertical="top"
                  returnKeyType="done"
                />
              </View>

              {/* Count picker */}
              <Text style={[styles.label, { color: C.textSub, marginTop: 16 }]}>{t('aiGenerateCardsCount')}</Text>
              <View style={styles.countRow}>
                {COUNT_OPTIONS.map(n => (
                  <TouchableOpacity
                    key={n}
                    style={[
                      styles.countChip,
                      { borderColor: count === n ? C.tint : C.border, backgroundColor: count === n ? (C.isDark ? 'rgba(99,102,241,0.18)' : 'rgba(66,85,255,0.08)') : C.inputBg },
                    ]}
                    onPress={() => setCount(n)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.countChipTxt, { color: count === n ? C.tint : C.textSub }]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {error && <Text style={[styles.errorTxt, { color: '#ef4444' }]}>{error}</Text>}

              <TouchableOpacity
                style={[styles.generateBtn, { backgroundColor: !topic.trim() || isGenerating ? C.border : C.aiButtonFill }]}
                disabled={!topic.trim() || isGenerating}
                activeOpacity={0.8}
                onPress={handleGenerate}
              >
                {isGenerating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Feather name="zap" size={16} color="#fff" />
                )}
                <Text style={styles.generateBtnTxt}>
                  {isGenerating ? t('aiGenerateCardsGenerating') : t('aiGenerateCardsGenerate')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.body}>
              <View style={styles.previewHeader}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setStep('form')}
                  activeOpacity={0.7}
                >
                  <Feather name="arrow-left" size={15} color={C.textSub} />
                  <Text style={[styles.backBtnTxt, { color: C.textSub }]}>{t('aiGenerateCardsGenerate')}</Text>
                </TouchableOpacity>
                <Text style={[styles.previewCount, { color: C.textMuted }]}>
                  {cards.length} cards
                </Text>
              </View>

              <FlatList
                data={cards}
                keyExtractor={(_, i) => String(i)}
                style={styles.list}
                renderItem={({ item, index }) => (
                  <View style={[styles.cardRow, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
                    <View style={styles.cardTexts}>
                      <Text style={[styles.cardFront, { color: C.text }]} numberOfLines={2}>{item.front}</Text>
                      <Text style={[styles.cardBack, { color: C.textSub }]} numberOfLines={3}>{item.back}</Text>
                    </View>
                    <Pressable onPress={() => removeCard(index)} hitSlop={8} style={styles.removeBtn}>
                      <Feather name="x" size={16} color={C.textMuted} />
                    </Pressable>
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />

              {error && <Text style={[styles.errorTxt, { color: '#ef4444' }]}>{error}</Text>}

              <TouchableOpacity
                style={[styles.generateBtn, { backgroundColor: isSaving || cards.length === 0 ? C.border : '#10b981' }]}
                disabled={isSaving || cards.length === 0}
                activeOpacity={0.8}
                onPress={handleSave}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Feather name="check" size={16} color="#fff" />
                )}
                <Text style={styles.generateBtnTxt}>
                  {isSaving ? t('aiGenerateCardsSaving') : t('aiGenerateCardsSave')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  countRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countChip: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countChipTxt: {
    fontSize: 15,
    fontWeight: '700',
  },
  errorTxt: {
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14,
  },
  generateBtnTxt: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backBtnTxt: {
    fontSize: 13,
  },
  previewCount: {
    fontSize: 13,
  },
  list: {
    flex: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  cardTexts: {
    flex: 1,
    gap: 4,
  },
  cardFront: {
    fontSize: 14,
    fontWeight: '600',
  },
  cardBack: {
    fontSize: 13,
  },
  removeBtn: {
    paddingTop: 2,
  },
});
