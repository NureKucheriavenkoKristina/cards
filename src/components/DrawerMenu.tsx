/**
 * DrawerMenu — mobile-only overlay drawer.
 * On web the Sidebar component (rendered at root level) is used instead.
 */
import Feather from '@expo/vector-icons/Feather';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import ConfirmModal from '@/src/components/ConfirmModal';
import { useAppColors } from '@/src/contexts/ThemeContext';

export interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function DrawerMenu({ visible, onClose }: DrawerMenuProps) {
  const router = useRouter();
  const { signOut, isAdmin } = useAuth();
  const { t } = useLanguage();
  const C = useAppColors();
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [logoutModal, setLogoutModal] = useState(false);

  const navItems = useMemo(() => {
    const items: { key: string; icon: string; path: string }[] = [
      { key: 'yourDecks', icon: 'layers', path: '/' },
      { key: 'publicDecks', icon: 'globe', path: '/publicdecks' },
    ];
    if (isAdmin) {
      items.push({ key: 'adminPanel', icon: 'shield', path: '/admin' });
    }
    items.push(
      { key: 'statistics', icon: 'bar-chart-2', path: '/statistics' },
      { key: 'settings', icon: 'settings', path: '/settings' },
      { key: 'help', icon: 'help-circle', path: '/help' },
    );
    return items;
  }, [isAdmin]);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(anim, {
      toValue:  visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      if (!visible) setMounted(false);
    });
  }, [visible, anim]);

  if (!mounted) return null;

  const translateX = anim.interpolate({
    inputRange: [0, 1], outputRange: [-280, 0],
  });

  function navigateTo(path: string) {
    onClose();
    setTimeout(() => router.push(path as never), 220);
  }

  const handleLogoutConfirm = async () => {
    setLogoutModal(false);
    onClose();
    setTimeout(async () => {
      await signOut();
      router.replace('/auth/login' as never);
    }, 220);
  };

  return (
    <View style={styles.overlay} pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable style={styles.outside} onPress={onClose} accessibilityRole="button" />

      <Animated.View style={[styles.container, { backgroundColor: C.surface, transform: [{ translateX }] }]}>
        <Text style={[styles.header, { color: C.text }]}>{t('menu')}</Text>

        {navItems.map((item) => (
          <Pressable
            key={item.key}
            style={styles.item}
            onPress={() => navigateTo(item.path)}
            accessibilityRole="button"
          >
            <Feather name={item.icon as any} size={18} color={C.text} />
            <Text style={[styles.itemText, { color: C.text }]}>{t(item.key)}</Text>
          </Pressable>
        ))}

        <Pressable
          style={[styles.item, styles.logoutItem]}
          onPress={() => setLogoutModal(true)}
          accessibilityRole="button"
        >
          <Feather name="log-out" size={18} color="#ef4444" />
          <Text style={[styles.itemText, styles.logoutText]}>{t('logout')}</Text>
        </Pressable>
      </Animated.View>

      <ConfirmModal
        visible={logoutModal}
        title={t('logout')}
        message={t('logoutConfirm')}
        confirmText={t('logout')}
        cancelText={t('cancel')}
        destructive
        icon="log-out"
        onConfirm={handleLogoutConfirm}
        onCancel={() => setLogoutModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position:        'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.32)',
    zIndex:          1000,
  },
  outside: {
    position: 'absolute',
    left: 280, top: 0, right: 0, bottom: 0,
  },
  container: {
    width:           280,
    height:          '100%',
    backgroundColor: '#fff',
    paddingTop:      48,
    paddingHorizontal: 12,
  },
  header: {
    fontSize: 18, fontWeight: '700', marginBottom: 12, color: '#111827',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 8,
    minHeight: 48,
    alignSelf: 'stretch',
  },
  itemText: {
    marginLeft: 12, fontSize: 16, color: '#1f2937',
  },
  logoutItem: { marginTop: 8 },
  logoutText: { color: '#ef4444', fontWeight: '600' },
});
