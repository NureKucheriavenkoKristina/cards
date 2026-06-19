import Feather from '@expo/vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { FormTextInputRow } from '@/src/components/FormTextInputRow';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAppColors } from '@/src/contexts/ThemeContext';
import { useLayoutWidth } from '@/src/hooks/useLayoutWidth';
import { generateDeckDescription, generateCardImageUrl } from '@/src/lib/gemini';
import { keyboardAvoidingBehavior } from '@/src/lib/keyboardAvoiding';
import { persistDeckCoverUrlIfNeeded } from '@/src/lib/uploadRemoteImage';
import { uploadAudioErrorKey } from '@/src/lib/uploadCardAudio';

export default function AddDeckScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ deckId?: string }>();
  const deckId =
    typeof params.deckId === 'string'
      ? params.deckId
      : Array.isArray(params.deckId)
      ? params.deckId[0]
      : undefined;
  const { user } = useAuth();
  const { t } = useLanguage();
  const C = useAppColors();
  const layoutWidth = useLayoutWidth();
  /** Cover height from screen width on native — keyboard must not resize the hero block. */
  const [nativeCoverLayoutWidth] = useState(() => Dimensions.get('screen').width);
  const coverLayoutWidth = Platform.OS === 'web' ? layoutWidth : nativeCoverLayoutWidth;
  const isEdit = Boolean(deckId);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEdit ? t('editDeck') : t('createNewDeck'),
    });
  }, [navigation, isEdit, t]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);
  const [imgRatio, setImgRatio] = useState<number | null>(null);
  const [isAiDesc, setIsAiDesc] = useState(false);
  const [isAiCover, setIsAiCover] = useState(false);

  useEffect(() => {
    if (!deckId || !user) return;
    (async () => {
      const { data, error: fetchError } = await supabase
        .from('decks')
        .select('*')
        .eq('deck_id', deckId)
        .eq('creator_id', user.id)
        .single();
      if (fetchError || !data) {
        setError(t('deckNotFoundOrNoAccess'));
        return;
      }
      setTitle(data.title ?? '');
      setDescription(data.description ?? '');
      setCoverUrl(data.cover_image_url ?? '');
      setIsPublic(data.is_public ?? true);
    })().finally(() => setIsLoading(false));
  }, [deckId, user]);

  const isValid = title.trim().length > 0;

  const handleSave = async () => {
    if (!user) { setError(t('mustBeLoggedIn')); return; }
    if (!isValid || isSaving) return;
    setIsSaving(true);
    setError(null);

    let coverToSave = coverUrl.trim() || null;
    if (coverToSave) {
      const persisted = await persistDeckCoverUrlIfNeeded({
        coverUrl: coverToSave,
        userId: user.id,
        deckId,
      });
      if (!persisted.ok) {
        const key = uploadAudioErrorKey(persisted.error);
        const byKey: Record<string, string> = {
          too_large: t('uploadAudioTooLarge'),
          not_authenticated: t('uploadAudioNeedLogin'),
          bucket_missing: t('uploadAudioBucketMissing'),
          permission: t('uploadAudioPermission'),
        };
        setError(byKey[key] ?? t('aiImageUploadFailed'));
        setIsSaving(false);
        return;
      }
      coverToSave = persisted.url || null;
    }

    if (isEdit && deckId) {
      const { error: e } = await supabase
        .from('decks')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          cover_image_url: coverToSave,
          is_public: isPublic,
        })
        .eq('deck_id', deckId)
        .eq('creator_id', user.id);
      if (e) { setError(e.message); setIsSaving(false); return; }
    } else {
      const { error: e } = await supabase
        .from('decks')
        .insert({
          creator_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          cover_image_url: coverToSave,
          is_public: isPublic,
        })
        .select('*')
        .single();
      if (e) { setError(e.message); setIsSaving(false); return; }
    }
    router.back();
  };

  const hasCover = coverUrl.trim().length > 0;
  const coverH = imgRatio
    ? Math.min(Math.max((coverLayoutWidth - 48) / imgRatio, 120), 380)
    : 160;

  return (
    <KeyboardAvoidingView
      behavior={keyboardAvoidingBehavior()}
      style={{ flex: 1, backgroundColor: C.bg }}
    >
      <ScrollView
        contentContainerStyle={styles.scrollOuter}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={Platform.OS === 'web'}
        removeClippedSubviews={Platform.OS === 'android' ? false : undefined}
      >
      <View style={styles.formContainer}>

        {/* ── HERO HEADER ── */}
        <View style={styles.hero}>
          <View style={[styles.heroBadge, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.18)' : '#eff1ff' }]}>
            <Feather name={isEdit ? 'edit-3' : 'layers'} size={20} color={C.tint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: C.text }]}>
              {isEdit ? t('editDeck') : t('createNewDeck')}
            </Text>
            <Text style={[styles.heroSub, { color: C.textSub }]}>
              {isEdit ? t('deckSubtitleEdit') : t('deckSubtitleCreate')}
            </Text>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={C.tint} />
          </View>
        ) : (
          <>
            {/* ── COVER BLOCK ── */}
            <View style={[styles.coverWrap, { height: coverH, backgroundColor: C.isDark ? C.surfaceAlt : '#edeef6' }]}>
              {hasCover ? (
                <>
                  <Image
                    source={{ uri: coverUrl.trim() }}
                    style={[
                      StyleSheet.absoluteFill,
                      Platform.OS === 'web' ? { objectFit: (imgRatio && imgRatio < 1.4 ? 'contain' : 'cover') as const } : null,
                    ]}
                    resizeMode={imgRatio && imgRatio < 1.4 ? 'contain' : 'cover'}
                    onLoad={e => {
                      const source = e.nativeEvent?.source;
                      if (source?.width && source?.height) {
                        setImgRatio(source.width / source.height);
                      }
                    }}
                    onError={() => setImgRatio(null)}
                  />
                  {/* dim overlay */}
                  <View style={styles.coverOverlay} />
                  <Pressable
                    style={styles.coverClear}
                    onPress={() => { setCoverUrl(''); setImgRatio(null); }}
                    hitSlop={6}
                  >
                    <Feather name="x" size={14} color="#fff" />
                  </Pressable>
                </>
              ) : (
                <View style={styles.coverEmpty}>
                  <View style={[styles.coverEmptyIcon, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.12)' : '#e0e3f8' }]}>
                    <Feather name="image" size={28} color={C.tint} />
                  </View>
                  <Text style={[styles.coverEmptyTitle, { color: C.textSub }]}>{t('coverPreview')}</Text>
                  <Text style={[styles.coverEmptyHint, { color: C.textMuted }]}>{t('coverImageUrl')}</Text>
                </View>
              )}
            </View>

            {/* ── FORM CARD ── */}
            <View style={[styles.card, { backgroundColor: C.surface }]}>

              {/* TITLE */}
              <Field label={t('title')} required>
                <FormTextInputRow
                  icon="type"
                  placeholder={t('title')}
                  value={title}
                  onChangeText={setTitle}
                  showClear
                />
              </Field>

              {/* DESCRIPTION */}
              <Field
                label={t('description')}
                labelRight={
                  <TouchableOpacity
                    style={[styles.aiBtn, { backgroundColor: C.aiAccentBg, borderColor: C.aiAccentBorder }]}
                    disabled={!title.trim() || isAiDesc}
                    activeOpacity={0.7}
                    onPress={async () => {
                      if (!title.trim()) return;
                      setIsAiDesc(true);
                      const result = await generateDeckDescription(title.trim(), description);
                      setIsAiDesc(false);
                      if (result) setDescription(result);
                    }}
                  >
                    {isAiDesc ? (
                      <ActivityIndicator size="small" color={C.tint} />
                    ) : (
                      <Feather name="zap" size={12} color={C.tint} />
                    )}
                    <Text style={[styles.aiBtnTxt, { color: C.tint }]}>
                      {isAiDesc ? t('aiGenerateDescLoading') : t('aiGenerateDesc')}
                    </Text>
                  </TouchableOpacity>
                }
              >
                <FormTextInputRow
                  icon="align-left"
                  placeholder={t('description')}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  inputStyle={styles.inputMulti}
                />
              </Field>

              {/* COVER URL */}
              <Field
                label={t('coverImageUrl')}
                labelRight={
                  <TouchableOpacity
                    style={[styles.aiBtn, { backgroundColor: C.aiAccentBg, borderColor: C.aiAccentBorder }]}
                    disabled={!title.trim() || isAiCover}
                    activeOpacity={0.7}
                    onPress={async () => {
                      if (!title.trim()) return;
                      setIsAiCover(true);
                      const result = await generateCardImageUrl(
                        title.trim(),
                        title.trim(),
                        description || null,
                        'front',
                        user
                          ? {
                              userId: user.id,
                              deckId,
                              kind: 'deck-cover',
                            }
                          : undefined,
                      );
                      setIsAiCover(false);
                      if (result.ok) {
                        setCoverUrl(result.url);
                        setImgRatio(null);
                      } else if (result.reason === 'quota') {
                        setError(t('aiErrorQuota'));
                      } else if (result.reason === 'no_match') {
                        setError(t('aiErrorNoImage'));
                      } else if (result.reason === 'not_authenticated') {
                        setError(t('uploadAudioNeedLogin'));
                      } else if (result.reason === 'upload_failed') {
                        setError(t('aiImageUploadFailed'));
                      }
                    }}
                  >
                    {isAiCover ? (
                      <ActivityIndicator size="small" color={C.tint} />
                    ) : (
                      <Feather name="image" size={12} color={C.tint} />
                    )}
                    <Text style={[styles.aiBtnTxt, { color: C.tint }]}>
                      {isAiCover ? t('aiGenerateImageLoading') : t('aiGenerateImage')}
                    </Text>
                  </TouchableOpacity>
                }
              >
                <FormTextInputRow
                  icon="link-2"
                  placeholder="https://..."
                  value={coverUrl}
                  onChangeText={text => {
                    setCoverUrl(text);
                    if (!text.trim()) setImgRatio(null);
                  }}
                  showClear
                  keyboardType="url"
                  autoCapitalize="none"
                />
              </Field>

              {/* VISIBILITY */}
              <View
                style={[
                  styles.toggleRow,
                  { backgroundColor: C.inputBg, borderColor: C.inputBorder },
                  isPublic && {
                    borderColor: C.isDark ? 'rgba(165,180,252,0.35)' : 'rgba(66,85,255,0.25)',
                    backgroundColor: C.isDark ? 'rgba(99,102,241,0.14)' : '#f6f7ff',
                  },
                ]}
              >
                <View
                  style={[
                    styles.toggleIcon,
                    isPublic ? styles.toggleIconOn : styles.toggleIconOff,
                    isPublic && C.isDark && { backgroundColor: 'rgba(99,102,241,0.2)' },
                  ]}
                >
                  <Feather name={isPublic ? 'globe' : 'lock'} size={17} color={isPublic ? C.tint : C.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.toggleLabel, { color: C.text }]}>
                    {isPublic ? t('public') : t('private')}
                  </Text>
                  <Text style={[styles.toggleHint, { color: C.textMuted }]} numberOfLines={1}>
                    {t('publicDeckHelp')}
                  </Text>
                </View>
                <Switch
                  value={isPublic}
                  onValueChange={setIsPublic}
                  trackColor={{
                    false: C.isDark ? '#3d4f66' : '#e5e7eb',
                    true: C.isDark ? 'rgba(165,180,252,0.35)' : 'rgba(66,85,255,0.28)',
                  }}
                  thumbColor={isPublic ? C.tint : (C.isDark ? '#64748b' : '#d1d5db')}
                  ios_backgroundColor={C.isDark ? '#3d4f66' : '#e5e7eb'}
                />
              </View>

              {/* ERROR */}
              {error ? (
                <View
                  style={[
                    styles.errorBox,
                    {
                      backgroundColor: C.isDark ? 'rgba(220,38,38,0.12)' : '#fef2f2',
                      borderColor: C.isDark ? 'rgba(248,113,113,0.35)' : '#fecaca',
                    },
                  ]}
                >
                  <Feather name="alert-circle" size={15} color="#dc2626" />
                  <Text style={styles.errorTxt}>{error}</Text>
                </View>
              ) : null}
            </View>

            {/* ── BUTTONS ── */}
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.btnCancel, { backgroundColor: C.surface, borderColor: C.border }]}
                onPress={() => router.back()}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnCancelTxt, { color: C.textSub }]}>{t('cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnSave, (!isValid || isSaving) && styles.btnSaveOff]}
                onPress={handleSave}
                disabled={!isValid || isSaving}
                activeOpacity={0.85}
              >
                {isSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : (
                    <>
                      <Feather name="check" size={18} color="#fff" />
                      <Text style={styles.btnSaveTxt}>{isEdit ? t('update') : t('create')}</Text>
                    </>
                  )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ─── HELPER SUB-COMPONENTS ─── */
function Field({
  label,
  required,
  labelRight,
  children,
}: {
  label: string;
  required?: boolean;
  labelRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const C = useAppColors();
  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[styles.fieldLabel, { color: C.textSub }]}>
          {label}
          {required && <Text style={{ color: '#ef4444' }}> *</Text>}
        </Text>
        {labelRight}
      </View>
      {children}
    </View>
  );
}

/* ─── STYLES ─── */
const styles = StyleSheet.create({
  scrollOuter: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingBottom: 36,
  },
  formContainer: {
    width: '100%',
    maxWidth: 860,
    paddingHorizontal: 16,
    gap: 14,
  },
  scroll: {
    padding: 16,
    paddingBottom: 36,
    gap: 14,
  },

  /* HERO */
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  heroBadge: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#eff1ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '700',
    color: '#111827',
  },
  heroSub: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },

  /* LOADING */
  loading: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* COVER */
  coverWrap: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#edeef6',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  coverClear: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coverEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#e0e3f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b96b0',
  },
  coverEmptyHint: {
    fontSize: 12,
    color: '#b0b8c8',
  },

  /* CARD */
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    gap: 16,
    shadowColor: '#4255ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },

  /* FIELD */
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  aiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  aiBtnTxt: {
    fontSize: 11,
    fontWeight: '600',
  },

  inputMulti: {
    minHeight: 68,
  },

  /* TOGGLE */
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#f7f8fb',
    borderWidth: 1.5,
    borderColor: '#e8eaee',
  },
  toggleRowActive: {
    borderColor: 'rgba(66,85,255,0.25)',
    backgroundColor: '#f6f7ff',
  },
  toggleIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIconOn: {
    backgroundColor: '#eff1ff',
  },
  toggleIconOff: {
    backgroundColor: '#f3f4f6',
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  toggleHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 1,
  },

  /* ERROR */
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorTxt: {
    flex: 1,
    color: '#dc2626',
    fontSize: 13,
  },

  /* BUTTONS */
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  btnCancel: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e2e4ec',
  },
  btnCancelTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
  btnSave: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4255ff',
    shadowColor: '#4255ff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  btnSaveOff: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnSaveTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
