import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';

import { Text } from '@/src/components/Themed';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { supabase } from '@/src/lib/supabase';
import { useAppColors } from '@/src/contexts/ThemeContext';
import type { Locale } from '@/src/locales/translations';

/* ─── Types ─────────────────────────────────────────────────── */
type Stats = {
  total_reviews: number;
  reviews_today: number;
  streak_days: number;
  cards_new: number;
  cards_learning: number;
  cards_review: number;
  cards_relearning: number;
  total_decks: number;
  count_again: number;
  count_hard: number;
  count_good: number;
  count_easy: number;
};

type WordStats = {
  cards_total: number;
  cards_not_started: number;
  cards_in_progress: number;
  cards_graduated: number;
  ease_easy: number;
  ease_medium: number;
  ease_hard: number;
  words_today: number;
  words_month: number;
  words_alltime: number;
};

type ActivityDay = {
  review_date: string;
  count: number;
};

type DeckStat = {
  deck_id: string;
  deck_title: string;
  cover_image_url: string | null;
  total_cards: number;
  cards_new: number;
  cards_learning: number;
  cards_review: number;
  cards_relearning: number;
  reviews_total: number;
  last_studied: string | null;
};

type ForecastDay = { due_day: string; count: number };
type AddedDay = { added_day: string; count: number };

type ActivityRange = 7 | 30 | 90;

/** BCP 47 tag for Intl — must match app language, not system default (avoids RU when UI is UK). */
function bcp47ForAppLocale(locale: Locale): string {
  return locale === 'uk' ? 'uk-UA' : 'en-US';
}

/* ─── Helpers ────────────────────────────────────────────────── */
function formatDate(iso: string | null, neverLabel: string, dateLocaleTag: string): string {
  if (!iso) return neverLabel;
  return new Date(iso).toLocaleDateString(dateLocaleTag, { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseIsoDate(iso: string): Date {
  return new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
}

function formatLongDate(iso: string, dateLocaleTag: string): string {
  return parseIsoDate(iso).toLocaleDateString(dateLocaleTag, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const COMPACT_CHART_WIDTH = 520;

function chartAxisDate(iso: string, dateLocaleTag: string, compact: boolean): string {
  const d = parseIsoDate(iso);
  if (compact) {
    return d.toLocaleDateString(dateLocaleTag, { day: 'numeric', month: 'numeric' });
  }
  return d.toLocaleDateString(dateLocaleTag, { month: 'short', day: 'numeric' });
}

/** Which bar indices get an X-axis label (start, middle, end). */
function chartLabelIndices(length: number): number[] {
  if (length <= 0) return [];
  if (length === 1) return [0];
  const mid = Math.floor(length / 2);
  if (mid <= 0 || mid >= length - 1) return [0, length - 1];
  return [0, mid, length - 1];
}

function pct(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function formatTemplate(tpl: string, params: Record<string, string | number>): string {
  return Object.keys(params).reduce(
    (acc, k) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k])),
    tpl,
  );
}

/** Pick a "nice" axis max + integer ticks (e.g., 28 → 30 ticks [0,10,20,30]). */
function niceScale(maxVal: number, ticksTarget = 5): { max: number; ticks: number[] } {
  if (maxVal <= 0) return { max: 1, ticks: [0, 1] };
  const rawStep = maxVal / ticksTarget;
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const m = rawStep / base;
  let niceM: number;
  if (m <= 1) niceM = 1;
  else if (m <= 2) niceM = 2;
  else if (m <= 5) niceM = 5;
  else niceM = 10;
  const step = niceM * base;
  const max = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + 1e-6; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return { max, ticks };
}

/* ─── InfoTooltip ────────────────────────────────────────────── */
const TIP_W = 230;

type TipAnchor = { top: number; left: number; arrowLeft: number };

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<TipAnchor>({ top: 0, left: 0, arrowLeft: TIP_W / 2 - 6 });
  const btnRef = useRef<View>(null);

  const handlePress = () => {
    if (visible) { setVisible(false); return; }
    (btnRef.current as any)?.measure(
      (_x: number, _y: number, w: number, h: number, pageX: number, pageY: number) => {
        const screenW = Dimensions.get('window').width;
        let left = pageX + w / 2 - TIP_W / 2;
        left = Math.max(8, Math.min(left, screenW - TIP_W - 8));
        const arrowLeft = pageX + w / 2 - left - 6;
        setAnchor({ top: pageY + h + 6, left, arrowLeft });
        setVisible(true);
      },
    );
  };

  return (
    <>
      <Pressable ref={btnRef as any} onPress={handlePress} hitSlop={10} style={styles.infoBtn}>
        <Feather name="info" size={13} color={visible ? '#6366f1' : '#9ca3af'} />
      </Pressable>

      {visible && (
        <Modal transparent animationType="none" onRequestClose={() => setVisible(false)}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVisible(false)}>
            <View
              style={[styles.tipBubble, { top: anchor.top, left: anchor.left, width: TIP_W }]}
              onStartShouldSetResponder={() => true}
            >
              <View style={[styles.tipArrow, { left: anchor.arrowLeft }]} />
              <Text style={styles.tipText}>{text}</Text>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

/* ─── Period card ────────────────────────────────────────────── */
function PeriodCard({
  icon,
  value,
  label,
  color,
  bgColor,
  tip,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  value: number;
  label: string;
  color: string;
  bgColor: string;
  tip: string;
}) {
  const C = useAppColors();
  return (
    <View style={[styles.periodCard, { borderTopColor: color, backgroundColor: C.surface }]}>
      <View style={styles.cardInfoRow}>
        <InfoTooltip text={tip} />
      </View>
      <View style={[styles.periodIcon, { backgroundColor: bgColor }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.periodVal, { color }]}>{value}</Text>
      <Text style={styles.periodLabel}>{label}</Text>
    </View>
  );
}

/* ─── Summary card ───────────────────────────────────────────── */
function SummaryCard({
  icon,
  iconBg,
  value,
  label,
  color,
  borderColor,
  tip,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconBg: string;
  value: string | number;
  label: string;
  color: string;
  borderColor: string;
  tip: string;
}) {
  const C = useAppColors();
  return (
    <View style={[styles.summaryCard, { borderTopColor: borderColor, backgroundColor: C.surface }]}>
      <View style={styles.cardInfoRow}>
        <InfoTooltip text={tip} />
      </View>
      <View style={[styles.summaryIconWrap, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.summaryVal, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

/* ─── Segment bar ────────────────────────────────────────────── */
function SegmentBar({ segments }: { segments: { color: string; value: number }[] }) {
  const C = useAppColors();
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <View style={[styles.segBarBg, { backgroundColor: C.border }]} />;
  return (
    <View style={[styles.segBarBg, { backgroundColor: C.border }]}>
      {segments.map((seg, i) => {
        const w = pct(seg.value, total);
        if (w === 0) return null;
        return (
          <View
            key={i}
            style={[
              styles.segBarFill,
              {
                width: `${w}%`,
                backgroundColor: seg.color,
                borderRadius:
                  i === 0 ? 4 : i === segments.length - 1 ? 4 : 0,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

/* ─── Label row ──────────────────────────────────────────────── */
function LabelRow({
  color,
  label,
  count,
  total,
  tip,
}: {
  color: string;
  label: string;
  count: number;
  total: number;
  tip?: string;
}) {
  const C = useAppColors();
  const percent = pct(count, total);
  return (
    <View style={styles.labelRow}>
      <View style={[styles.labelDot, { backgroundColor: color }]} />
      <Text style={[styles.labelText, { color: C.text }]}>{label}</Text>
      <View style={[styles.labelBarBg, { backgroundColor: C.border }]}>
        <View style={[styles.labelBarFill, { width: `${percent}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.labelPct, { color }]}>{percent}%</Text>
      <Text style={[styles.labelCount, { color: C.textMuted }]}>{count}</Text>
      {tip && <InfoTooltip text={tip} />}
    </View>
  );
}

/* ─── Generic Bar Chart ──────────────────────────────────────── */
type BarDatum = {
  label?: string;
  value: number;
  highlight?: boolean;
  /** Full date line shown when the bar is selected */
  detailTitle?: string;
  detailBody?: string;
};

const Y_AXIS_W = 32;
const TOOLTIP_SPACE = 58;

type TooltipAlign = 'left' | 'center' | 'right';

function barTooltipAlign(index: number, total: number): TooltipAlign {
  if (total <= 1) return 'center';
  if (index < total * 0.15) return 'left';
  if (index > total * 0.85) return 'right';
  return 'center';
}

function BarColumnTooltip({
  title,
  body,
  barHeightPx,
  align,
  accentColor,
}: {
  title: string;
  body?: string;
  barHeightPx: number;
  align: TooltipAlign;
  accentColor: string;
}) {
  const C = useAppColors();
  return (
    <View
      style={[
        styles.bcTooltip,
        align === 'left' && styles.bcTooltipLeft,
        align === 'right' && styles.bcTooltipRight,
        align === 'center' && styles.bcTooltipCenter,
        {
          bottom: barHeightPx + 6,
          backgroundColor: C.isDark ? '#1f2937' : '#ffffff',
          borderColor: accentColor,
          shadowColor: '#000',
        },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.bcTooltipTitle, { color: C.text }]} numberOfLines={2}>
        {title}
      </Text>
      {body ? (
        <Text style={[styles.bcTooltipBody, { color: C.textSub }]} numberOfLines={2}>
          {body}
        </Text>
      ) : null}
    </View>
  );
}

function BarChart({
  data,
  color = '#6366f1',
  barHeight = 110,
  showXLabels = true,
}: {
  data: BarDatum[];
  color?: string;
  barHeight?: number;
  showXLabels?: boolean;
}) {
  const C = useAppColors();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const peak = Math.max(0, ...data.map((d) => d.value));
  const { max, ticks } = niceScale(peak);

  return (
    <View style={styles.bcWrap}>
      <View style={[styles.bcRow, { height: barHeight + TOOLTIP_SPACE, paddingTop: TOOLTIP_SPACE }]}>
        {/* ── Y axis with tick labels ── */}
        <View style={[styles.bcYAxis, { width: Y_AXIS_W, height: barHeight }]}>
          {ticks.map((tick) => (
            <Text
              key={`y-${tick}`}
              style={[
                styles.bcYTick,
                {
                  color: C.textMuted,
                  top: barHeight * (1 - tick / max) - 7,
                },
              ]}
              numberOfLines={1}
            >
              {tick}
            </Text>
          ))}
        </View>

        {/* ── Chart area: gridlines + bars ── */}
        <View style={[styles.bcChartArea, { height: barHeight, overflow: 'visible' }]}>
          {ticks.map((tick) => (
            <View
              key={`g-${tick}`}
              style={[
                styles.bcGridLine,
                {
                  top: barHeight * (1 - tick / max),
                  backgroundColor: tick === 0 ? C.border : C.borderLight,
                },
              ]}
            />
          ))}

          <View style={[styles.bcBars, { height: barHeight, overflow: 'visible' }]}>
            {data.map((d, i) => {
              const h = d.value > 0
                ? Math.max(2, Math.round((d.value / max) * barHeight))
                : 0;
              const barH = Math.max(h, 4);
              const isSelected = selectedIndex === i;
              return (
                <Pressable
                  key={i}
                  style={[
                    styles.bcBarCol,
                    isSelected && styles.bcBarColSelected,
                  ]}
                  onPress={() => setSelectedIndex(isSelected ? null : i)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    d.detailTitle && d.detailBody
                      ? `${d.detailTitle}. ${d.detailBody}`
                      : d.detailTitle ?? d.label ?? String(d.value)
                  }
                >
                  {isSelected && d.detailTitle ? (
                    <BarColumnTooltip
                      title={d.detailTitle}
                      body={d.detailBody}
                      barHeightPx={barH}
                      align={barTooltipAlign(i, data.length)}
                      accentColor={color}
                    />
                  ) : null}
                  <View
                    style={[
                      styles.bcBar,
                      isSelected && styles.bcBarSelected,
                      {
                        height: barH,
                        backgroundColor: d.value === 0
                          ? (isSelected ? `${color}33` : 'transparent')
                          : isSelected ? color : d.highlight ? color : `${color}80`,
                        borderColor: isSelected ? color : 'transparent',
                      },
                    ]}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {showXLabels && (
        <View style={styles.bcXRow}>
          <View style={{ width: Y_AXIS_W }} />
          <View style={styles.bcXTrack}>
            {data.map((d, i) => {
              const text = (d.label ?? '').trim();
              if (!text) return null;
              const align: TooltipAlign =
                i === 0 ? 'left' : i === data.length - 1 ? 'right' : 'center';
              const xRatio = data.length > 1 ? i / (data.length - 1) : 0.5;
              return (
                <Text
                  key={`x-${i}`}
                  numberOfLines={2}
                  style={[
                    styles.bcXLabelAbs,
                    align === 'left' && styles.bcXLabelLeft,
                    align === 'right' && styles.bcXLabelRight,
                    align === 'center' && {
                      left: `${xRatio * 100}%`,
                      transform: [{ translateX: '-50%' as const }],
                    },
                    { color: C.textMuted },
                  ]}
                >
                  {text}
                </Text>
              );
            })}
          </View>
        </View>
      )}

    </View>
  );
}

/* ─── Period toggle ──────────────────────────────────────────── */
function PeriodToggle({
  value,
  onChange,
  options,
}: {
  value: ActivityRange;
  onChange: (v: ActivityRange) => void;
  options: { v: ActivityRange; label: string }[];
}) {
  const C = useAppColors();
  return (
    <View style={[styles.toggleWrap, { backgroundColor: C.surfaceAlt ?? '#f5f6fa', borderColor: C.borderLight }]}>
      {options.map((o) => {
        const active = o.v === value;
        return (
          <Pressable
            key={o.v}
            onPress={() => onChange(o.v)}
            style={[
              styles.toggleBtn,
              active && { backgroundColor: '#6366f1' },
            ]}
          >
            <Text
              style={[
                styles.toggleTxt,
                active ? { color: '#fff' } : { color: C.textSub },
              ]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ─── Section header ─────────────────────────────────────────── */
function SectionHead({
  icon,
  title,
  pill,
  tip,
  subtitle,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  pill?: number;
  tip?: string;
  subtitle?: string;
}) {
  const C = useAppColors();
  return (
    <View style={styles.sectionHeadWrap}>
      <View style={styles.sectionHead}>
        <Feather name={icon} size={16} color="#6366f1" />
        <Text style={[styles.sectionTitle, { color: C.text }]}>{title}</Text>
        {pill !== undefined && (
          <View style={styles.totalPill}>
            <Text style={styles.totalPillTxt}>{pill}</Text>
          </View>
        )}
        {tip && <InfoTooltip text={tip} />}
      </View>
      {subtitle ? (
        <Text style={[styles.sectionSubtitle, { color: C.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

/* ─── Deck card ──────────────────────────────────────────────── */
function DeckStatCard({
  deck,
  t,
  dateLocaleTag,
  onPress,
}: {
  deck: DeckStat;
  t: (k: string) => string;
  dateLocaleTag: string;
  onPress: () => void;
}) {
  const C = useAppColors();
  const studied = deck.cards_learning + deck.cards_review + deck.cards_relearning;
  const progress = deck.total_cards > 0 ? studied / deck.total_cards : 0;

  return (
    <TouchableOpacity style={[styles.deckCard, { backgroundColor: C.surface }]} onPress={onPress} activeOpacity={0.85}>
      {deck.cover_image_url ? (
        <Image source={{ uri: deck.cover_image_url }} style={styles.deckCover} />
      ) : (
        <View style={[styles.deckCover, styles.deckCoverFallback, { backgroundColor: C.isDark ? '#1e2235' : '#EEF2FF' }]}>
          <Feather name="layers" size={22} color={C.isDark ? '#5a5f8a' : '#a5b4fc'} />
        </View>
      )}
      <View style={styles.deckInfo}>
        <Text style={[styles.deckTitle, { color: C.text }]} numberOfLines={1}>{deck.deck_title}</Text>
        <Text style={[styles.deckMeta, { color: C.textSub }]}>
          {deck.total_cards} {t('statCards')} · {deck.reviews_total} {t('statReviews')}
        </Text>
        <View style={[styles.progressBg, { backgroundColor: C.border }]}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={[styles.deckLastStudied, { color: C.textMuted }]}>
          {t('statLastStudied')}: {formatDate(deck.last_studied, t('statNever'), dateLocaleTag)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Main Screen
═══════════════════════════════════════════════════════════════ */
export default function StatisticsScreen() {
  const { locale, t } = useLanguage();
  const { user } = useAuth();
  const router = useRouter();
  const navigation = useNavigation();
  const C = useAppColors();
  const dateLocaleTag = bcp47ForAppLocale(locale);
  const { width: windowWidth } = useWindowDimensions();
  const compactCharts = windowWidth < COMPACT_CHART_WIDTH;

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('statistics') });
  }, [navigation, t]);

  const [stats, setStats] = useState<Stats | null>(null);
  const [wordStats, setWordStats] = useState<WordStats | null>(null);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [activityRange, setActivityRange] = useState<ActivityRange>(30);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [added, setAdded] = useState<AddedDay[]>([]);
  const [deckStats, setDeckStats] = useState<DeckStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activityRangeRef = useRef(activityRange);
  activityRangeRef.current = activityRange;

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    const range = activityRangeRef.current;
    const [
      statsRes,
      wordRes,
      activityRes,
      forecastRes,
      addedRes,
      deckRes,
    ] = await Promise.all([
      supabase.rpc('get_my_stats'),
      supabase.rpc('get_my_word_stats'),
      supabase.rpc('get_review_activity', { p_days: range }),
      supabase.rpc('get_review_forecast', { p_days: 30 }),
      supabase.rpc('get_added_cards_activity', { p_days: 30 }),
      supabase.rpc('get_my_deck_stats'),
    ]);
    if (statsRes.error || wordRes.error || activityRes.error || deckRes.error) {
      setError(t('statLoadError'));
    }
    if (statsRes.data?.[0]) setStats(statsRes.data[0] as Stats);
    if (wordRes.data?.[0]) setWordStats(wordRes.data[0] as WordStats);
    setActivity((activityRes.data ?? []) as ActivityDay[]);
    setForecast((forecastRes.data ?? []) as ForecastDay[]);
    setAdded((addedRes.data ?? []) as AddedDay[]);
    setDeckStats((deckRes.data ?? []) as DeckStat[]);
    setLoading(false);
    setRefreshing(false);
  }, [user, t]);

  const loadActivityOnly = useCallback(async (range: ActivityRange) => {
    if (!user) return;
    const { data, error: activityError } = await supabase.rpc('get_review_activity', {
      p_days: range,
    });
    if (activityError) setError(t('statLoadError'));
    else setActivity((data ?? []) as ActivityDay[]);
  }, [user, t]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);
      void load();
    }, [user, load]),
  );

  const skipActivityRangeFetch = useRef(true);
  useEffect(() => {
    if (!user) return;
    if (skipActivityRangeFetch.current) {
      skipActivityRangeFetch.current = false;
      return;
    }
    void loadActivityOnly(activityRange);
  }, [activityRange, user, loadActivityOnly]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading && !refreshing) {
    return (
      <View style={[styles.centered, { backgroundColor: C.bg }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const totalReviews  = stats?.total_reviews ?? 0;
  const countAgain    = stats?.count_again   ?? 0;
  const countHard     = stats?.count_hard    ?? 0;
  const countGood     = stats?.count_good    ?? 0;
  const countEasy     = stats?.count_easy    ?? 0;
  const retentionRate = pct(countGood + countEasy, totalReviews);

  const cardsTotal      = wordStats?.cards_total      ?? 0;
  const cardsNotStarted = wordStats?.cards_not_started ?? 0;
  const cardsInProgress = wordStats?.cards_in_progress ?? 0;
  const cardsGraduated  = wordStats?.cards_graduated   ?? 0;
  const easeEasy        = wordStats?.ease_easy         ?? 0;
  const easeMedium      = wordStats?.ease_medium       ?? 0;
  const easeHard        = wordStats?.ease_hard         ?? 0;
  const easeTotal       = easeEasy + easeMedium + easeHard;

  /* ─── Build chart data ─── */
  const todayIso = new Date().toISOString().split('T')[0];
  const activityLabelIdx = new Set(chartLabelIndices(activity.length));

  const activityData: BarDatum[] = activity.map((d, i) => ({
    label: activityLabelIdx.has(i)
      ? chartAxisDate(d.review_date, dateLocaleTag, compactCharts)
      : '',
    value: d.count,
    highlight: d.review_date === todayIso,
    detailTitle: formatLongDate(d.review_date, dateLocaleTag),
    detailBody: d.count > 0
      ? formatTemplate(t('statBarReviewsOnDay'), { count: d.count })
      : t('statBarReviewsOnDayNone'),
  }));
  const activityHasData = activity.some((d) => d.count > 0);

  const forecastLabelIdx = new Set(chartLabelIndices(forecast.length));

  const forecastData: BarDatum[] = forecast.map((d, i) => ({
    label: forecastLabelIdx.has(i)
      ? (i === 0
          ? (compactCharts ? t('statTodayShort') : t('statToday'))
          : chartAxisDate(d.due_day, dateLocaleTag, compactCharts))
      : '',
    value: d.count,
    highlight: d.due_day === todayIso,
    detailTitle: formatLongDate(d.due_day, dateLocaleTag),
    detailBody: d.count > 0
      ? formatTemplate(t('statBarDueOnDay'), { count: d.count })
      : t('statBarDueOnDayNone'),
  }));
  const forecastTotal = forecast.reduce((s, d) => s + d.count, 0);

  const addedLabelIdx = new Set(chartLabelIndices(added.length));

  const addedData: BarDatum[] = added.map((d, i) => ({
    label: addedLabelIdx.has(i)
      ? chartAxisDate(d.added_day, dateLocaleTag, compactCharts)
      : '',
    value: d.count,
    highlight: d.added_day === todayIso,
    detailTitle: formatLongDate(d.added_day, dateLocaleTag),
    detailBody: d.count > 0
      ? formatTemplate(t('statBarAddedOnDay'), { count: d.count })
      : t('statBarAddedOnDayNone'),
  }));
  const addedTotal = added.reduce((s, d) => s + d.count, 0);

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: C.bg }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      showsVerticalScrollIndicator={Platform.OS === 'web'}
    >
      {error && (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={14} color="#dc2626" />
          <Text style={styles.errorTxt}>{error}</Text>
        </View>
      )}

      {/* ══ 1. Огляд (3 cards) ══ */}
      <View style={styles.summaryGrid}>
        <SummaryCard icon="zap"          iconBg="#fef3c7" value={stats?.streak_days ?? 0}    label={`${t('statStreak')} (${t('statDays')})`} color="#d97706" borderColor="#f59e0b" tip={t('tipStreak')} />
        <SummaryCard icon="trending-up"  iconBg="#fce7f3" value={`${retentionRate}%`}        label={t('statRetention')}                 color="#db2777" borderColor="#db2777" tip={t('tipRetention')} />
        <SummaryCard icon="repeat"       iconBg="#e0e7ff" value={totalReviews}                label={t('statTotalReviews')}              color="#4f46e5" borderColor="#6366f1" tip={t('tipTotalReviews')} />
      </View>

      {/* ══ 2. Картки, які ви вивчали ══ */}
      <View style={styles.section}>
        <SectionHead icon="book" title={t('statWordsTitle')} />
        <View style={styles.periodRow}>
          <PeriodCard icon="calendar"  value={wordStats?.words_today   ?? 0} label={t('statWordsToday')}   color="#6366f1" bgColor="#EEF2FF" tip={t('tipWordsToday')} />
          <PeriodCard icon="bar-chart" value={wordStats?.words_month   ?? 0} label={t('statWordsMonth')}   color="#0891b2" bgColor="#e0f2fe" tip={t('tipWordsMonth')} />
          <PeriodCard icon="award"     value={wordStats?.words_alltime ?? 0} label={t('statWordsAllTime')} color="#059669" bgColor="#d1fae5" tip={t('tipWordsAllTime')} />
        </View>
      </View>

      {/* ══ 3. Щоденна активність + перемикач діапазону ══ */}
      <View style={styles.section}>
        <SectionHead
          icon="activity"
          title={t('statActivity')}
          tip={t('tipActivity')}
        />
        <PeriodToggle
          value={activityRange}
          onChange={setActivityRange}
          options={[
            { v: 7,  label: t('statPeriod7d') },
            { v: 30, label: t('statPeriod30d') },
            { v: 90, label: t('statPeriod90d') },
          ]}
        />
        {!activityHasData ? (
          <View style={[styles.emptyBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.emptyTxt, { color: C.textMuted }]}>{t('statNoActivity')}</Text>
          </View>
        ) : (
          <View style={[styles.whiteCard, { backgroundColor: C.surface }]}>
            <BarChart key={`activity-${activityRange}`} data={activityData} color="#6366f1" />
          </View>
        )}
      </View>

      {/* ══ 4. Прогноз повторень ══ */}
      <View style={styles.section}>
        <SectionHead
          icon="calendar"
          title={t('statForecastTitle')}
          tip={t('tipForecast')}
          subtitle={formatTemplate(t('statForecastSub'), { days: 30 })}
        />
        {forecastTotal === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.emptyTxt, { color: C.textMuted }]}>{t('statForecastNoData')}</Text>
          </View>
        ) : (
          <View style={[styles.whiteCard, { backgroundColor: C.surface }]}>
            <BarChart data={forecastData} color="#0891b2" />
            <View style={[styles.metaRow, { borderTopColor: C.borderLight }]}>
              <View style={styles.metaItem}>
                <Feather name="clock" size={13} color="#0891b2" />
                <Text style={[styles.metaTxt, { color: C.textSub }]}>
                  {formatTemplate(t('statForecastTotal'), { count: forecastTotal, days: 30 })}
                </Text>
              </View>
              <Text style={[styles.metaSub, { color: C.textMuted }]}>
                {formatTemplate(t('statForecastDaily'), { avg: Math.round(forecastTotal / 30) })}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ══ 5. Темп додавання карток ══ */}
      <View style={styles.section}>
        <SectionHead
          icon="plus-circle"
          title={t('statAddedTitle')}
          tip={t('tipAddedRate')}
          subtitle={t('statAddedSub')}
        />
        {addedTotal === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: C.surface }]}>
            <Text style={[styles.emptyTxt, { color: C.textMuted }]}>{t('statAddedNoData')}</Text>
          </View>
        ) : (
          <View style={[styles.whiteCard, { backgroundColor: C.surface }]}>
            <BarChart data={addedData} color="#059669" />
            <View style={[styles.metaRow, { borderTopColor: C.borderLight }]}>
              <View style={styles.metaItem}>
                <Feather name="layers" size={13} color="#059669" />
                <Text style={[styles.metaTxt, { color: C.textSub }]}>
                  {formatTemplate(t('statAddedTotal'), { count: addedTotal })}
                </Text>
              </View>
              <Text style={[styles.metaSub, { color: C.textMuted }]}>
                {formatTemplate(t('statAddedAvg'), { avg: Math.max(1, Math.round(addedTotal / 30)) })}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ══ 6. Прогрес карток ══ */}
      <View style={styles.section}>
        <SectionHead icon="layers" title={t('statWordProgress')} pill={cardsTotal} tip={t('tipWordProgress')} />
        <View style={[styles.whiteCard, { backgroundColor: C.surface }]}>
          <SegmentBar segments={[
            { color: '#9ca3af', value: cardsNotStarted },
            { color: '#f59e0b', value: cardsInProgress },
            { color: '#10b981', value: cardsGraduated  },
          ]} />
          <View style={styles.segLegend}>
            <LabelRow color="#9ca3af" label={t('statNotStarted')} count={cardsNotStarted} total={cardsTotal} tip={t('tipNotStarted')} />
            <LabelRow color="#f59e0b" label={t('statInProgress')} count={cardsInProgress} total={cardsTotal} tip={t('tipInProgress')} />
            <LabelRow color="#10b981" label={t('statGraduated')}  count={cardsGraduated}  total={cardsTotal} tip={t('tipGraduated')} />
          </View>
          {cardsTotal > 0 && (
            <View style={[styles.retentionRow, { borderTopColor: C.borderLight }]}>
              <Feather name="check-circle" size={13} color="#10b981" />
              <Text style={[styles.retentionTxt, { color: C.textSub }]}>
                {t('statGraduated')}: <Text style={{ fontWeight: '800', color: '#10b981' }}>{pct(cardsGraduated, cardsTotal)}%</Text>
                {' '}({cardsGraduated}/{cardsTotal})
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ══ 7. Складність карток ══ */}
      <View style={styles.section}>
        <SectionHead icon="sliders" title={t('statDifficulty')} tip={t('tipDifficulty')} />
        {easeTotal === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: C.surface }]}><Text style={[styles.emptyTxt, { color: C.textMuted }]}>{t('statNoActivity')}</Text></View>
        ) : (
          <View style={[styles.whiteCard, { backgroundColor: C.surface }]}>
            <SegmentBar segments={[
              { color: '#22c55e', value: easeEasy   },
              { color: '#f59e0b', value: easeMedium },
              { color: '#ef4444', value: easeHard   },
            ]} />
            <View style={styles.segLegend}>
              <LabelRow color="#22c55e" label={t('statDiffEasy')}   count={easeEasy}   total={easeTotal} tip={t('tipDiffEasy')} />
              <LabelRow color="#f59e0b" label={t('statDiffMedium')} count={easeMedium} total={easeTotal} tip={t('tipDiffMedium')} />
              <LabelRow color="#ef4444" label={t('statDiffHard')}   count={easeHard}   total={easeTotal} tip={t('tipDiffHard')} />
            </View>
          </View>
        )}
      </View>

      {/* ══ 8. Якість відповідей ══ */}
      <View style={styles.section}>
        <SectionHead icon="bar-chart-2" title={t('statAnswers')} pill={totalReviews > 0 ? totalReviews : undefined} tip={t('tipAnswers')} />
        {totalReviews === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: C.surface }]}><Text style={[styles.emptyTxt, { color: C.textMuted }]}>{t('statNoActivity')}</Text></View>
        ) : (
          <View style={[styles.whiteCard, { backgroundColor: C.surface }]}>
            <LabelRow label={t('again')} count={countAgain} total={totalReviews} color="#ef4444" />
            <LabelRow label={t('hard')}  count={countHard}  total={totalReviews} color="#f59e0b" />
            <LabelRow label={t('good')}  count={countGood}  total={totalReviews} color="#22c55e" />
            <LabelRow label={t('easy')}  count={countEasy}  total={totalReviews} color="#3b82f6" />
            <View style={[styles.retentionRow, { borderTopColor: C.borderLight }]}>
              <Feather name="check-circle" size={13} color="#22c55e" />
              <Text style={[styles.retentionTxt, { color: C.textSub }]}>
                {t('statRetention')}: <Text style={styles.retentionVal}>{retentionRate}%</Text>
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ══ 9. Прогрес по дошках ══ */}
      <View style={styles.section}>
        <SectionHead icon="grid" title={t('statDecks')} />
        {deckStats.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: C.surface }]}><Text style={[styles.emptyTxt, { color: C.textMuted }]}>{t('statNoDecks')}</Text></View>
        ) : (
          deckStats.map(d => (
            <DeckStatCard key={d.deck_id} deck={d} t={t} dateLocaleTag={dateLocaleTag} onPress={() => router.push(`/deck-detail?id=${d.deck_id}`)} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

/* ─── Styles ─────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: '#f5f6fa' },
  content:  {
    padding: 16, paddingBottom: 48, gap: 16,
    maxWidth: 1104, width: '100%', alignSelf: 'center',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fef2f2', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#fecaca',
  },
  errorTxt: { fontSize: 13, color: '#dc2626', flex: 1 },

  /* ── Tooltip bubble ── */
  infoBtn: { padding: 2 },
  tipBubble: {
    position: 'absolute',
    maxWidth: 240,
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 9999,
  },
  tipArrow: {
    position: 'absolute',
    top: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1f2937',
  },
  tipText: { color: '#f9fafb', fontSize: 12, lineHeight: 17 },

  /* ── Info row inside cards ── */
  cardInfoRow: { width: '100%', alignItems: 'flex-end', minHeight: 18 },

  /* ── Period cards ── */
  periodRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  periodCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 10,
    alignItems: 'center', justifyContent: 'center', borderTopWidth: 3,
    height: 140, // fixed height for uniform cards
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  periodIcon: {
    width: 34, height: 34, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  periodVal:   { fontSize: 22, fontWeight: '800' },
  periodLabel: { fontSize: 11, color: '#6b7280', fontWeight: '500', textAlign: 'center' },

  /* ── Summary grid ── */
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: {
    flex: 1, minWidth: 140,
    backgroundColor: '#fff', borderRadius: 14, padding: 10,
    alignItems: 'center', borderTopWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  summaryIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 4,
  },
  summaryVal:   { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: '#6b7280', textAlign: 'center', fontWeight: '500' },

  /* ── Sections ── */
  section:          { gap: 10 },
  sectionHeadWrap:  { gap: 4 },
  sectionHead:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle:     { fontSize: 16, fontWeight: '700', flex: 1 },
  sectionSubtitle:  { fontSize: 12, marginLeft: 24 },
  totalPill: {
    backgroundColor: '#EEF2FF', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  totalPillTxt: { fontSize: 12, fontWeight: '700', color: '#6366f1' },

  /* ── White card ── */
  whiteCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },

  /* ── Segment bar ── */
  segBarBg:   { height: 10, backgroundColor: '#f3f4f6', borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  segBarFill: { height: 10 },
  segLegend:  { gap: 10 },

  /* ── Label row ── */
  labelRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  labelDot:    { width: 10, height: 10, borderRadius: 5 },
  labelText:   { width: 80, fontSize: 13, fontWeight: '600' },
  labelBarBg:  { flex: 1, height: 7, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden' },
  labelBarFill:{ height: 7, borderRadius: 4 },
  labelPct:    { width: 34, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  labelCount:  { width: 36, fontSize: 11, color: '#9ca3af', textAlign: 'right' },

  /* ── Retention row ── */
  retentionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  retentionTxt: { fontSize: 13, color: '#6b7280' },
  retentionVal: { fontWeight: '800', color: '#22c55e' },

  /* ── Period toggle ── */
  toggleWrap: {
    flexDirection: 'row', alignSelf: 'flex-start',
    backgroundColor: '#f5f6fa', padding: 3, borderRadius: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  toggleBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8,
  },
  toggleTxt: { fontSize: 12, fontWeight: '700' },

  /* ── Bar chart ── */
  bcWrap:       { paddingTop: 8, overflow: 'visible' },
  bcRow:        { flexDirection: 'row', overflow: 'visible' },
  bcYAxis:      { position: 'relative' },
  bcYTick:      {
    position: 'absolute',
    right: 6,
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'right',
    minWidth: 20,
  },
  bcChartArea:  { flex: 1, position: 'relative' },
  bcGridLine:   { position: 'absolute', left: 0, right: 0, height: 1 },
  bcBars:       { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bcBarCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minHeight: 44,
    position: 'relative',
    overflow: 'visible',
  },
  bcBarColSelected: { zIndex: 20 },
  bcBar:        { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3, borderWidth: 2 },
  bcBarSelected:{ borderWidth: 2 },
  bcTooltip: {
    position: 'absolute',
    width: 148,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 3,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  bcTooltipLeft:   { left: 0 },
  bcTooltipRight:  { right: 0 },
  bcTooltipCenter: { left: '50%', marginLeft: -74 },
  bcTooltipTitle:  { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  bcTooltipBody:   { fontSize: 11, lineHeight: 14 },
  bcXRow:       { flexDirection: 'row', marginTop: 6 },
  bcXTrack:     { flex: 1, minHeight: 34, position: 'relative' },
  bcXLabelAbs:  {
    position: 'absolute',
    top: 0,
    fontSize: 10,
    lineHeight: 13,
    maxWidth: 88,
    textAlign: 'center',
  },
  bcXLabelLeft:  { left: 0, textAlign: 'left', maxWidth: 96 },
  bcXLabelRight: { right: 0, textAlign: 'right', maxWidth: 96 },

  /* ── Meta row beneath chart ── */
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6',
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaTxt:  { fontSize: 13, color: '#6b7280' },
  metaSub:  { fontSize: 12, color: '#9ca3af' },

  /* ── Deck cards ── */
  deckCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  deckCover:        { width: 60, height: 60, borderRadius: 10 },
  deckCoverFallback:{ justifyContent: 'center', alignItems: 'center' },
  deckInfo:         { flex: 1, gap: 4 },
  deckTitle:        { fontSize: 14, fontWeight: '700' },
  deckMeta:         { fontSize: 12, color: '#6b7280' },
  progressBg:       { height: 5, backgroundColor: '#e5e7eb', borderRadius: 3, overflow: 'hidden' },
  progressFill:     { height: 5, backgroundColor: '#6366f1', borderRadius: 3 },
  deckLastStudied:  { fontSize: 11, color: '#9ca3af' },

  /* ── Empty ── */
  emptyBox: { backgroundColor: '#fff', borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyTxt: { fontSize: 14, color: '#9ca3af' },
});
