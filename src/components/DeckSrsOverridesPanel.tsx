import Feather from "@expo/vector-icons/Feather";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { FormFlashMessage } from "@/src/components/FormFlashMessage";
import { useLanguage } from "@/src/contexts/LanguageContext";
import { useAppColors } from "@/src/contexts/ThemeContext";
import { useFlashMessage } from "@/src/hooks/useFlashMessage";
import { supabase } from "@/src/lib/supabase";

type LimitKey = "new_cards_per_day" | "cards_per_day";
type FormState = Record<LimitKey, string>;

const EMPTY_FORM: FormState = {
  new_cards_per_day: "",
  cards_per_day: "",
};

const LIMIT_KEYS: LimitKey[] = ["new_cards_per_day", "cards_per_day"];

/** Updates only daily limit keys; preserves algorithm SRS keys in the same JSON. */
function mergeSrsOverridesLimits(
  existing: Record<string, unknown> | null,
  limits: Partial<Record<LimitKey, number>>,
): Record<string, unknown> | null {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  for (const key of LIMIT_KEYS) {
    delete base[key];
  }
  for (const key of LIMIT_KEYS) {
    const value = limits[key];
    if (value != null) base[key] = value;
  }
  return Object.keys(base).length > 0 ? base : null;
}

function toFormValue(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function formFromOverrides(overrides: Record<string, unknown> | null): FormState {
  return {
    new_cards_per_day: toFormValue(overrides?.new_cards_per_day),
    cards_per_day: toFormValue(overrides?.cards_per_day),
  };
}

function parseLimit(raw: string, label: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(label);
  }
  return parsed;
}

function parseDraftLimit(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export default function DeckSrsOverridesPanel({
  deckId,
  overrides,
  onSaved,
}: {
  deckId: string;
  overrides: Record<string, unknown> | null;
  onSaved?: (savedOverrides: Record<string, unknown> | null) => void;
}) {
  const C = useAppColors();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => formFromOverrides(overrides));
  const [isSaving, setIsSaving] = useState(false);
  const { message, show: showFlash, clear: clearFlash } = useFlashMessage(3000);

  useEffect(() => {
    setForm(formFromOverrides(overrides));
  }, [overrides]);

  const activeLimitCount = useMemo(
    () => Object.values(form).filter((value) => value.trim().length > 0).length,
    [form],
  );
  const recommendedTotal = useMemo(() => {
    const newCardsLimit = parseDraftLimit(form.new_cards_per_day);
    return newCardsLimit == null ? null : newCardsLimit * 10;
  }, [form.new_cards_per_day]);
  const totalLimitWarning = useMemo(() => {
    const totalCardsLimit = parseDraftLimit(form.cards_per_day);
    if (recommendedTotal == null || totalCardsLimit == null || totalCardsLimit >= recommendedTotal) {
      return null;
    }
    return t("deckDailyCardsLimitWarning").replace("{min}", String(recommendedTotal));
  }, [form.cards_per_day, recommendedTotal, t]);

  const handleChange = (key: LimitKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value.replace(/[^\d]/g, "") }));
    clearFlash();
  };

  const savePayload = async (payload: Record<string, unknown> | null) => {
    const { data, error } = await supabase
      .from("decks")
      .update({ srs_overrides: payload })
      .eq("deck_id", deckId)
      .select("srs_overrides")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(t("deckLimitsNoUpdate"));
    const saved = data.srs_overrides;
    if (saved != null && typeof saved === "object" && !Array.isArray(saved)) {
      return saved as Record<string, unknown>;
    }
    return null;
  };

  const handleSave = async () => {
    setIsSaving(true);
    clearFlash();
    try {
      const newCardsLimit = parseLimit(form.new_cards_per_day, t("deckNewCardsLimit"));
      const totalCardsLimit = parseLimit(form.cards_per_day, t("deckDailyCardsLimit"));
      const limits: Partial<Record<LimitKey, number>> = {};
      if (newCardsLimit != null) limits.new_cards_per_day = newCardsLimit;
      if (totalCardsLimit != null) limits.cards_per_day = totalCardsLimit;

      const saved = await savePayload(mergeSrsOverridesLimits(overrides, limits));
      showFlash(t("deckLimitsSaved"), true);
      onSaved?.(saved);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("deckLimitsSaveError");
      const isValidationError =
        message === t("deckNewCardsLimit") || message === t("deckDailyCardsLimit");
      showFlash(
        isValidationError ? `${t("deckLimitsInvalid")}: ${message}` : message,
        false,
        5000,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsSaving(true);
    clearFlash();
    try {
      const saved = await savePayload(mergeSrsOverridesLimits(overrides, {}));
      setForm({ ...EMPTY_FORM });
      showFlash(t("deckLimitsResetDone"), true);
      onSaved?.(saved);
    } catch {
      showFlash(t("deckLimitsSaveError"), false, 5000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: C.surface }]}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setOpen((prev) => !prev)}
        activeOpacity={0.85}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.iconCircle, { backgroundColor: C.surfaceAlt }]}>
            <Feather name="sliders" size={16} color={C.tint} />
          </View>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: C.text }]}>{t("deckLimitsTitle")}</Text>
            <Text style={[styles.subtitle, { color: C.textSub }]}>
              {activeLimitCount > 0
                ? t("deckLimitsActive").replace("{count}", String(activeLimitCount))
                : t("deckLimitsInherited")}
            </Text>
          </View>
        </View>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={20} color={C.textMuted} />
      </TouchableOpacity>

      {open ? (
        <View style={styles.body}>
          <Text style={[styles.help, { color: C.textSub }]}>{t("deckLimitsDescription")}</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>{t("deckNewCardsLimit")}</Text>
            <TextInput
              value={form.new_cards_per_day}
              onChangeText={(value) => handleChange("new_cards_per_day", value)}
              placeholder="20"
              placeholderTextColor={C.placeholder}
              keyboardType="number-pad"
              style={[
                styles.input,
                { backgroundColor: C.inputBg, borderColor: C.inputBorder, color: C.text },
              ]}
            />
            <Text style={[styles.hint, { color: C.textMuted }]}>{t("deckNewCardsLimitHint")}</Text>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: C.text }]}>{t("deckDailyCardsLimit")}</Text>
            <TextInput
              value={form.cards_per_day}
              onChangeText={(value) => handleChange("cards_per_day", value)}
              placeholder="100"
              placeholderTextColor={C.placeholder}
              keyboardType="number-pad"
              style={[
                styles.input,
                { backgroundColor: C.inputBg, borderColor: C.inputBorder, color: C.text },
              ]}
            />
            <Text style={[styles.hint, { color: C.textMuted }]}>{t("deckDailyCardsLimitHint")}</Text>
            {totalLimitWarning ? (
              <View style={styles.warningBox}>
                <Feather name="alert-triangle" size={14} color="#d97706" />
                <Text style={styles.warningText}>{totalLimitWarning}</Text>
              </View>
            ) : null}
          </View>

          <FormFlashMessage message={message} style={styles.flashMessage} />

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: C.border }]}
              onPress={handleReset}
              disabled={isSaving}
            >
              <Text style={[styles.secondaryButtonText, { color: C.textSub }]}>
                {t("deckLimitsRemove")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={isSaving}>
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>{t("save")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    marginBottom: 16,
    marginHorizontal: 16,
    marginTop: 16,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  headerLeft: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 12,
  },
  iconCircle: {
    alignItems: "center",
    borderRadius: 20,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 12,
    marginTop: 3,
  },
  body: {
    borderTopColor: "rgba(148, 163, 184, 0.18)",
    borderTopWidth: 1,
    padding: 16,
    paddingTop: 14,
  },
  help: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  field: {
    marginBottom: 13,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hint: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  warningBox: {
    alignItems: "flex-start",
    backgroundColor: "#fffbeb",
    borderColor: "#f59e0b",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    padding: 10,
  },
  warningText: {
    color: "#92400e",
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
  },
  flashMessage: {
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "700",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#6366f1",
    borderRadius: 12,
    justifyContent: "center",
    minWidth: 92,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
});
