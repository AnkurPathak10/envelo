import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { ApiError, apiRequest } from '@/lib/api/client';
import { getPendingMediaBlob } from '@/lib/media/pendingMediaStorage';

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.7;
const IMAGE_UPLOAD_TIMEOUT_MS = 60_000;
const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';

interface UploadCredentials {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
}

interface ImageKitUploadResponse {
  url?: string;
}

export interface PreparedImage {
  uri: string;
  fileName: string;
  mimeType: 'image/jpeg';
}

export async function pickCompressedImage(): Promise<PreparedImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is required to choose an image.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 1,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_IMAGE_DIMENSION) {
    if (asset.width >= asset.height) {
      context.resize({ width: MAX_IMAGE_DIMENSION });
    } else {
      context.resize({ height: MAX_IMAGE_DIMENSION });
    }
  }
  const rendered = await context.renderAsync();
  const compressed = await rendered.saveAsync({
    compress: IMAGE_QUALITY,
    format: SaveFormat.JPEG,
  });

  return {
    uri: compressed.uri,
    fileName: `envelo-${Date.now()}.jpg`,
    mimeType: 'image/jpeg',
  };
}

async function uploadErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
  } catch {
    // Fall through to the stable user-facing error below.
  }
  return 'Image upload was rejected. Please try again.';
}

function belongsToEndpoint(url: string, endpointValue: string): boolean {
  try {
    const endpoint = new URL(endpointValue);
    const candidate = new URL(url);
    const endpointPath = endpoint.pathname.replace(/\/+$/, '');
    const assetPathPrefix = `${endpointPath}/`;
    const assetPath = candidate.pathname.slice(assetPathPrefix.length);
    return (
      candidate.protocol === endpoint.protocol &&
      candidate.host === endpoint.host &&
      candidate.pathname.startsWith(assetPathPrefix) &&
      assetPath.split('/').some(Boolean)
    );
  } catch {
    return false;
  }
}

export async function uploadImage(
  image: PreparedImage,
  isQueuedMedia = false
): Promise<string> {
  const credentials = await apiRequest<UploadCredentials>(
    '/api/media/upload-auth'
  );
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const blob = isQueuedMedia
      ? await getPendingMediaBlob(image.uri)
      : await (async () => {
          const fileResponse = await fetch(image.uri);
          if (!fileResponse.ok)
            throw new Error('Unable to read the selected image.');
          return fileResponse.blob();
        })();
    formData.append('file', blob, image.fileName);
  } else {
    formData.append('file', {
      uri: image.uri,
      name: image.fileName,
      type: image.mimeType,
    } as unknown as Blob);
  }
  formData.append('fileName', image.fileName);
  formData.append('publicKey', credentials.publicKey);
  formData.append('token', credentials.token);
  formData.append('expire', String(credentials.expire));
  formData.append('signature', credentials.signature);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_UPLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(IMAGEKIT_UPLOAD_URL, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError(
        'The image upload timed out. Check your connection and try again.',
        0
      );
    }
    throw new ApiError(
      'Unable to upload the image. Check your connection and try again.',
      0
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(await uploadErrorMessage(response));

  const uploaded = (await response.json()) as ImageKitUploadResponse;
  if (
    typeof uploaded.url !== 'string' ||
    !belongsToEndpoint(uploaded.url, credentials.urlEndpoint)
  ) {
    throw new Error('The media service returned an invalid image URL.');
  }
  return uploaded.url;
}
