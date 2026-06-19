import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import PublicDecksView from "@/src/components/PublicDecksView";
import { useAuth } from "@/src/contexts/AuthContext";
import { useAppColors } from "@/src/contexts/ThemeContext";

/**
 * Публічні дошки для гостя: лише перегляд.
 * Авторизований користувач перенаправляється на /publicdecks.
 */
export default function PublicBrowseScreen() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const C = useAppColors();

  useEffect(() => {
    if (!loading && user?.id) {
      router.replace("/publicdecks");
    }
  }, [loading, user?.id, router]);

  if (loading || user?.id) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg }}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  return <PublicDecksView forGuest />;
}
