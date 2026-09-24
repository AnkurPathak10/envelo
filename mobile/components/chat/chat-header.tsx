import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { messagingColors as colors, spacing } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

interface ChatHeaderProps {
  avatarUrl: string | null;
  isBusy: boolean;
  isSearchOpen: boolean;
  name: string;
  onBack: () => void;
  onClearChat: () => void;
  onCloseSearch: () => void;
  onDeleteChat: () => void;
  onOpenSearch: () => void;
  onSearchQueryChange: (query: string) => void;
  participantId: string;
  searchQuery: string;
}

export function ChatHeader({
  avatarUrl,
  isBusy,
  isSearchOpen,
  name,
  onBack,
  onClearChat,
  onCloseSearch,
  onDeleteChat,
  onOpenSearch,
  onSearchQueryChange,
  participantId,
  searchQuery,
}: ChatHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  const chooseAction = (action: () => void): void => {
    setIsMenuOpen(false);
    action();
  };

  return (
    <>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Back to conversations"
            accessibilityRole="button"
            onPress={onBack}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons color={c.textPrimary} name="arrow-back" size={27} />
          </Pressable>

          <View style={styles.identity}>
            <ConversationAvatar
              avatarUrl={avatarUrl}
              name={name}
              size={40}
              userId={participantId || name}
            />
            <Text numberOfLines={1} style={styles.name}>
              {name}
            </Text>
          </View>

          <Pressable
            accessibilityLabel="Open chat menu"
            accessibilityRole="button"
            accessibilityState={{ expanded: isMenuOpen }}
            disabled={isBusy}
            onPress={() => setIsMenuOpen(true)}
            style={({ pressed }) => [
              styles.iconButton,
              isBusy && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons color={c.textPrimary} name="more-vert" size={27} />
          </Pressable>
        </View>

        {isSearchOpen ? (
          <View style={styles.searchRow}>
            <MaterialIcons color={c.textMuted} name="search" size={21} />
            <TextInput
              accessibilityLabel="Search this conversation"
              autoFocus
              maxLength={100}
              onChangeText={onSearchQueryChange}
              placeholder="Search messages"
              placeholderTextColor={c.textMuted}
              returnKeyType="search"
              style={styles.searchInput}
              value={searchQuery}
            />
            <Pressable
              accessibilityLabel="Close message search"
              accessibilityRole="button"
              onPress={onCloseSearch}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <MaterialIcons color={c.textMuted} name="close" size={23} />
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsMenuOpen(false)}
        transparent
        visible={isMenuOpen}
      >
        <Pressable
          accessibilityLabel="Close chat menu"
          onPress={() => setIsMenuOpen(false)}
          style={styles.menuBackdrop}
        >
          <Pressable
            accessibilityRole="menu"
            onPress={(event) => event.stopPropagation()}
            style={styles.menu}
          >
            <MenuRow
              icon="search"
              label="Search"
              onPress={() => chooseAction(onOpenSearch)}
              styles={styles}
              textColor={c.textPrimary}
            />
            <MenuRow
              icon="cleaning-services"
              label="Clear chat"
              onPress={() => chooseAction(onClearChat)}
              styles={styles}
              textColor={c.textPrimary}
            />
            <MenuRow
              destructive
              icon="delete-outline"
              label="Delete chat"
              onPress={() => chooseAction(onDeleteChat)}
              styles={styles}
              textColor={c.error}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

interface MenuRowProps {
  destructive?: boolean;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  textColor: string;
}

function MenuRow({ icon, label, onPress, styles, textColor }: MenuRowProps) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuPressed]}
    >
      <MaterialIcons color={textColor} name={icon} size={22} />
      <Text style={[styles.menuText, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    disabled: { opacity: 0.45 },
    headerRow: {
      alignItems: 'center',
      flexDirection: 'row',
      minHeight: 58,
      paddingHorizontal: spacing.sm,
    },
    iconButton: {
      alignItems: 'center',
      borderRadius: 24,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    identity: {
      alignItems: 'center',
      flex: 1,
      flexDirection: 'row',
      gap: spacing.sm,
      minWidth: 0,
    },
    menu: {
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      elevation: 12,
      minWidth: 190,
      overflow: 'hidden',
      position: 'absolute',
      right: spacing.md,
      top: 58,
    },
    menuBackdrop: { flex: 1 },
    menuPressed: { backgroundColor: c.bgBase },
    menuRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 50,
      paddingHorizontal: spacing.md,
    },
    menuText: { fontSize: 15, fontWeight: '500' },
    name: {
      color: c.textPrimary,
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
    },
    pressed: { opacity: 0.6 },
    safeArea: {
      backgroundColor: c.bgBase,
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      zIndex: 20,
    },
    searchInput: {
      color: c.textPrimary,
      flex: 1,
      fontSize: 15,
      paddingVertical: 0,
    },
    searchRow: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderRadius: 999,
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
      marginHorizontal: spacing.md,
      minHeight: 42,
      paddingHorizontal: spacing.md,
    },
  });
