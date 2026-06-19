import Feather from "@expo/vector-icons/Feather";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  DeckQuizLoading,
  DeckQuizProgress,
  DeckQuizScreenShell,
} from "@/src/components/DeckQuizLayout";
import { useLanguage } from "@/src/contexts/LanguageContext";
import { useAppColors } from "@/src/contexts/ThemeContext";
import type { QuizQuestion } from "@/src/lib/deckQuiz";
import { clearDeckQuizSession, getDeckQuizSession } from "@/src/lib/deckQuizSession";

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

function scoreMessageKey(pct: number): string {
  if (pct >= 90) return "deckQuizResultExcellent";
  if (pct >= 70) return "deckQuizResultGood";
  if (pct >= 50) return "deckQuizResultOk";
  return "deckQuizResultKeep";
}

export default function DeckQuizPlayScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ sessionId?: string; deckId?: string }>();
  const sessionId =
    typeof params.sessionId === "string"
      ? params.sessionId
      : Array.isArray(params.sessionId)
        ? params.sessionId[0]
        : undefined;
  const deckId =
    typeof params.deckId === "string"
      ? params.deckId
      : Array.isArray(params.deckId)
        ? params.deckId[0]
        : undefined;

  const { t } = useLanguage();
  const C = useAppColors();

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: title || t("deckQuizPlay") });
  }, [navigation, title, t]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    const session = getDeckQuizSession(sessionId);
    if (!session) {
      setQuestions([]);
      setLoading(false);
      return;
    }
    setTitle(session.title);
    setQuestions(session.questions);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (sessionId) clearDeckQuizSession(sessionId);
    };
  }, [sessionId]);

  const resetRun = useCallback(() => {
    setIndex(0);
    setCorrectCount(0);
    setPicked(null);
    setFinished(false);
  }, []);

  const handleDone = useCallback(() => {
    if (sessionId) clearDeckQuizSession(sessionId);
    if (deckId) {
      router.replace({ pathname: "/deck-quiz-new", params: { id: deckId } });
    } else {
      router.back();
    }
  }, [deckId, router, sessionId]);

  const handleRetake = useCallback(() => {
    resetRun();
  }, [resetRun]);

  const current = questions[index];
  const total = questions.length;

  const progressCurrent = useMemo(() => {
    if (finished) return total;
    return index + (picked ? 1 : 0);
  }, [finished, index, picked, total]);

  const progressLabel = useMemo(
    () =>
      t("deckQuizQuestionOf")
        .replace("{current}", String(Math.min(index + 1, total)))
        .replace("{total}", String(total)),
    [index, total, t],
  );

  const handlePick = (option: string) => {
    if (!current || picked) return;
    setPicked(option);
    if (option.trim() === current.correctAnswer.trim()) {
      setCorrectCount((c) => c + 1);
    }
  };

  const handleNext = () => {
    if (index + 1 >= total) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  };

  if (loading) {
    return <DeckQuizLoading message={t("deckQuizLoading")} />;
  }

  if (!questions.length) {
    return (
      <DeckQuizScreenShell scroll={false} centerVertically>
        <Feather name="clock" size={40} color={C.textSub} style={{ marginBottom: 16 }} />
        <Text style={[styles.expiredTxt, { color: C.textSub }]}>{t("deckQuizSessionExpired")}</Text>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: C.tint, marginTop: 24 }]}
          onPress={handleDone}
        >
          <Text style={styles.primaryBtnTxt}>{t("deckQuizDone")}</Text>
        </TouchableOpacity>
      </DeckQuizScreenShell>
    );
  }

  if (finished) {
    const pct = Math.round((correctCount / total) * 100);
    const msgKey = scoreMessageKey(pct);

    return (
      <DeckQuizScreenShell scroll={false} centerVertically>
        <View style={[styles.resultCard, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
          <View style={[styles.resultIconWrap, { backgroundColor: C.isDark ? "rgba(99,102,241,0.2)" : "#eef0ff" }]}>
            <Feather name="award" size={40} color={C.tint} />
          </View>
          <Text style={[styles.resultTitle, { color: C.text }]}>{t("deckQuizFinish")}</Text>
          <Text style={[styles.score, { color: C.tint }]}>
            {t("deckQuizScore")
              .replace("{correct}", String(correctCount))
              .replace("{total}", String(total))}
          </Text>
          <Text style={[styles.scorePct, { color: C.text }]}>{pct}%</Text>
          <Text style={[styles.resultMsg, { color: C.textSub }]}>{t(msgKey)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: C.tint }]}
          onPress={handleRetake}
        >
          <Feather name="refresh-cw" size={18} color="#fff" />
          <Text style={styles.primaryBtnTxt}>{t("deckQuizRetake")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: C.borderLight, backgroundColor: C.surface }]}
          onPress={handleDone}
        >
          <Text style={[styles.secondaryBtnTxt, { color: C.text }]}>{t("deckQuizDone")}</Text>
        </TouchableOpacity>
      </DeckQuizScreenShell>
    );
  }

  return (
    <DeckQuizScreenShell scroll>
      <DeckQuizProgress current={progressCurrent} total={total} label={progressLabel} />

      <View style={[styles.promptCard, { backgroundColor: C.surface, borderColor: C.borderLight }]}>
        <Text style={[styles.promptLabel, { color: C.textSub }]}>{t("deckQuizQuestionLabel")}</Text>
        <Text style={[styles.prompt, { color: C.text }]}>{current?.prompt}</Text>
      </View>

      <Text style={[styles.optionsLabel, { color: C.textSub }]}>{t("deckQuizChooseAnswer")}</Text>

      {current?.options.map((option, optIndex) => {
        const isPicked = picked === option;
        const isCorrect = option.trim() === current.correctAnswer.trim();
        const letter = OPTION_LETTERS[optIndex] ?? String(optIndex + 1);
        let border = C.borderLight;
        let bg = C.surface;
        let letterBg = C.isDark ? C.border : "#f3f4f6";
        let letterColor = C.textSub;

        if (picked) {
          if (isCorrect) {
            border = "#059669";
            bg = C.isDark ? "rgba(5,150,105,0.2)" : "#ecfdf5";
            letterBg = "#059669";
            letterColor = "#fff";
          } else if (isPicked && !isCorrect) {
            border = "#dc2626";
            bg = C.isDark ? "rgba(220,38,38,0.15)" : "#fef2f2";
            letterBg = "#dc2626";
            letterColor = "#fff";
          }
        }

        return (
          <TouchableOpacity
            key={`${option}-${optIndex}`}
            style={[styles.option, { backgroundColor: bg, borderColor: border }]}
            onPress={() => handlePick(option)}
            disabled={Boolean(picked)}
            activeOpacity={0.75}
          >
            <View style={[styles.optionLetter, { backgroundColor: letterBg }]}>
              <Text style={[styles.optionLetterTxt, { color: letterColor }]}>{letter}</Text>
            </View>
            <Text style={[styles.optionTxt, { color: C.text }]}>{option}</Text>
          </TouchableOpacity>
        );
      })}

      {picked ? (
        <View
          style={[
            styles.feedback,
            {
              backgroundColor: C.surface,
              borderColor: C.borderLight,
            },
          ]}
        >
          <Feather
            name={picked.trim() === current?.correctAnswer.trim() ? "check-circle" : "x-circle"}
            size={28}
            color={picked.trim() === current?.correctAnswer.trim() ? "#059669" : "#dc2626"}
          />
          <Text
            style={[
              styles.feedbackTitle,
              {
                color:
                  picked.trim() === current?.correctAnswer.trim() ? "#059669" : "#dc2626",
              },
            ]}
          >
            {picked.trim() === current?.correctAnswer.trim()
              ? t("deckQuizCorrect")
              : t("deckQuizWrong")}
          </Text>
          {picked.trim() !== current?.correctAnswer.trim() ? (
            <Text style={[styles.correctReveal, { color: C.textSub }]}>
              {t("deckQuizCorrectWas")} {current?.correctAnswer}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: C.tint, marginTop: 16 }]}
            onPress={handleNext}
          >
            <Text style={styles.primaryBtnTxt}>
              {index + 1 >= total ? t("deckQuizSeeResults") : t("deckQuizNext")}
            </Text>
            <Feather name="arrow-right" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : null}
    </DeckQuizScreenShell>
  );
}

const styles = StyleSheet.create({
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    marginTop: 8,
  },
  primaryBtnTxt: { color: "#fff", fontSize: 17, fontWeight: "700" },
  secondaryBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    width: "100%",
    alignItems: "center",
  },
  secondaryBtnTxt: { fontSize: 16, fontWeight: "600" },
  expiredTxt: { fontSize: 16, textAlign: "center", lineHeight: 24 },
  promptCard: {
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    minHeight: 120,
    justifyContent: "center",
    width: "100%",
  },
  promptLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    textAlign: "center",
  },
  prompt: { fontSize: 20, lineHeight: 30, fontWeight: "600", textAlign: "center" },
  optionsLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "center",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    marginBottom: 10,
    width: "100%",
  },
  optionLetter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLetterTxt: { fontSize: 14, fontWeight: "800" },
  optionTxt: { flex: 1, fontSize: 16, lineHeight: 23 },
  feedback: {
    marginTop: 8,
    alignItems: "center",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    width: "100%",
  },
  feedbackTitle: { fontSize: 18, fontWeight: "700", marginTop: 10 },
  correctReveal: { marginTop: 8, fontSize: 15, textAlign: "center", lineHeight: 22 },
  resultCard: {
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 20,
    alignItems: "center",
    width: "100%",
  },
  resultIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  resultTitle: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  score: { fontSize: 18, fontWeight: "600" },
  scorePct: { fontSize: 42, fontWeight: "800", marginVertical: 4 },
  resultMsg: { fontSize: 15, textAlign: "center", lineHeight: 22, marginTop: 8 },
});
