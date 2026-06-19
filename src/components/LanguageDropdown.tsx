import React, { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';

import { Text } from './Themed';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAppColors } from '@/src/contexts/ThemeContext';

type Locale = 'en' | 'uk';

const LOCALES: { value: Locale; labelKey: string }[] = [
  { value: 'en', labelKey: 'langEnglish' },
  { value: 'uk', labelKey: 'langUkrainian' },
];

export function LanguageDropdown() {
  const { locale, setLocale, t } = useLanguage();
  const C = useAppColors();
  const [visible, setVisible] = useState(false);
  const [layout, setLayout] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<View>(null);

  const openDropdown = () => {
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      const dropdownWidth = 140;
      const left = Math.max(8, x + width - dropdownWidth);
      setLayout({ x: left, y: y + height + 6 });
      setVisible(true);
    });
  };

  const selectLocale = (value: Locale) => {
    setLocale(value);
    setVisible(false);
  };

  const displayLabel = locale === 'en' ? 'EN' : 'УК';

  const pillBg = C.isDark
    ? 'rgba(165, 180, 252, 0.15)'
    : 'rgba(224, 218, 255, 0.7)';

  return (
    <>
      <Pressable
        ref={buttonRef}
        onPress={openDropdown}
        style={[styles.button, { backgroundColor: pillBg }]}
        hitSlop={8}
      >
        <Text style={[styles.buttonText, { color: C.tint }]}>{displayLabel}</Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          {layout && (
            <View style={[styles.dropdown, { left: Math.max(8, layout.x), top: layout.y, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1 }]}>
              {LOCALES.map(({ value, labelKey }) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.option, value === locale && { backgroundColor: C.isDark ? 'rgba(165, 180, 252, 0.12)' : 'rgba(66, 85, 255, 0.08)' }]}
                  onPress={() => selectLocale(value)}
                >
                  <Text style={[styles.optionText, { color: C.text }, value === locale && { color: C.tint, fontWeight: '600' }]}>
                    {t(labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    outlineStyle: 'none',
    outlineWidth: 0,
    elevation: 0,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  dropdown: {
    position: 'absolute',
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  optionText: {
    fontSize: 16,
  },
});
