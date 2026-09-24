import emojiData, { type EmojiMartData } from '@emoji-mart/data';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { messagingColors as colors } from '@/constants/theme';
import { getGifs, isGiphyConfigured, type GifResult } from '@/lib/giphy';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

type ExpressionTab = 'emoji' | 'gif';

interface ExpressionPickerProps {
  onInsertEmoji: (emoji: string) => void;
  onSelectGif: (gif: GifResult) => Promise<void>;
}

const data = emojiData as EmojiMartData;
const categoryIcons: Record<string, string> = {
  people: '😀',
  nature: '🐻',
  foods: '🍕',
  activity: '⚽',
  places: '🚗',
  objects: '💡',
  symbols: '❤️',
  flags: '🏳️',
};

export function ExpressionPicker({
  onInsertEmoji,
  onSelectGif,
}: ExpressionPickerProps) {
  const [tab, setTab] = useState<ExpressionTab>('emoji');
  const [emojiCategory, setEmojiCategory] = useState(
    data.categories[0]?.id ?? 'people'
  );
  const [emojiQuery, setEmojiQuery] = useState('');
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TabButton
          active={tab === 'emoji'}
          label="Emoji"
          onPress={() => setTab('emoji')}
          styles={styles}
        />
        <TabButton
          active={tab === 'gif'}
          label="GIFs"
          onPress={() => setTab('gif')}
          styles={styles}
        />
      </View>
      {tab === 'emoji' ? (
        <EmojiPanel
          category={emojiCategory}
          onCategoryChange={setEmojiCategory}
          onInsertEmoji={onInsertEmoji}
          onQueryChange={setEmojiQuery}
          query={emojiQuery}
          styles={styles}
        />
      ) : (
        <GifPanel onSelectGif={onSelectGif} styles={styles} />
      )}
    </View>
  );
}

interface StyledChildProps {
  styles: ReturnType<typeof createStyles>;
}

function TabButton({
  active,
  label,
  onPress,
  styles,
}: StyledChildProps & {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tab, active && styles.tabSelected]}
    >
      <Text style={[styles.tabText, active && styles.tabTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmojiPanel({
  category,
  onCategoryChange,
  onInsertEmoji,
  onQueryChange,
  query,
  styles,
}: StyledChildProps & {
  category: string;
  onCategoryChange: (category: string) => void;
  onInsertEmoji: (emoji: string) => void;
  onQueryChange: (query: string) => void;
  query: string;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const emojis = useMemo(() => {
    const ids = normalizedQuery
      ? Object.keys(data.emojis)
      : (data.categories.find((item) => item.id === category)?.emojis ?? []);
    return ids
      .map((id) => data.emojis[id])
      .filter(Boolean)
      .filter((emoji) => {
        if (!normalizedQuery) return true;
        return [emoji.name, emoji.id, ...emoji.keywords]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .map((emoji) => ({
        id: emoji.id,
        label: emoji.name,
        native: emoji.skins[0]?.native,
      }))
      .filter((emoji): emoji is { id: string; label: string; native: string } =>
        Boolean(emoji.native)
      );
  }, [category, normalizedQuery]);

  return (
    <>
      <View style={styles.searchBox}>
        <MaterialIcons name="search" size={19} style={styles.searchIcon} />
        <TextInput
          accessibilityLabel="Search emoji"
          onChangeText={onQueryChange}
          placeholder="Search emoji"
          placeholderTextColor={styles.placeholder.color}
          style={styles.searchInput}
          value={query}
        />
      </View>
      {!normalizedQuery ? (
        <View style={styles.categories}>
          {data.categories.map((item) => (
            <Pressable
              accessibilityLabel={`${item.id} emoji`}
              accessibilityRole="button"
              key={item.id}
              onPress={() => onCategoryChange(item.id)}
              style={[
                styles.categoryButton,
                category === item.id && styles.categoryButtonSelected,
              ]}
            >
              <Text style={styles.categoryIcon}>
                {categoryIcons[item.id] ?? '•'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <FlatList
        contentContainerStyle={styles.emojiGrid}
        data={emojis}
        initialNumToRender={48}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(emoji) => emoji.id}
        numColumns={8}
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={`Insert ${item.label}`}
            accessibilityRole="button"
            onPress={() => onInsertEmoji(item.native)}
            style={({ pressed }) => [
              styles.emojiButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.emoji}>{item.native}</Text>
          </Pressable>
        )}
        style={styles.grid}
        windowSize={5}
      />
    </>
  );
}

function GifPanel({
  onSelectGif,
  styles,
}: StyledChildProps & {
  onSelectGif: (gif: GifResult) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGiphyConfigured()) return;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    const timer = setTimeout(
      () => {
        void getGifs(query, controller.signal)
          .then((results) => {
            if (!controller.signal.aborted) setGifs(results);
          })
          .catch((caught: unknown) => {
            if (!controller.signal.aborted) {
              setError(
                caught instanceof Error
                  ? caught.message
                  : 'Unable to load GIFs.'
              );
            }
          })
          .finally(() => {
            if (!controller.signal.aborted) setIsLoading(false);
          });
      },
      query.trim() ? 300 : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  if (!isGiphyConfigured()) {
    return (
      <View style={styles.centeredMessage}>
        <MaterialIcons name="gif-box" size={42} style={styles.searchIcon} />
        <Text style={styles.messageTitle}>GIPHY key required</Text>
        <Text style={styles.messageText}>
          Add EXPO_PUBLIC_GIPHY_API_KEY to mobile/.env, then restart Expo.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.searchBox}>
        <MaterialIcons name="search" size={19} style={styles.searchIcon} />
        <TextInput
          accessibilityLabel="Search GIFs"
          maxLength={50}
          onChangeText={setQuery}
          placeholder="Search GIFs"
          placeholderTextColor={styles.placeholder.color}
          style={styles.searchInput}
          value={query}
        />
      </View>
      {isLoading && gifs.length === 0 ? (
        <View style={styles.centeredMessage}>
          <ActivityIndicator />
          <Text style={styles.messageText}>Loading GIFs…</Text>
        </View>
      ) : error ? (
        <View style={styles.centeredMessage}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          columnWrapperStyle={styles.gifRow}
          contentContainerStyle={styles.gifGrid}
          data={gifs}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(gif) => gif.id}
          numColumns={2}
          renderItem={({ item }) => (
            <Pressable
              accessibilityLabel={`Send ${item.title}`}
              accessibilityRole="button"
              disabled={sendingId !== null}
              onPress={() => {
                setSendingId(item.id);
                void onSelectGif(item).finally(() => setSendingId(null));
              }}
              style={({ pressed }) => [
                styles.gifButton,
                pressed && styles.pressed,
              ]}
            >
              <Image
                accessibilityLabel={item.title}
                autoplay
                contentFit="cover"
                source={item.previewUrl}
                style={styles.gifImage}
              />
              {sendingId === item.id ? (
                <View style={styles.gifSending}>
                  <ActivityIndicator color="#FFFFFF" />
                </View>
              ) : null}
            </Pressable>
          )}
          style={styles.grid}
        />
      )}
      <Text style={styles.attribution}>Powered by GIPHY</Text>
    </>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    attribution: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.8,
      paddingBottom: 8,
      textAlign: 'center',
    },
    categories: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 6,
    },
    categoryButton: {
      alignItems: 'center',
      borderRadius: 12,
      height: 34,
      justifyContent: 'center',
      width: 34,
    },
    categoryButtonSelected: { backgroundColor: c.bgSurface },
    categoryIcon: { fontSize: 18 },
    centeredMessage: {
      alignItems: 'center',
      flex: 1,
      gap: 8,
      justifyContent: 'center',
      padding: 20,
    },
    container: { height: 330 },
    emoji: { fontSize: 27 },
    emojiButton: {
      alignItems: 'center',
      borderRadius: 10,
      height: 42,
      justifyContent: 'center',
      width: '12.5%',
    },
    emojiGrid: { paddingBottom: 10, paddingHorizontal: 6 },
    errorText: { color: c.error, fontSize: 13, textAlign: 'center' },
    gifButton: {
      backgroundColor: c.bgSurface,
      borderRadius: 12,
      flex: 1,
      height: 110,
      overflow: 'hidden',
    },
    gifGrid: { gap: 6, padding: 8 },
    gifImage: { height: '100%', width: '100%' },
    gifRow: { gap: 6 },
    gifSending: {
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.35)',
      bottom: 0,
      justifyContent: 'center',
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    grid: { flex: 1 },
    messageText: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
    messageTitle: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    placeholder: { color: c.textMuted },
    pressed: { opacity: 0.65 },
    searchBox: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderRadius: 999,
      flexDirection: 'row',
      marginHorizontal: 8,
      marginVertical: 6,
      minHeight: 38,
      paddingHorizontal: 12,
    },
    searchIcon: { color: c.textMuted },
    searchInput: {
      color: c.textPrimary,
      flex: 1,
      fontSize: 14,
      paddingHorizontal: 8,
      paddingVertical: 0,
    },
    tab: {
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    tabSelected: { backgroundColor: c.bgSurface },
    tabText: { color: c.textMuted, fontSize: 13 },
    tabTextSelected: { color: c.textPrimary, fontWeight: '600' },
    tabs: { flexDirection: 'row', gap: 4, padding: 8 },
  });
