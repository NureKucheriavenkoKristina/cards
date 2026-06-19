import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BookOpen } from 'lucide-react-native';
import React from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAppColors } from '@/src/contexts/ThemeContext';

const APP_VERSION = '1.0.0';

const TECH_STACK = [
  { icon: 'smartphone' as const, label: 'Expo / React Native' },
  { icon: 'database'   as const, label: 'Supabase' },
  { icon: 'zap'        as const, label: 'Gemini AI' },
  { icon: 'image'      as const, label: 'Pixabay' },
];

export default function ModalScreen() {
  const C = useAppColors();
  const { t } = useLanguage();
  const router = useRouter();

  return (
    <View style={[styles.root, { backgroundColor: C.bg }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Logo + name ── */}
        <View style={[styles.hero, { backgroundColor: C.isDark ? '#1a2535' : '#eef0ff' }]}>
          <View style={[styles.logoWrap, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.12)' }]}>
            <BookOpen size={38} color="#6366f1" />
          </View>
          <Text style={[styles.appName, { color: C.text }]}>Cardly</Text>
          <View style={[styles.versionBadge, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.1)', borderColor: C.isDark ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.2)' }]}>
            <Text style={[styles.versionTxt, { color: '#6366f1' }]}>v{APP_VERSION}</Text>
          </View>
          <Text style={[styles.tagline, { color: C.textSub }]}>{t('helpIntroText')}</Text>
        </View>

        {/* ── Tech stack ── */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
          <Text style={[styles.cardTitle, { color: C.textSub }]}>{t('builtWith')}</Text>
          <View style={styles.techGrid}>
            {TECH_STACK.map(tech => (
              <View key={tech.label} style={[styles.techChip, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.08)' : '#f5f3ff', borderColor: C.borderLight }]}>
                <Feather name={tech.icon} size={14} color="#6366f1" />
                <Text style={[styles.techTxt, { color: C.text }]}>{tech.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Actions ── */}
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.borderLight, gap: 0, padding: 0, overflow: 'hidden' }]}>
          <ActionRow
            icon="life-buoy"
            label={t('help')}
            color="#6366f1"
            C={C}
            onPress={() => { router.back(); setTimeout(() => router.push('/help'), 50); }}
            border
          />
          <ActionRow
            icon="mail"
            label={t('helpContactTitle')}
            color="#0ea5e9"
            C={C}
            onPress={() => { router.back(); setTimeout(() => router.push('/help'), 50); }}
            border
          />
          <ActionRow
            icon="github"
            label="GitHub"
            color={C.isDark ? '#e2e8f0' : '#1e293b'}
            C={C}
            onPress={() => Linking.openURL('https://github.com/NureBureikoNataliia/Cardly')}
          />
        </View>

        {/* ── Footer ── */}
        <Text style={[styles.footer, { color: C.textMuted }]}>
          © {new Date().getFullYear()} Cardly. Made with ♥
        </Text>
      </ScrollView>

      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}

function ActionRow({ icon, label, color, C, onPress, border }: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
  C: ReturnType<typeof useAppColors>;
  onPress: () => void;
  border?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionRow, border && { borderBottomWidth: 1, borderBottomColor: C.borderLight }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${color}18` }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.actionLabel, { color: C.text }]}>{label}</Text>
      <Feather name="chevron-right" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  scroll: { paddingBottom: 32 },

  hero: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 10,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  versionBadge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  versionTxt: { fontSize: 12, fontWeight: '600' },
  tagline: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
    marginTop: 4,
  },

  card: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  techGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  techChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  techTxt: { fontSize: 13, fontWeight: '500' },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { flex: 1, fontSize: 15, fontWeight: '500' },

  footer: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 24,
  },
});
