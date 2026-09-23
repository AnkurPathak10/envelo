import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import type { PreparedImage } from '@/lib/media/upload';

const WEB_DATABASE_NAME = 'envelo-pending-media-v1';
const WEB_STORE_NAME = 'files';
const NATIVE_DIRECTORY_NAME = 'envelo-pending-media-v1';

function webKey(senderId: string, clientMessageId: string): string {
  return `${senderId}:${clientMessageId}`;
}

function nativeFile(senderId: string, clientMessageId: string): File {
  return new File(
    Paths.document,
    NATIVE_DIRECTORY_NAME,
    encodeURIComponent(senderId),
    `${encodeURIComponent(clientMessageId)}.jpg`
  );
}

function openWebDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new Error('Offline photo storage is unavailable in this browser.')
      );
      return;
    }
    const request = indexedDB.open(WEB_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WEB_STORE_NAME)) {
        request.result.createObjectStore(WEB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function webStoreOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openWebDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(WEB_STORE_NAME, mode);
      const request = operation(transaction.objectStore(WEB_STORE_NAME));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function persistPendingMedia(
  image: PreparedImage,
  senderId: string,
  clientMessageId: string
): Promise<string> {
  if (Platform.OS === 'web') {
    const response = await fetch(image.uri);
    if (!response.ok) throw new Error('Unable to read the selected photo.');
    const key = webKey(senderId, clientMessageId);
    const blob = await response.blob();
    await webStoreOperation('readwrite', (store) => store.put(blob, key));
    return key;
  }

  const destination = nativeFile(senderId, clientMessageId);
  destination.parentDirectory.create({ idempotent: true, intermediates: true });
  try {
    new File(image.uri).copy(destination);
  } catch (error) {
    if (destination.exists) destination.delete();
    throw error;
  }
  return destination.uri;
}

export async function getPendingMediaBlob(localUri: string): Promise<Blob> {
  if (Platform.OS !== 'web') {
    throw new Error('Browser photo storage is unavailable on this platform.');
  }
  const blob = await webStoreOperation<Blob | undefined>('readonly', (store) =>
    store.get(localUri)
  );
  if (!(blob instanceof Blob)) throw new Error('The queued photo is missing.');
  return blob;
}

export async function getPendingMediaPreviewUri(
  localUri: string
): Promise<string> {
  if (Platform.OS !== 'web') return localUri;
  return URL.createObjectURL(await getPendingMediaBlob(localUri));
}

export async function deletePendingMedia(
  senderId: string,
  clientMessageId: string
): Promise<void> {
  if (Platform.OS === 'web') {
    await webStoreOperation('readwrite', (store) =>
      store.delete(webKey(senderId, clientMessageId))
    );
    return;
  }
  const file = nativeFile(senderId, clientMessageId);
  if (file.exists) file.delete();
}
