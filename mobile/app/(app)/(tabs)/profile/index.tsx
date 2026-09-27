import { useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { colors, radius, spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { updateCurrentUserAvatar } from '@/lib/api/users';
import { useAuth } from '@/lib/auth/AuthContext';
import { pickCompressedImage, uploadImage } from '@/lib/media/upload';
import { useFriendRequests } from '@/lib/friends/FriendRequestsContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

function profileErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Unable to update your profile photo. Please try again.';
}

export default function ProfileScreen() {
  const { updateUser, user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { requests } = useFriendRequests();
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  if (!user) return null;

  const choosePhoto = async (): Promise<void> => {
    if (isUploading) return;
    setErrorMessage(null);

    try {
      const image = await pickCompressedImage();
      if (!image) return;
      setIsUploading(true);
      const avatarUrl = await uploadImage(image);
      const updatedUser = await updateCurrentUserAvatar(avatarUrl);
      await updateUser(updatedUser);
    } catch (error: unknown) {
      setErrorMessage(profileErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <Text style={styles.title}>Profile</Text>
      <View style={styles.container}>
        <ConversationAvatar
          avatarUrl={user.avatarUrl}
          name={user.displayName}
          size={128}
          userId={user.id}
        />
        <Text style={styles.name}>{user.displayName}</Text>
        <Text style={styles.email}>{user.email}</Text>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={isUploading}
          onPress={() => void choosePhoto()}
          style={({ pressed }) => [
            styles.button,
            isUploading && styles.buttonDisabled,
            pressed && !isUploading && styles.buttonPressed,
          ]}
        >
          {isUploading ? (
            <ActivityIndicator color={c.onAccent} />
          ) : (
            <Text style={styles.buttonText}>
              {user.avatarUrl ? 'Replace photo' : 'Choose photo'}
            </Text>
          )}
        </Pressable>
        <View style={styles.links}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/(tabs)/profile/friends')}
            style={({ pressed }) => [
              styles.link,
              pressed && styles.linkPressed,
            ]}
          >
            <MaterialIcons
              color={c.accentPrimary}
              name="people-outline"
              size={23}
            />
            <Text style={styles.linkText}>Friends</Text>
            <MaterialIcons color={c.textMuted} name="chevron-right" size={22} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/(tabs)/profile/requests')}
            style={({ pressed }) => [
              styles.link,
              pressed && styles.linkPressed,
            ]}
          >
            <MaterialIcons
              color={c.accentPrimary}
              name="person-add-alt"
              size={23}
            />
            <Text style={styles.linkText}>Friend requests</Text>
            {requests.length > 0 ? (
              <Text style={styles.requestCount}>
                {requests.length > 99 ? '99+' : requests.length}
              </Text>
            ) : null}
            <MaterialIcons color={c.textMuted} name="chevron-right" size={22} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    button: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: radius.sm,
      marginTop: spacing.lg,
      minWidth: 160,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    buttonDisabled: { opacity: 0.65 },
    buttonPressed: { opacity: 0.8 },
    buttonText: { color: c.onAccent, fontSize: 15, fontWeight: '700' },
    container: {
      alignItems: 'center',
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl,
    },
    email: { color: c.textMuted, fontSize: 15, marginTop: spacing.xs },
    error: {
      color: c.error,
      fontSize: 14,
      lineHeight: 20,
      marginTop: spacing.lg,
      textAlign: 'center',
    },
    name: {
      color: c.textPrimary,
      fontSize: 24,
      fontWeight: '700',
      marginTop: spacing.lg,
    },
    links: { alignSelf: 'stretch', marginTop: spacing.xl },
    link: {
      alignItems: 'center',
      borderBottomColor: c.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 58,
      paddingHorizontal: spacing.sm,
    },
    linkPressed: { backgroundColor: c.bgSurface },
    linkText: {
      color: c.textPrimary,
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
    },
    requestCount: { color: c.accentPrimary, fontSize: 14, fontWeight: '700' },
    screen: { backgroundColor: c.bgBase, flex: 1 },
    title: {
      color: c.textPrimary,
      fontSize: 28,
      fontWeight: '700',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
  });
