import { useAppColors } from "@/src/contexts/ThemeContext";
import { ReactNode } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const QUIZ_CONTENT_WIDTH_RATIO = 0.7;
const QUIZ_MAX_CONTENT_WIDTH = 560;

export function useQuizContentWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(Math.round(width * QUIZ_CONTENT_WIDTH_RATIO), QUIZ_MAX_CONTENT_WIDTH);
}

type DeckQuizScreenShellProps = {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  centerVertically?: boolean;
};

/** Centers quiz UI at ~70% of screen width. */
export function DeckQuizScreenShell({
  children,
  footer,
  scroll = true,
  contentStyle,
  centerVertically = false,
}: DeckQuizScreenShellProps) {
  const C = useAppColors();
  const insets = useSafeAreaInsets();
  const contentWidth = useQuizContentWidth();

  const column = (
    <View style={[styles.column, { width: contentWidth }, contentStyle]}>
      {children}
    </View>
  );

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scrollContent,
        centerVertically && styles.scrollCentered,
        { paddingBottom: footer ? 100 + insets.bottom : 24 + insets.bottom },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {column}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.staticBody, centerVertically && styles.staticCentered]}>
      {column}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: C.bg }]}>
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: C.bg,
              borderTopColor: C.borderLight,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={[styles.column, { width: contentWidth }]}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

type DeckQuizIntroProps = {
  title: string;
  subtitle?: string;
};

export function DeckQuizIntro({ title, subtitle }: DeckQuizIntroProps) {
  const C = useAppColors();
  return (
    <View style={styles.intro}>
      <Text style={[styles.introTitle, { color: C.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.introSubtitle, { color: C.textSub }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

type DeckQuizProgressProps = {
  current: number;
  total: number;
  label: string;
};

export function DeckQuizProgress({ current, total, label }: DeckQuizProgressProps) {
  const C = useAppColors();
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: C.textSub }]}>{label}</Text>
        <Text style={[styles.progressPct, { color: C.tint }]}>{pct}%</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: C.border }]}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: C.tint }]} />
      </View>
    </View>
  );
}

type DeckQuizLoadingProps = {
  message?: string;
};

export function DeckQuizLoading({ message }: DeckQuizLoadingProps) {
  const C = useAppColors();
  const contentWidth = useQuizContentWidth();

  return (
    <View style={[styles.screen, styles.loadingScreen, { backgroundColor: C.bg }]}>
      <View style={[styles.column, { width: contentWidth }]}>
        <ActivityIndicator size="large" color={C.tint} />
        {message ? (
          <Text style={[styles.loadingText, { color: C.textSub }]}>{message}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  column: {
    alignSelf: "center",
    maxWidth: "100%",
  },
  scrollContent: {
    alignItems: "center",
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  scrollCentered: {
    flexGrow: 1,
    justifyContent: "center",
  },
  staticBody: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  staticCentered: {
    flex: 1,
    justifyContent: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  intro: { marginBottom: 20 },
  introTitle: { fontSize: 22, fontWeight: "700", lineHeight: 28 },
  introSubtitle: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  progressBlock: { marginBottom: 20, width: "100%" },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabel: { fontSize: 14, fontWeight: "500" },
  progressPct: { fontSize: 13, fontWeight: "700" },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4 },
  loadingScreen: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 16, fontSize: 15, textAlign: "center" },
});
