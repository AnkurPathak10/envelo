import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

interface ImageViewerModalProps {
  imageUrl: string;
  onClose: () => void;
  visible: boolean;
}

export function ImageViewerModal({
  imageUrl,
  onClose,
  visible,
}: ImageViewerModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const scheme = useAppColorScheme();
  const c = colors[scheme];

  useEffect(() => setIsLoading(true), [imageUrl, visible]);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
        <Pressable
          accessibilityLabel="Close image viewer"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.backdrop}
        >
          {isLoading ? (
            <ActivityIndicator
              color={c.onAccent}
              size="large"
              style={styles.loading}
            />
          ) : null}
          <Image
            onLoadEnd={() => setIsLoading(false)}
            resizeMode="contain"
            source={{ uri: imageUrl }}
            style={styles.image}
          />
        </Pressable>
        <Pressable
          accessibilityLabel="Close image viewer"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.closeButton}
        >
          <MaterialIcons color={c.onAccent} name="close" size={28} />
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
    width: 44,
    zIndex: 2,
  },
  container: { backgroundColor: 'rgba(0, 0, 0, 0.94)', flex: 1 },
  image: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loading: { zIndex: 1 },
});
