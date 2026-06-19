import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import PublicDecksView from "@/src/components/PublicDecksView";
import { useAuth } from "@/src/contexts/AuthContext";
import { useAppColors } from "@/src/contexts/ThemeContext";

/**
 * Публічні дошки для авторизованого користувача:
 * без власних колод у списку, можливість скарги.
 */
export default function PublicDecksScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const C = useAppColors();

  useEffect(() => {
    if (!loading && !user?.id) {
      router.replace("/public/browse");
    }
  }, [loading, user?.id, router]);

  if (loading || !user?.id) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  return <PublicDecksView forGuest={false} />;
}
