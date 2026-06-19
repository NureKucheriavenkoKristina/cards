import Feather from "@expo/vector-icons/Feather";
import { memo, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native";

import { useAppColors } from "@/src/contexts/ThemeContext";

const nativeFocusedStyle =
  Platform.OS === "android"
    ? { borderColor: "#6366f1" as const, backgroundColor: "#fff" as const }
    : undefined;

const webTextInputNoOutline: TextStyle | undefined =
  Platform.OS === "web"
    ? ({ outlineWidth: 0, outlineStyle: "none" } as unknown as TextStyle)
    : undefined;

export type FormTextInputRowProps = {
  icon: keyof typeof Feather.glyphMap;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  multiline?: boolean;
  fill?: boolean;
  inputStyle?: StyleProp<TextStyle>;
  onBlur?: () => void;
  showClear?: boolean;
  trailing?: ReactNode;
  keyboardType?: React.ComponentProps<typeof TextInput>["keyboardType"];
  autoCapitalize?: React.ComponentProps<typeof TextInput>["autoCapitalize"];
};

/** Text row with local focus state so typing in one field does not re-style every field on the screen. */
export const FormTextInputRow = memo(function FormTextInputRow({
  icon,
  value,
  onChangeText,
  placeholder,
  multiline,
  fill,
  inputStyle,
  onBlur,
  showClear,
  trailing,
  keyboardType,
  autoCapitalize,
}: FormTextInputRowProps) {
  const C = useAppColors();
  const [focused, setFocused] = useState(false);

  const focusedStyle =
    focused &&
    (C.isDark
      ? { backgroundColor: C.surface, borderColor: "#6366f1" }
      : nativeFocusedStyle ?? styles.inputRowFocused);

  return (
    <View
      collapsable={false}
      style={[
        styles.inputRow,
        { backgroundColor: C.inputBg, borderColor: C.inputBorder },
        multiline && styles.inputRowMulti,
        fill && styles.inputRowFill,
        focusedStyle,
      ]}
      pointerEvents="box-none"
    >
      <Feather
        name={icon}
        size={16}
        color={focused ? C.tint : C.textMuted}
        style={multiline ? { marginTop: 3 } : undefined}
      />
      <TextInput
        style={[styles.input, webTextInputNoOutline, { color: C.text }, inputStyle]}
        placeholder={placeholder}
        placeholderTextColor={C.placeholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "auto"}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
      />
      {showClear && value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={8} style={{ marginTop: multiline ? 2 : 0 }}>
          <Feather name="x-circle" size={16} color={C.textMuted} />
        </Pressable>
      ) : null}
      {trailing}
    </View>
  );
});

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  inputRowMulti: { alignItems: "flex-start", paddingVertical: 10 },
  inputRowFill: { flex: 1, minHeight: 140 },
  inputRowFocused: {
    borderColor: "#1a1a1a",
    backgroundColor: "#fff",
    shadowColor: "#1a1a1a",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 2,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
});
