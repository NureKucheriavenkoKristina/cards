import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import 'react-native-reanimated';
import { Platform, Pressable, Text, View } from 'react-native';

import { useColorScheme } from '@/src/components/useColorScheme';
import DrawerMenu from '@/src/components/DrawerMenu';
import { LanguageDropdown } from '@/src/components/LanguageDropdown';
import NotificationBell from '@/src/components/NotificationBell';
import { StudyReminderNotificationSync } from '@/src/components/StudyReminderNotificationSync';
import Sidebar from '@/src/components/Sidebar';
import ThemeToggle from '@/src/components/ThemeToggle';
import { AuthProvider, useAuth } from '@/src/contexts/AuthContext';
import { WebStudyReminderProvider } from '@/src/contexts/WebStudyReminderContext';
import { LanguageProvider, useLanguage } from '@/src/contexts/LanguageContext';
import { MobileDrawerProvider, useMobileDrawerOptional } from '@/src/contexts/MobileDrawerContext';
import { SidebarDrawerProvider, useSidebarDrawer } from '@/src/contexts/SidebarDrawerContext';
import { StudySettingsProvider } from '@/src/contexts/StudySettingsContext';
import { ThemeProvider as AppThemeProvider } from '@/src/contexts/ThemeContext';
import Colors from '@/src/constants/Colors';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // After reload, the initial route is (tabs)
  initialRouteName: '(tabs)',
};

// Keep the splash screen visible until we hide it explicitly
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AppThemeProvider>
      <LanguageProvider>
        <StudySettingsProvider>
          <AuthProvider>
            <WebStudyReminderProvider>
              <StudyReminderNotificationSync />
              <RootLayoutNav />
            </WebStudyReminderProvider>
          </AuthProvider>
        </StudySettingsProvider>
      </LanguageProvider>
    </AppThemeProvider>
  );
}

const isWeb = Platform.OS === 'web';

function guestAllowedByPathname(pathname: string | undefined): boolean {
  if (!pathname) return false;
  const p = pathname.replace(/\/$/, '');
  return p.endsWith('publicdecks') || p.endsWith('public/browse') || p.endsWith('deck-detail');
}

/** Minimum touch target; extra padding makes the whole left header easy to hit on web/mobile. */
const HEADER_MENU_MIN_TOUCH = 56;

function HeaderMenuTrigger({
  onPress,
  tintColor,
  textColor,
  label,
}: {
  onPress: () => void;
  tintColor: string;
  textColor: string;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open menu"
      hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: HEADER_MENU_MIN_TOUCH,
        minHeight: HEADER_MENU_MIN_TOUCH,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginVertical: -4,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Feather name="menu" size={24} color={tintColor} />
      {label.length > 0 ? (
        <Text style={{ marginLeft: 10, fontSize: 18, fontWeight: '700', color: textColor }}>{label}</Text>
      ) : null}
    </Pressable>
  );
}

function NativeStackHeaderMenu() {
  const colorScheme = useColorScheme();
  const headerText = Colors[colorScheme].text;
  const headerTint = Colors[colorScheme].tint;
  const mobile = useMobileDrawerOptional();
  return (
    <HeaderMenuTrigger
      onPress={() => mobile?.openMenu()}
      tintColor={headerTint}
      textColor={headerText}
      label=""
    />
  );
}

/** Stack header brand — always "Cardly", never per-screen titles. */
function AppHeaderBrand({ color }: { color: string }) {
  const { t } = useLanguage();
  return <StackHeaderTitle color={color}>{t('appName')}</StackHeaderTitle>;
}

/** Title row: flex minWidth 0 so long titles ellipsize instead of drawing under headerRight. */
function StackHeaderTitle({ children, color }: { children?: string; color: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{ fontSize: 18, fontWeight: '600', color }}
      >
        {children}
      </Text>
    </View>
  );
}

function WebAuthenticatedShell({
  sharedHeaderRight,
}: {
  sharedHeaderRight: () => ReactNode;
}) {
  const { isCompact, toggleDrawer } = useSidebarDrawer();
  const colorScheme = useColorScheme();
  const headerBg = Colors[colorScheme].header;
  const headerText = Colors[colorScheme].text;
  const headerTint = Colors[colorScheme].tint;

  const headerLeft = useCallback(
    () => (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
        <HeaderMenuTrigger
          onPress={toggleDrawer}
          tintColor={headerTint}
          textColor={headerText}
          label=""
        />
      </View>
    ),
    [toggleDrawer, headerText, headerTint],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {!isCompact ? <Sidebar /> : null}
        <View style={{ flex: 1, overflow: Platform.OS === 'web' ? 'visible' : 'hidden' }}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: headerBg },
              headerShadowVisible: true,
              headerTintColor: headerTint,
              headerTitleStyle: { fontSize: 18, fontWeight: '600' },
              headerTitleAlign: 'left',
              headerTitle: () => <AppHeaderBrand color={headerText} />,
              headerRight: sharedHeaderRight,
              headerLeft: isCompact ? headerLeft : undefined,
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="auth/login" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="auth/signup" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="auth/forgot-password" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="auth/reset-password" options={{ headerShown: false, animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="deck-detail" options={{ headerShown: true }} />
            <Stack.Screen name="publicdecks" options={{ headerShown: true }} />
            <Stack.Screen name="public/browse" options={{ headerShown: true }} />
            <Stack.Screen name="admin" options={{ headerShown: true }} />
            <Stack.Screen name="deck-rate" options={{ headerShown: true }} />
            <Stack.Screen name="deck-study" options={{ headerShown: true }} />
            <Stack.Screen name="deck-quiz-new" options={{ headerShown: true }} />
            <Stack.Screen name="deck-quiz-play" options={{ headerShown: true }} />
            <Stack.Screen name="settings" options={{ headerShown: true }} />
            <Stack.Screen name="add-deck" options={{ headerShown: true }} />
            <Stack.Screen name="add-card" options={{ headerShown: true }} />
            <Stack.Screen name="deck-import" options={{ headerShown: true }} />
            <Stack.Screen name="statistics" options={{ headerShown: true }} />
            <Stack.Screen name="help" options={{ headerShown: true }} />
            <Stack.Screen
              name="modal"
              options={{
                presentation: 'modal',
                headerTitle: () => <AppHeaderBrand color={headerText} />,
              }}
            />
          </Stack>
        </View>
      </View>
      {isCompact ? <Sidebar /> : null}
    </View>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const headerBg = Colors[colorScheme].header;
  const headerText = Colors[colorScheme].text;
  const headerTint = Colors[colorScheme].tint;

  const openMobileMenu = useCallback(() => setMobileDrawerOpen(true), []);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'auth';
    const guestBrowseOk =
      segments[0] === 'publicdecks' ||
      segments[0] === 'deck-detail' ||
      (segments[0] === 'public' && segments[1] === 'browse') ||
      guestAllowedByPathname(isWeb ? pathname : undefined);
    const authAllowsLoggedIn = segments[1] === 'reset-password';
    if (!session && !inAuthGroup && segments.length > 0 && !guestBrowseOk) {
      router.replace('/auth/login');
    } else if (session && inAuthGroup && !authAllowsLoggedIn) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, router, pathname, isWeb]);

  const inAuthGroup = segments[0] === 'auth';
  // Show the sidebar on web only when the user is authenticated and NOT on auth screens
  const showSidebar = isWeb && !!session && !loading && !inAuthGroup;
  const nativeAuthenticated = !isWeb && !!session && !loading && !inAuthGroup;

  const guestBrowsing =
    !session &&
    !loading &&
    (segments[0] === 'publicdecks' ||
      segments[0] === 'deck-detail' ||
      (segments[0] === 'public' && segments[1] === 'browse') ||
      guestAllowedByPathname(isWeb ? pathname : undefined));

  const sharedHeaderRight = () => (
    <View
      style={{
        marginRight: 8,
        marginLeft: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}
    >
      {session ? (
        <>
          <NotificationBell />
          <ThemeToggle />
          <LanguageDropdown />
          {pathname !== '/modal' && (
            <Pressable onPress={() => router.push('/modal')}>
              {({ pressed }) => (
                <FontAwesome
                  name="info-circle"
                  size={25}
                  color={headerTint}
                  style={{ opacity: pressed ? 0.5 : 1 }}
                />
              )}
            </Pressable>
          )}
        </>
      ) : guestBrowsing ? (
        <>
          <Pressable onPress={() => router.push('/auth/login' as never)} hitSlop={8}>
            <Text style={{ color: headerTint, fontSize: 16, fontWeight: '600' }}>{t('signIn')}</Text>
          </Pressable>
          <ThemeToggle />
          <LanguageDropdown />
        </>
      ) : (
        <>
          <ThemeToggle />
          <LanguageDropdown />
        </>
      )}
    </View>
  );

  const stackNav = (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: headerBg },
        headerShadowVisible: true,
        headerTintColor: headerTint,
        headerTitleStyle: { fontSize: 18, fontWeight: '600' },
        headerTitleAlign: 'left',
        headerTitle: () => <AppHeaderBrand color={headerText} />,
        headerRight: sharedHeaderRight,
        ...(nativeAuthenticated ? { headerLeft: () => <NativeStackHeaderMenu /> } : {}),
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="auth/login" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="auth/signup" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="auth/forgot-password" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="auth/reset-password" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="deck-detail" options={{ headerShown: true }} />
      <Stack.Screen name="publicdecks" options={{ headerShown: true }} />
      <Stack.Screen name="public/browse" options={{ headerShown: true }} />
      <Stack.Screen name="admin" options={{ headerShown: true, title: 'Admin' }} />
      <Stack.Screen name="deck-rate" options={{ headerShown: true }} />
      <Stack.Screen name="deck-study" options={{ headerShown: true }} />
      <Stack.Screen name="deck-quiz-new" options={{ headerShown: true }} />
      <Stack.Screen name="deck-quiz-play" options={{ headerShown: true }} />
      <Stack.Screen name="settings" options={{ headerShown: true }} />
      <Stack.Screen name="add-deck" options={{ headerShown: true }} />
      <Stack.Screen name="add-card" options={{ headerShown: true }} />
      <Stack.Screen name="deck-import" options={{ headerShown: true }} />
      <Stack.Screen name="statistics" options={{ headerShown: true }} />
      <Stack.Screen name="help" options={{ headerShown: true }} />
      <Stack.Screen
        name="modal"
        options={{
          presentation: 'modal',
          headerTitle: () => <AppHeaderBrand color={headerText} />,
        }}
      />
    </Stack>
  );

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      {nativeAuthenticated ? (
        <MobileDrawerProvider openMenu={openMobileMenu}>
          <View style={{ flex: 1 }}>
            <DrawerMenu visible={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)} />
            {stackNav}
          </View>
        </MobileDrawerProvider>
      ) : showSidebar ? (
        <SidebarDrawerProvider>
          <WebAuthenticatedShell sharedHeaderRight={sharedHeaderRight} />
        </SidebarDrawerProvider>
      ) : (
        stackNav
      )}
    </ThemeProvider>
  );
}
