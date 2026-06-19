import Feather from "@expo/vector-icons/Feather";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import type { Deck } from "@/assets/data/decks";
import { useAuth } from "@/src/contexts/AuthContext";
import { useLanguage } from "@/src/contexts/LanguageContext";
import { useAppColors } from "@/src/contexts/ThemeContext";
import {
  IMPORT_MAX_PAIRS,
  inferImportKind,
  parseImportFromCsvText,
  parseImportFromTxtText,
  parseImportFromXlsxArrayBuffer,
  type ImportWordRow,
} from "@/src/lib/deckImportParse";import { readUriAsArrayBuffer, readUriAsUtf8 } from '@/src/lib/readImportFile';import { keyboardAvoidingBehavior } from "@/src/lib/keyboardAvoiding";
import { supabase } from "@/src/lib/supabase";

const MIME_TYPES = [
  "text/plain",
  "text/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as string[];

export default function DeckImportScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ deckId?: string }>();
  const deckIdParam =
    typeof params.deckId === "string"
      ? params.deckId
      : Array.isArray(params.deckId)
        ? params.deckId[0]
        : undefined;

  const { user } = useAuth();
  const { t } = useLanguage();
  const C = useAppColors();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(Boolean(deckIdParam));

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [pairs, setPairs] = useState<ImportWordRow[]>([]);
  const [parseErrorKey, setParseErrorKey] = useState<string | null>(null);
  const [accessErrorKey, setAccessErrorKey] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveErrorKey, setSaveErrorKey] = useState<string | null>(null);

  const isAddToDeck = Boolean(deckIdParam);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isAddToDeck ? t("importScreenAddTitle") : t("importScreenNewTitle"),
    });
  }, [navigation, isAddToDeck, t]);

  useEffect(() => {
    setAccessErrorKey(null);
    if (!deckIdParam) {
      setLoadingDeck(false);
      setDeck(null);
      return;
    }
    if (!user?.id) {
      setLoadingDeck(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("decks")
        .select("*")
        .eq("deck_id", deckIdParam)
        .single();
      if (cancelled) return;
      setLoadingDeck(false);
      if (error || !data) {
        setAccessErrorKey("importErrorLoadDeck");
        setDeck(null);
        return;
      }
      const d = data as Deck;
      if (d.creator_id !== user.id) {
        setAccessErrorKey("importErrorOwner");
        setDeck(null);
        return;
      }
      setDeck(d);
    })();
    return () => {
      cancelled = true;
    };
  }, [deckIdParam, user?.id]);

  const parsePickedFile = useCallback(
    async (uri: string, name: string, mime?: string) => {
      setParseErrorKey(null);
      setSaveErrorKey(null);
      const kind = inferImportKind(name, mime);
      if (!kind) {
        setParseErrorKey("importErrorExtension");
        setPairs([]);
        return;
      }
      try {
        let result: { rows: ImportWordRow[]; error?: "no_rows" | "invalid_format" };
        if (kind === "csv") {
          const text = await readUriAsUtf8(uri);
          result = parseImportFromCsvText(text);
        } else if (kind === "txt") {
          const text = await readUriAsUtf8(uri);
          result = parseImportFromTxtText(text);
        } else {
          const buf = await readUriAsArrayBuffer(uri);
          result = parseImportFromXlsxArrayBuffer(buf);
        }
        if (result.error === "invalid_format") {
          setParseErrorKey("importErrorInvalidFormat");
          setPairs([]);
        } else if (result.rows.length === 0) {
          setParseErrorKey("importErrorNoRows");
          setPairs([]);
        } else {
          setPairs(result.rows);
        }
      } catch {
        setParseErrorKey("importErrorParse");
        setPairs([]);
      }
    },
    [t]
  );

  const pickFile = useCallback(async () => {
    if (!user) return;
    setParseErrorKey(null);
    setSaveErrorKey(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: MIME_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    setFileLabel(asset.name ?? t("importFileUnnamed"));
    await parsePickedFile(asset.uri, asset.name ?? "", asset.mimeType ?? undefined);
  }, [parsePickedFile, t, user]);

  const clearFile = useCallback(() => {
    setFileLabel(null);
    setPairs([]);
    setParseErrorKey(null);
    setSaveErrorKey(null);
  }, []);

  const importRows = async (targetDeckId: string): Promise<boolean> => {
    const BATCH = 120;
    const uid = user?.id ?? null;
    for (let i = 0; i < pairs.length; i += BATCH) {
      const slice = pairs.slice(i, i + BATCH);
      const rows = slice.map((p) => ({
        deck_id: targetDeckId,
        card_type: "basic" as const,
        front_text: p.front,
        back_text: p.back,
        notes: p.notes?.trim() ? p.notes.trim() : null,
        created_by: uid,
      }));
      const { error } = await supabase.from("cards").insert(rows);
      if (error) {
        setSaveErrorKey(error.message);
        return false;
      }
    }
    return true;
  };

  const handleImport = async () => {
    if (!user || saving) return;
    setSaveErrorKey(null);
    if (pairs.length === 0) {
      setSaveErrorKey("importErrorNoRows");
      return;
    }
    setSaving(true);
    try {
      if (isAddToDeck && deckIdParam) {
        const ok = await importRows(deckIdParam);
        if (ok) {
          router.replace(`/deck-detail?id=${deckIdParam}`);
        }
      } else {
        if (!title.trim()) {
          setSaveErrorKey("importErrorTitle");
          setSaving(false);
          return;
        }
        const { data: newDeck, error: deckErr } = await supabase
          .from("decks")
          .insert({
            creator_id: user.id,
            title: title.trim(),
            description: description.trim() || null,
            cover_image_url: null,
            is_public: isPublic,
          })
          .select("*")
          .single();
        if (deckErr || !newDeck) {
          setSaveErrorKey(deckErr?.message ?? "unexpectedError");
          setSaving(false);
          return;
        }
        const id = (newDeck as Deck).deck_id;
        const ok = await importRows(id);
        if (ok) {
          router.replace(`/deck-detail?id=${id}`);
        } else {
          await supabase.from("decks").delete().eq("deck_id", id).eq("creator_id", user.id);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <Text style={{ color: C.textSub }}>{t("importErrorAuth")}</Text>
      </View>
    );
  }

  if (loadingDeck) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color={C.tint} />
      </View>
    );
  }

  if (isAddToDeck && deckIdParam && accessErrorKey) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg, padding: 24 }]}>
        <Text style={{ color: C.text, textAlign: "center" }}>{t(accessErrorKey)}</Text>
        <TouchableOpacity
          style={[styles.secondaryBtnOut, { marginTop: 18, borderColor: C.tint }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.secondaryBtnTxt, { color: C.tint }]}>{t("goBack")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const previewRows = pairs.slice(0, 8);
  const canSave = pairs.length > 0 && (isAddToDeck || title.trim().length > 0) && !saving;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={keyboardAvoidingBehavior()}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {isAddToDeck && deck ? (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>{t("importIntoDeckLabel")}</Text>
            <Text style={[styles.deckTitle, { color: C.text }]}>{deck.title}</Text>
          </View>
        ) : null}

        {!isAddToDeck ? (
          <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[styles.label, { color: C.textSub }]}>{t("importDeckName")}</Text>
            <TextInput
              style={[styles.input, { color: C.text, borderColor: C.inputBorder, backgroundColor: C.inputBg }]}
              value={title}
              onChangeText={setTitle}
              placeholder={t("importDeckNamePh")}
              placeholderTextColor={C.placeholder}
            />
            <Text style={[styles.label, { color: C.textSub, marginTop: 12 }]}>{t("importDescription")}</Text>
            <TextInput
              style={[
                styles.input,
                styles.inputMulti,
                { color: C.text, borderColor: C.inputBorder, backgroundColor: C.inputBg },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder={t("importDescPh")}
              placeholderTextColor={C.placeholder}
              multiline
            />
            <View style={styles.switchRow}>
              <Text style={{ color: C.text }}>{t("importPublicDeck")}</Text>
              <Switch value={isPublic} onValueChange={setIsPublic} />
            </View>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>{t("importPickFile")}</Text>
          <Text style={[styles.hint, { color: C.textSub }]}>{t("importFileHint")}</Text>
          <Text style={[styles.hint, { color: C.textSub, marginTop: 6 }]}>
            {t("importLimitPart1")}
            {IMPORT_MAX_PAIRS}
            {t("importLimitPart2")}
          </Text>

          {!fileLabel ? (
            <TouchableOpacity
              style={[styles.pickBtn, { borderColor: C.tint, backgroundColor: C.isDark ? "rgba(99,102,241,0.12)" : "#eef0ff" }]}
              onPress={pickFile}
              activeOpacity={0.85}
            >
              <Feather name="upload" size={20} color={C.tint} />
              <Text style={[styles.pickBtnTxt, { color: C.tint }]}>{t("importPickFile")}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.fileRow}>
              <Feather name="file-text" size={18} color={C.textSub} />
              <Text style={[styles.fileName, { color: C.text }]} numberOfLines={2}>
                {fileLabel}
              </Text>
              <Pressable onPress={clearFile} hitSlop={10}>
                <Feather name="x-circle" size={22} color={C.textSub} />
              </Pressable>
            </View>
          )}

          {parseErrorKey ? (
            <Text style={styles.errTxt}>{t(parseErrorKey)}</Text>
          ) : pairs.length > 0 ? (
            <>
              <Text style={[styles.countTxt, { color: C.text }]}>
                {t("importRowsFound")}: <Text style={{ fontWeight: "700" }}>{pairs.length}</Text>
              </Text>
              <View style={[styles.previewBox, { borderColor: C.border }]}>
                <Text style={[styles.previewHeader, { color: C.textSub, backgroundColor: C.surfaceAlt }]}>
                  {t("importPreview")}
                </Text>
                {previewRows.map((p, idx) => (
                  <View key={idx} style={[styles.previewRow, { borderBottomColor: C.border }]}>
                    <Text style={[styles.previewFront, { color: C.text }]} numberOfLines={2}>
                      {p.front}
                    </Text>
                    <Text style={[styles.previewBack, { color: C.textSub }]} numberOfLines={2}>
                      {p.back}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {saveErrorKey ? <Text style={styles.errTxt}>{t(saveErrorKey)}</Text> : null}

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              { backgroundColor: canSave ? C.tint : C.border, opacity: canSave ? 1 : 0.5 },
            ]}
            disabled={!canSave}
            onPress={handleImport}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnTxt}>{t("importImport")}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  deckTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 12,
    fontSize: 15,
  },
  inputMulti: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  pickBtn: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  pickBtnTxt: {
    fontSize: 16,
    fontWeight: "600",
  },
  fileRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  countTxt: {
    marginTop: 12,
    fontSize: 14,
  },
  previewBox: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  previewHeader: {
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  previewRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  previewFront: {
    fontSize: 14,
    fontWeight: "600",
  },
  previewBack: {
    fontSize: 13,
  },
  errTxt: {
    color: "#dc2626",
    marginTop: 10,
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnTxt: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryBtnOut: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    alignSelf: "center",
  },
  secondaryBtnTxt: {
    fontSize: 16,
    fontWeight: "600",
  },
});
