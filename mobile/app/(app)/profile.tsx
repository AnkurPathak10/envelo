import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { colors, radius, spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { updateCurrentUserAvatar } from '@/lib/api/users';
import { useAuth } from '@/lib/auth/AuthContext';
import { pickCompressedImage, uploadImage } from '@/lib/media/upload';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

function profileErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return 'Unable to update your profile photo. Please try again.';
}

export default function ProfileScreen() {
  const { updateUser, user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    </View>
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
      backgroundColor: c.bgBase,
      flex: 1,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl * 2,
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
  });
