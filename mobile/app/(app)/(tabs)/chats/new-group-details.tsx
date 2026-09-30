import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExpressionPicker } from '@/components/chat/expression-picker';
import { messagingColors as colors, radius, spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { createGroupConversation } from '@/lib/api/conversations';
import { useGroupCreation } from '@/lib/groups/GroupCreationContext';
import {
  pickCompressedImage,
  uploadImage,
  type PreparedImage,
} from '@/lib/media/upload';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

function errorText(error: unknown): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : 'Unable to create the group. Please try again.';
}

export default function NewGroupDetailsScreen() {
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);
  const { selectedFriends, reset } = useGroupCreation();
  const [name, setName] = useState('');
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const photoBusyRef = useRef(false);

  const choosePhoto = useCallback(async () => {
    if (photoBusyRef.current || creatingRef.current || isCreating) return;
    photoBusyRef.current = true;
    setIsUploading(true);
    setError(null);
    try {
      const picked = await pickCompressedImage();
      if (!picked) return;
      setImage(picked);
      setPhotoUrl(null);
      try {
        setPhotoUrl(await uploadImage(picked));
      } catch (caught) {
        setError(
          `Photo upload failed: ${errorText(caught)} Tap Create to retry.`
        );
      }
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      photoBusyRef.current = false;
      setIsUploading(false);
    }
  }, [isCreating]);

  const create = useCallback(async () => {
    if (creatingRef.current || photoBusyRef.current || isUploading) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter a group name to continue.');
      return;
    }
    if (selectedFriends.length === 0) {
      setError('Select at least one friend first.');
      return;
    }
    creatingRef.current = true;
    setIsCreating(true);
    setError(null);
    let createRequestStarted = false;
    try {
      let uploadedPhoto = photoUrl;
      if (image && !uploadedPhoto) {
        setIsUploading(true);
        uploadedPhoto = await uploadImage(image);
        setPhotoUrl(uploadedPhoto);
        setIsUploading(false);
      }
      createRequestStarted = true;
      const group = await createGroupConversation(
        trimmedName,
        selectedFriends.map((friend) => friend.id),
        uploadedPhoto ?? undefined
      );
      reset();
      router.dismissAll();
      requestAnimationFrame(() =>
        router.push({
          pathname: '/(app)/(tabs)/chats/conversation/[conversationId]',
          params: {
            conversationId: group.id,
            conversationType: 'GROUP',
            groupName: group.name,
            groupPhotoUrl: group.photoUrl ?? '',
          },
        })
      );
    } catch (caught) {
      setError(
        createRequestStarted &&
          caught instanceof ApiError &&
          caught.status === 0
          ? 'Connection lost. The group may have been created; check Chats before trying again.'
          : errorText(caught)
      );
    } finally {
      creatingRef.current = false;
      setIsUploading(false);
      setIsCreating(false);
    }
  }, [image, isUploading, name, photoUrl, reset, selectedFriends]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        style={styles.formScroll}
      >
        <Pressable
          accessibilityLabel="Choose group photo"
          accessibilityRole="button"
          disabled={isUploading || isCreating}
          onPress={() => void choosePhoto()}
          style={styles.photoButton}
        >
          {image ? (
            <Image source={{ uri: image.uri }} style={styles.photo} />
          ) : (
            <MaterialIcons
              color={c.accentPrimary}
              name="photo-camera"
              size={35}
            />
          )}
          {isUploading ? (
            <View style={styles.photoOverlay}>
              <ActivityIndicator color={c.onAccent} />
            </View>
          ) : null}
        </Pressable>
        <Text style={styles.photoHint}>
          {isUploading
            ? 'Uploading photo…'
            : image
              ? 'Change group photo'
              : 'Add group photo (optional)'}
        </Text>

        <View style={styles.nameRow}>
          <TextInput
            accessibilityLabel="Group name"
            autoFocus
            maxLength={100}
            onChangeText={(text) => {
              setName(text);
              setError(null);
            }}
            placeholder="Group name"
            placeholderTextColor={c.textMuted}
            returnKeyType="done"
            style={styles.input}
            value={name}
          />
          <Pressable
            accessibilityLabel="Choose emoji for group name"
            accessibilityRole="button"
            accessibilityState={{ expanded: emojiOpen }}
            onPress={() => setEmojiOpen((open) => !open)}
            style={styles.emojiButton}
          >
            <MaterialIcons
              color={c.accentPrimary}
              name="emoji-emotions"
              size={26}
            />
          </Pressable>
        </View>
        <Text style={styles.members}>
          {selectedFriends.length}{' '}
          {selectedFriends.length === 1 ? 'member' : 'members'} selected
        </Text>
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
      {emojiOpen ? (
        <ExpressionPicker
          emojiOnly
          onInsertEmoji={(emoji) =>
            setName((current) =>
              current.length + emoji.length <= 100
                ? `${current}${emoji}`
                : current
            )
          }
          onSelectGif={async () => undefined}
        />
      ) : null}
      <View style={styles.footer}>
        <Pressable
          accessibilityLabel="Create group"
          accessibilityRole="button"
          accessibilityState={{
            disabled: isCreating || isUploading || selectedFriends.length === 0,
          }}
          disabled={isCreating || isUploading || selectedFriends.length === 0}
          onPress={() => void create()}
          style={({ pressed }) => [
            styles.create,
            (isCreating || isUploading || selectedFriends.length === 0) &&
              styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {isCreating ? (
            <ActivityIndicator color={c.onAccent} />
          ) : (
            <MaterialIcons color={c.onAccent} name="check" size={28} />
          )}
          <Text style={styles.createText}>
            {isCreating ? 'Creating…' : 'Create group'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    content: { alignItems: 'center', flexGrow: 1, padding: spacing.lg },
    create: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: radius.md,
      flexDirection: 'row',
      gap: spacing.sm,
      justifyContent: 'center',
      minHeight: 54,
      paddingHorizontal: spacing.lg,
    },
    createText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
    disabled: { opacity: 0.5 },
    emojiButton: {
      alignItems: 'center',
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    error: {
      color: c.error,
      lineHeight: 20,
      marginTop: spacing.md,
      textAlign: 'center',
    },
    footer: { padding: spacing.lg },
    formScroll: { flex: 1 },
    input: { color: c.textPrimary, flex: 1, fontSize: 18, padding: spacing.sm },
    members: {
      alignSelf: 'flex-start',
      color: c.textMuted,
      marginTop: spacing.lg,
    },
    nameRow: {
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      marginTop: spacing.xl,
      paddingHorizontal: spacing.sm,
    },
    photo: { height: '100%', width: '100%' },
    photoButton: {
      alignItems: 'center',
      backgroundColor: c.bgSurface,
      borderColor: c.border,
      borderRadius: 54,
      borderWidth: 1,
      height: 108,
      justifyContent: 'center',
      overflow: 'hidden',
      width: 108,
    },
    photoHint: { color: c.textMuted, fontSize: 14, marginTop: spacing.sm },
    photoOverlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.4)',
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
    },
    pressed: { opacity: 0.75 },
    screen: { backgroundColor: c.bgBase, flex: 1 },
  });
