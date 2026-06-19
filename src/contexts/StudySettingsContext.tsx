import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_STUDY_SETTINGS,
  type StudySettings,
} from "@/src/lib/spacedRepetition";
import { normalizeSrsDayStartHour } from "@/src/lib/srsDayBoundary";

const STORAGE_KEY = "@cardly_study_settings";

interface StudySettingsContextType {
  settings: StudySettings;
  updateSettings: (partial: Partial<StudySettings>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

const StudySettingsContext = createContext<StudySettingsContextType | undefined>(undefined);

export function StudySettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<StudySettings>(DEFAULT_STUDY_SETTINGS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Partial<StudySettings>;
          setSettings({
            ...DEFAULT_STUDY_SETTINGS,
            ...parsed,
            srsDayStartHour: normalizeSrsDayStartHour(
              parsed.srsDayStartHour ?? DEFAULT_STUDY_SETTINGS.srsDayStartHour
            ),
          });
        } catch (_) {
          // Keep defaults
        }
      }
    });
  }, []);

  const updateSettings = useCallback(async (partial: Partial<StudySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      if (partial.srsDayStartHour !== undefined) {
        next.srsDayStartHour = normalizeSrsDayStartHour(partial.srsDayStartHour);
      }
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(async () => {
    setSettings(DEFAULT_STUDY_SETTINGS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_STUDY_SETTINGS));
  }, []);

  return (
    <StudySettingsContext.Provider value={{ settings, updateSettings, resetToDefaults }}>
      {children}
    </StudySettingsContext.Provider>
  );
}

export function useStudySettings() {
  const ctx = useContext(StudySettingsContext);
  if (ctx === undefined) {
    throw new Error("useStudySettings must be used within StudySettingsProvider");
  }
  return ctx;
}
