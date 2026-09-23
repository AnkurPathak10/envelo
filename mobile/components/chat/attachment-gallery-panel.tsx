import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { messagingColors as colors } from '@/constants/theme';
import type { ImageSource } from '@/lib/media/upload';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

interface AttachmentGalleryPanelProps {
  isBusy: boolean;
  onCamera: () => Promise<void>;
  onContact: () => Promise<void>;
  onLocation: () => Promise<void>;
  onOpenSystemPicker: () => Promise<void>;
  onSelectImage: (source: ImageSource) => Promise<void>;
  onUnavailableAction: (label: string) => void;
}

const attachmentTabs = [
  { icon: 'image' as const, label: 'Gallery' },
  { icon: 'insert-drive-file' as const, label: 'File' },
  { icon: 'location-on' as const, label: 'Location' },
  { icon: 'person' as const, label: 'Contact' },
];

export function AttachmentGalleryPanel({
  isBusy,
  onCamera,
  onContact,
  onLocation,
  onOpenSystemPicker,
  onSelectImage,
  onUnavailableAction,
}: AttachmentGalleryPanelProps) {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [isLoading, setIsLoading] = useState(Platform.OS !== 'web');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [libraryUnavailableMessage, setLibraryUnavailableMessage] = useState<
    string | null
  >(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const scheme = useAppColorScheme();
  const c = colors[scheme];
  const styles = createStyles(c);

  const loadAssets = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'web') {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setPermissionDenied(false);
    setLibraryUnavailableMessage(null);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(false, [
        'photo',
      ]);
      if (!permission.granted) {
        setPermissionDenied(true);
        setAssets([]);
        return;
      }
      const page = await MediaLibrary.getAssetsAsync({
        first: 30,
        mediaType: 'photo',
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setAssets([
        ...new Map(page.assets.map((asset) => [asset.id, asset])).values(),
      ]);
    } catch {
      setAssets([]);
      setLibraryUnavailableMessage(
        'Expo Go cannot show an embedded recent-photo grid on this Android version. You can still use the camera or system gallery.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const selectAsset = async (asset: MediaLibrary.Asset): Promise<void> => {
    if (isBusy || selectedAssetId) return;
    setSelectedAssetId(asset.id);
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset, {
        shouldDownloadFromNetwork: true,
      });
      await onSelectImage({
        height: info.height,
        uri: info.localUri ?? info.uri,
        width: info.width,
      });
    } finally {
      setSelectedAssetId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.dragHandle} />
      <View style={styles.galleryArea}>
        {isLoading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator color={c.accentPrimary} />
            <Text style={styles.stateText}>Loading recent photos…</Text>
          </View>
        ) : permissionDenied || libraryUnavailableMessage ? (
          <View style={styles.centeredState}>
            <Text style={styles.stateText}>
              {libraryUnavailableMessage ??
                'Photo permission is needed to show recent photos here.'}
            </Text>
            <View style={styles.fallbackActions}>
              <Pressable
                disabled={isBusy}
                onPress={() => void onCamera()}
                style={styles.fallbackButton}
              >
                <MaterialIcons
                  color={c.textPrimary}
                  name="photo-camera"
                  size={20}
                />
                <Text style={styles.fallbackButtonText}>Camera</Text>
              </Pressable>
              <Pressable
                disabled={isBusy}
                onPress={() => void onOpenSystemPicker()}
                style={styles.systemPickerButton}
              >
                <MaterialIcons color={c.onStateAction} name="image" size={21} />
                <Text style={styles.systemPickerText}>Choose from gallery</Text>
              </Pressable>
            </View>
            {permissionDenied && !libraryUnavailableMessage ? (
              <Pressable onPress={() => void loadAssets()} style={styles.retry}>
                <Text style={styles.retryText}>
                  Try recent-photo access again
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : Platform.OS === 'web' ? (
          <View style={styles.centeredState}>
            <Pressable
              onPress={() => void onOpenSystemPicker()}
              style={styles.systemPickerButton}
            >
              <MaterialIcons color={c.onStateAction} name="image" size={21} />
              <Text style={styles.systemPickerText}>Choose from gallery</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.grid}>
            <Pressable
              accessibilityLabel="Take a photo"
              accessibilityRole="button"
              disabled={isBusy}
              onPress={() => void onCamera()}
              style={({ pressed }) => [
                styles.assetCell,
                styles.cameraCell,
                pressed && styles.assetPressed,
              ]}
            >
              <MaterialIcons
                color={c.textPrimary}
                name="photo-camera"
                size={34}
              />
              <Text style={styles.cameraText}>Camera</Text>
            </Pressable>
            {assets.map((asset) => (
              <Pressable
                accessibilityLabel={`Select ${asset.filename}`}
                accessibilityRole="button"
                disabled={isBusy || selectedAssetId !== null}
                key={asset.id}
                onPress={() => void selectAsset(asset)}
                style={({ pressed }) => [
                  styles.assetCell,
                  pressed && styles.assetPressed,
                ]}
              >
                <Image source={{ uri: asset.uri }} style={styles.assetImage} />
                {selectedAssetId === asset.id ? (
                  <View style={styles.assetLoading}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
              </Pressable>
            ))}
            <Pressable
              accessibilityLabel="Open the full photo library"
              accessibilityRole="button"
              onPress={() => void onOpenSystemPicker()}
              style={[styles.assetCell, styles.moreCell]}
            >
              <MaterialIcons color={c.textMuted} name="more-horiz" size={30} />
              <Text style={styles.moreText}>More</Text>
            </Pressable>
          </ScrollView>
        )}
      </View>

      <View style={styles.tabs}>
        {attachmentTabs.map((tab, index) => {
          const selected = index === 0;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={tab.label}
              onPress={() => {
                if (tab.label === 'Location') {
                  void onLocation();
                } else if (tab.label === 'Contact') {
                  void onContact();
                } else if (tab.label === 'File') {
                  onUnavailableAction('File sharing');
                }
              }}
              style={({ pressed }) => [
                styles.tab,
                pressed && styles.tabPressed,
              ]}
            >
              <MaterialIcons
                color={selected ? c.accentPrimary : c.textMuted}
                name={tab.icon}
                size={24}
              />
              <Text
                style={[styles.tabText, selected && styles.tabTextSelected]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (c: typeof colors.light) =>
  StyleSheet.create({
    assetCell: {
      aspectRatio: 1,
      backgroundColor: c.bgSurface,
      overflow: 'hidden',
      width: '33.3333%',
    },
    assetImage: { height: '100%', width: '100%' },
    assetLoading: {
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.38)',
      bottom: 0,
      justifyContent: 'center',
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    assetPressed: { opacity: 0.7 },
    cameraCell: { alignItems: 'center', justifyContent: 'center' },
    cameraText: { color: c.textPrimary, fontSize: 12, marginTop: 5 },
    centeredState: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      padding: 24,
    },
    container: { maxHeight: 390 },
    dragHandle: {
      alignSelf: 'center',
      backgroundColor: c.textMuted,
      borderRadius: 999,
      height: 4,
      marginVertical: 8,
      opacity: 0.42,
      width: 40,
    },
    fallbackActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
    },
    fallbackButton: {
      alignItems: 'center',
      borderColor: c.border,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 7,
      paddingHorizontal: 15,
      paddingVertical: 10,
    },
    fallbackButtonText: { color: c.textPrimary, fontWeight: '600' },
    galleryArea: { height: 270 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    moreCell: { alignItems: 'center', justifyContent: 'center' },
    moreText: { color: c.textMuted, fontSize: 12, marginTop: 3 },
    retry: { marginTop: 8, padding: 8 },
    retryText: { color: c.accentPrimary, fontWeight: '600' },
    stateText: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
    systemPickerButton: {
      alignItems: 'center',
      backgroundColor: c.accentPrimary,
      borderRadius: 999,
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 11,
    },
    systemPickerText: { color: c.onStateAction, fontWeight: '600' },
    tab: { alignItems: 'center', flex: 1, gap: 3, paddingVertical: 8 },
    tabPressed: { opacity: 0.62 },
    tabText: { color: c.textMuted, fontSize: 11, fontWeight: '500' },
    tabTextSelected: { color: c.accentPrimary },
    tabs: {
      backgroundColor: c.bgSurface,
      flexDirection: 'row',
      paddingBottom: 4,
    },
  });
