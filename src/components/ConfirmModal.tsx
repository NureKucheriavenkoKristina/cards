import React from "react";
import {
    Modal,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";

import Feather from "@expo/vector-icons/Feather";
import { Text } from "./Themed";
import { useAppColors } from "@/src/contexts/ThemeContext";

export interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string | null;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: keyof typeof Feather.glyphMap;
}

/**
 * Modal for confirmations or simple messages.
 * If `cancelText` is omitted, only the OK button is shown.
 */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmText,
  cancelText = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
  icon = "alert-circle",
}: ConfirmModalProps) {
  const hasCancel = Boolean(cancelText);
  const C = useAppColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={hasCancel ? onCancel : onConfirm}
    >
      <Pressable
        style={styles.overlay}
        onPress={hasCancel ? onCancel : onConfirm}
      >
        <Pressable
          style={[styles.modalCard, { backgroundColor: C.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[
              styles.iconWrapper,
              destructive && styles.iconWrapperDestructive,
            ]}
          >
            <Feather
              name={icon}
              size={32}
              color={destructive ? "#dc2626" : "#4255ff"}
            />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={[styles.buttons, destructive && hasCancel && styles.buttonsStacked]}>
            {hasCancel && (
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.cancelButton,
                  { backgroundColor: C.surfaceAlt },
                  destructive && styles.buttonStacked,
                ]}
                onPress={onCancel}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelButtonText, { color: C.textSub }]}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.button,
                styles.confirmButton,
                destructive && styles.confirmButtonDestructive,
                !hasCancel && styles.confirmButtonFull,
                destructive && hasCancel && styles.buttonStacked,
              ]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmButtonText} numberOfLines={2}>
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(66, 85, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconWrapperDestructive: {
    backgroundColor: "rgba(220, 38, 38, 0.12)",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: "#6b7280",
    lineHeight: 24,
    textAlign: "center",
    marginBottom: 24,
  },
  buttons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  buttonsStacked: {
    flexDirection: "column",
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  buttonStacked: {
    flex: 0,
    width: "100%",
  },
  cancelButton: {
    backgroundColor: "#f3f4f6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4b5563",
  },
  confirmButton: {
    backgroundColor: "#4255ff",
  },
  confirmButtonDestructive: {
    backgroundColor: "#dc2626",
  },
  confirmButtonFull: {
    flex: 1,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});

export default ConfirmModal;
