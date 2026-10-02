import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps, ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messagingColors, radius, spacing } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

export interface SheetAction {
  label: string;
  icon: ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  description?: string;
  destructive?: boolean;
  selected?: boolean;
  disabled?: boolean;
}

export function ActionSheet({
  visible,
  title,
  description,
  header,
  actions,
  onClose,
}: {
  visible: boolean;
  title: string;
  description?: string;
  header?: ReactNode;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const c = messagingColors[useAppColorScheme()];
  const insets = useSafeAreaInsets();
  const styles = createStyles(c);
  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <Pressable
          accessibilityLabel="Dismiss menu"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <View style={styles.heading}>
            {header}
            <View style={styles.headingText}>
              <Text accessibilityRole="header" style={styles.title}>
                {title}
              </Text>
              {description ? (
                <Text style={styles.description}>{description}</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close menu"
              onPress={onClose}
              style={styles.close}
            >
              <MaterialIcons name="close" size={22} color={c.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole={
                  action.selected !== undefined ? 'radio' : 'button'
                }
                accessibilityState={{
                  disabled: action.disabled,
                  checked: action.selected,
                }}
                disabled={action.disabled}
                onPress={action.onPress}
                style={({ pressed }) => [
                  styles.action,
                  action.selected && styles.selected,
                  pressed && styles.pressed,
                  action.disabled && styles.disabled,
                ]}
              >
                <MaterialIcons
                  name={action.icon}
                  size={23}
                  color={action.destructive ? c.error : c.accentPrimary}
                />
                <View style={styles.headingText}>
                  <Text
                    style={[
                      styles.actionText,
                      action.destructive && { color: c.error },
                    ]}
                  >
                    {action.label}
                  </Text>
                  {action.description ? (
                    <Text style={styles.description}>{action.description}</Text>
                  ) : null}
                </View>
                {action.selected ? (
                  <MaterialIcons
                    name="check"
                    size={22}
                    color={c.accentPrimary}
                  />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c: typeof messagingColors.light) =>
  StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.48)',
    },
    sheet: {
      backgroundColor: c.bgBase,
      borderTopLeftRadius: radius.lg + 8,
      borderTopRightRadius: radius.lg + 8,
      borderColor: c.border,
      borderWidth: StyleSheet.hairlineWidth,
      maxHeight: '85%',
      padding: spacing.md,
    },
    heading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingBottom: spacing.md,
    },
    headingText: { flex: 1, gap: spacing.xs },
    title: { color: c.textPrimary, fontSize: 20, fontWeight: '700' },
    description: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
    close: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.bgSurface,
    },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 56,
      padding: spacing.md,
      borderRadius: radius.md,
    },
    actionText: { color: c.textPrimary, fontSize: 16, fontWeight: '600' },
    pressed: { backgroundColor: c.bgSurface },
    selected: { backgroundColor: c.bgSurface },
    disabled: { opacity: 0.45 },
  });
