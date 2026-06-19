import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { LanguageDropdown } from '@/src/components/LanguageDropdown';
import NotificationBell from '@/src/components/NotificationBell';
import ThemeToggle from '@/src/components/ThemeToggle';
import { useClientOnlyValue } from '@/src/components/useClientOnlyValue';
import { useColorScheme } from '@/src/components/useColorScheme';
import Colors from '@/src/constants/Colors';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useMobileDrawerOptional } from '@/src/contexts/MobileDrawerContext';
import { useSidebarDrawerOptional } from '@/src/contexts/SidebarDrawerContext';

const isWeb = Platform.OS === 'web';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { t } = useLanguage();
  const sidebarDrawer = useSidebarDrawerOptional();
  const mobileDrawer = useMobileDrawerOptional();

  const cs = colorScheme ?? 'light';
  const headerBg = Colors[cs].header;
  const headerTint = Colors[cs].tint;
  const headerText = Colors[cs].text;

  const openMenu = () => {
    if (isWeb) {
      sidebarDrawer?.toggleDrawer();
    } else {
      mobileDrawer?.openMenu();
    }
  };

  const headerLeft = isWeb
    ? sidebarDrawer?.isCompact
      ? () => (
          <Pressable
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
            style={[styles.menuBtn, { marginLeft: 8 }]}
          >
            <Feather name="menu" size={24} color={headerTint} />
          </Pressable>
        )
      : undefined
    : () => (
        <Pressable
          onPress={openMenu}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
          style={styles.menuBtn}
        >
          <Feather name="menu" size={24} color={headerTint} />
        </Pressable>
      );

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[cs].tint,
          headerShown: useClientOnlyValue(false, true),
          tabBarStyle: { display: 'none' },
          headerStyle: { backgroundColor: headerBg },
          headerTintColor: headerText,
          headerShadowVisible: true,
          headerLeft,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('appName'),
            headerRight: () => (
              <View style={styles.headerRight}>
                <NotificationBell />
                <ThemeToggle />
                <LanguageDropdown />
                <Link href="/modal" asChild>
                  <Pressable>
                    {({ pressed }) => (
                      <FontAwesome
                        name="info-circle"
                        size={25}
                        color={headerTint}
                        style={{ opacity: pressed ? 0.5 : 1 }}
                      />
                    )}
                  </Pressable>
                </Link>
              </View>
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
    marginRight:   8,
  },
  menuBtn: {
    minWidth: 56,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
