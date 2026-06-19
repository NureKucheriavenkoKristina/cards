import React, { useRef, useState } from 'react';
import {
    FlatList,
    ImageBackground,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';

import { Deck } from '@/assets/data/decks';
import { Text } from '@/src/components/Themed';
import { useColorScheme } from '@/src/components/useColorScheme';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useAppColors } from '@/src/contexts/ThemeContext';
import Colors from '@/src/constants/Colors';
import Feather from '@expo/vector-icons/Feather';

export interface ListOfDecksProps {
  decks?: Deck[];
  cardCounts?: Record<string, number>;
  ratingByDeckId?: Record<string, number>; // average rating (1..5)
  ratingCountByDeckId?: Record<string, number>; // number of ratings
  onPressDeck?: (deck: Deck) => void;
  onEditDeck?: (deck: Deck) => void;
  onDeleteDeck?: (deck: Deck) => void;
  showPrivate?: boolean;
  readOnly?: boolean;
  /** When set with readOnly (e.g. public decks), shows ⋮ → report flow. */
  onReportDeck?: (deck: Deck) => void;
  listHeaderComponent?: React.ReactElement | null;
  /** Shown in the deck grid area when `decks` is empty (e.g. no search matches). */
  listEmptyComponent?: React.ReactElement | null;
  /** Set of deck_ids where user is a collaborator (not owner) */
  collaboratedDeckIds?: Set<string>;
}

function DeckCardInner({
  item,
  count,
  ratingAvg,
  ratingCount,
  hasCover,
  isGrid,
  isCollaborated,
  onPress,
  onEdit,
  onDelete,
  readOnly,
  onReportDeck,
  t,
}: {
  item: Deck;
  count: number;
  ratingAvg: number;
  ratingCount: number;
  hasCover: boolean;
  isGrid: boolean;
  isCollaborated: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
  onReportDeck?: (deck: Deck) => void;
  t: (key: string) => string;
}) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuLayout, setMenuLayout] = useState<{ x: number; y: number } | null>(null);
  const [imgError, setImgError] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const cs = useColorScheme();
  const C = useAppColors();

  const openMenu = () => {
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      const left = Math.max(8, x + width - 160);
      setMenuLayout({ x: left, y: y + height + 4 });
      setMenuVisible(true);
    });
  };

  const handleEdit = () => {
    setMenuVisible(false);
    onEdit();
  };

  const handleDelete = () => {
    setMenuVisible(false);
    onDelete();
  };

  const handleReport = () => {
    setMenuVisible(false);
    onReportDeck?.(item);
  };

  return (
    <View style={[styles.card, isGrid && styles.cardGrid, { backgroundColor: Colors[cs].surface }]}>
      <TouchableOpacity
        style={[styles.cardTouchable, isGrid && styles.cardTouchableGrid]}
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <View style={[styles.coverWrap, { backgroundColor: cs === 'dark' ? '#374151' : '#e8ecf2' }]}>
          {hasCover && !imgError ? (
            <ImageBackground
              source={{ uri: item.cover_image_url! }}
              style={styles.cover}
              imageStyle={styles.coverImageInner}
              resizeMode="cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: cs === 'dark' ? '#374151' : '#eef1f6' }]}>
              <Feather name="image" size={28} color="#b8c0d0" />
            </View>
          )}
        </View>
        <View style={[styles.cardContent, isGrid && styles.cardContentGrid]}>
          <View style={[styles.cardIcon, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : 'rgba(66,85,255,0.12)' }]}>
            <Feather name="layers" size={20} color={C.isDark ? '#7b82c4' : '#4255ff'} />
          </View>
          <View style={[styles.cardBody, isGrid && styles.cardBodyGrid]}>
            <View style={isGrid ? styles.titleSlot : undefined}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { flex: 1, color: C.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
                {isCollaborated && (
                  <View style={[styles.collabBadge, { backgroundColor: C.isDark ? 'rgba(99,102,241,0.15)' : '#EEF2FF' }]}>
                    <Feather name="users" size={10} color="#6366f1" />
                    <Text style={styles.collabBadgeTxt}>{t('collaborators')}</Text>
                  </View>
                )}
              </View>
            </View>
            {(item.description || isGrid) && (
              <View style={isGrid ? styles.descriptionSlot : undefined}>
                <Text
                  style={[styles.description, isGrid && styles.descriptionInGrid, { color: C.textSub }]}
                  numberOfLines={2}
                >
                  {item.description ? item.description : '\u00a0'}
                </Text>
              </View>
            )}
            <Text style={[styles.meta, { color: C.textMuted }]}>
              {count} {count !== 1 ? t('cards') : t('card')}
              {item.is_public ? ` • ${t('public')}` : ` • ${t('private')}`}
            </Text>
            <View style={styles.ratingSlot}>
              {ratingCount > 0 ? (
                <View style={styles.ratingRow}>
                  <Feather name="star" size={14} color="#f59e0b" />
                  <Text style={styles.ratingText}>
                    {ratingAvg.toFixed(1)} ({ratingCount})
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.cardActions}>
            {(!readOnly || onReportDeck) && (
              <Pressable
                ref={menuButtonRef}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  openMenu();
                }}
                style={styles.menuButton}
                hitSlop={8}
              >
                <Feather name="more-vertical" size={20} color="#9ca3af" />
              </Pressable>
            )}
            <Feather name="chevron-right" size={20} color="#9ca3af" />
          </View>
        </View>
      </TouchableOpacity>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          {menuLayout && (
            <View style={[styles.menuCard, { left: menuLayout.x, top: menuLayout.y, backgroundColor: Colors[cs].surface }]}>
              {readOnly && onReportDeck ? (
                <TouchableOpacity style={styles.menuItem} onPress={handleReport}>
                  <Feather name="flag" size={18} color={C.text} />
                  <Text style={[styles.menuItemText, { color: C.text }]}>{t('reportBoard')}</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={styles.menuItem} onPress={handleEdit}>
                    <Feather name="edit-2" size={18} color={C.text} />
                    <Text style={[styles.menuItemText, { color: C.text }]}>{t('editBoard')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={handleDelete}>
                    <Feather name="trash-2" size={18} color="#dc2626" />
                    <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>{t('deleteBoard')}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

export function ListOfDecks({
  decks = [],
  cardCounts = {},
  ratingByDeckId = {},
  ratingCountByDeckId = {},
  onPressDeck,
  onEditDeck,
  onDeleteDeck,
  showPrivate = true,
  readOnly = false,
  onReportDeck,
  listHeaderComponent = null,
  listEmptyComponent = null,
  collaboratedDeckIds,
}: ListOfDecksProps) {
  const { t } = useLanguage();
  const { width } = useWindowDimensions();

  // Wide web: 3 columns; narrow / native: 1
  const numColumns = Platform.OS === 'web' && width >= 900 ? 3 : 1;

  const data = React.useMemo(() => decks.filter((d) => showPrivate || d.is_public), [decks, showPrivate]);

  const renderItem = ({ item }: { item: Deck }) => {
    const count = cardCounts[item.deck_id] ?? 0;
    const ratingCount = ratingCountByDeckId[item.deck_id] ?? 0;
    const ratingAvg = ratingByDeckId[item.deck_id] ?? 0;
    const hasCover = Boolean(item.cover_image_url);
    const isGrid = numColumns > 1;
    const isCollaborated = collaboratedDeckIds?.has(item.deck_id) ?? false;

    return (
      <View style={isGrid ? styles.gridCell : styles.listItem}>
        <DeckCardInner
          item={item}
          count={count}
          ratingAvg={ratingAvg}
          ratingCount={ratingCount}
          hasCover={hasCover}
          isGrid={isGrid}
          isCollaborated={isCollaborated}
          onPress={() => onPressDeck?.(item)}
          onEdit={() => onEditDeck?.(item)}
          onDelete={() => onDeleteDeck?.(item)}
          readOnly={readOnly}
          onReportDeck={onReportDeck}
          t={t}
        />
      </View>
    );
  };

  return (
    <View style={styles.listWrapper}>
      <FlatList
        data={data}
        keyExtractor={(d) => String(d.deck_id)}
        renderItem={renderItem}
        numColumns={numColumns}
        key={numColumns}
        columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
        ListHeaderComponent={listHeaderComponent}
        ListEmptyComponent={listEmptyComponent ?? undefined}
        style={styles.list}
        contentContainerStyle={[
          styles.container,
          data.length === 0 && listEmptyComponent ? styles.containerWithEmpty : null,
        ]}
        showsVerticalScrollIndicator={Platform.OS === 'web'}
      />
    </View>
  );
}

export default ListOfDecks;

const styles = StyleSheet.create({
  listWrapper: {
    flex: 1,
    width: '100%',
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 100,
  },
  containerWithEmpty: {
    flexGrow: 1,
  },
  emptyList: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyListText: {
    fontSize: 16,
    textAlign: 'center',
  },
  list: {
    flex: 1,
    width: '100%',
  },
  gridRow: {
    alignItems: 'stretch',
  },
  listItem: {
    width: '100%',
    flex: 1,
  },
  gridCell: {
    flex: 1,
    margin: 6,
    minWidth: 0,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    width: '100%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardGrid: {
    flex: 1,
  },
  cardTouchable: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  cardTouchableGrid: {
    flex: 1,
    flexDirection: 'column',
  },
  coverWrap: {
    width: '100%',
    height: 120,
    backgroundColor: '#e8ecf2',
    overflow: 'hidden',
    position: 'relative',
  },
  cover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#e5e7eb',
  },
  coverImageInner: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
    ...(Platform.OS === 'web' ? { objectFit: 'cover' as const } : null),
  },
  coverPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef1f6',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  cardContentGrid: {
    flex: 1,
    alignItems: 'center',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(66, 85, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardBodyGrid: {
    flexGrow: 1,
  },
  titleSlot: {
    minHeight: 48,
    justifyContent: 'flex-start',
  },
  descriptionSlot: {
    marginTop: 4,
    minHeight: 44,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  menuButton: {
    padding: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  collabBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
    flexShrink: 0,
  },
  collabBadgeTxt: {
    fontSize: 10,
    fontWeight: '600',
    color: '#6366f1',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1f2937',
  },
  description: {
    marginTop: 4,
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  descriptionInGrid: {
    marginTop: 0,
  },
  meta: {
    marginTop: 6,
    fontSize: 13,
    color: '#9ca3af',
  },
  ratingSlot: {
    minHeight: 22,
    marginTop: 6,
    justifyContent: 'center',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    fontSize: 13,
    color: '#f59e0b',
    fontWeight: '700',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuCard: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 6,
    minWidth: 160,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  menuItemDanger: {},
  menuItemText: {
    fontSize: 16,
    color: '#1f2937',
  },
  menuItemTextDanger: {
    color: '#dc2626',
  },
});
