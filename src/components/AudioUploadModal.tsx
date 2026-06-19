import { ActivityIndicator, Modal, StyleSheet, View } from "react-native";

import { Text } from "@/src/components/Themed";
import { useAppColors } from "@/src/contexts/ThemeContext";
import { useLanguage } from "@/src/contexts/LanguageContext";

export type AudioUploadModalPhase = "reading" | "uploading" | "preparing";

type Props = {
  visible: boolean;
  phase: AudioUploadModalPhase;
  fileName?: string;
};

export function AudioUploadModal({ visible, phase }: Props) {
  const C = useAppColors();
  const { t } = useLanguage();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.dialog,
            { backgroundColor: C.surface, borderColor: C.borderLight },
          ]}
        >
          <ActivityIndicator size="small" color={C.tint} />
          <Text style={[styles.status, { color: C.text }]} numberOfLines={1}>
            {t(`uploadAudioPhase_${phase}`)}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 280,
  },
  status: {
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
  },
});
