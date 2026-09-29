import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import {
  registerPushToken,
  retryPendingPushTokenRemovals,
} from '@/lib/api/push';
import { useAuth } from '@/lib/auth/AuthContext';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function isPushSupported(): boolean {
  return (
    Platform.OS !== 'web' &&
    Device.isDevice &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  );
}

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('friend-requests', {
      name: 'Friend requests',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    }),
  ]);
}

async function registerForPush(
  requestPermission: boolean,
  isCurrent: () => boolean
): Promise<void> {
  await ensureChannels();
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (typeof projectId !== 'string' || !projectId) {
    console.warn('Push registration requires an EAS project ID');
    return;
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (isCurrent()) await registerPushToken(token);
}

export function PushNotifications() {
  const { user } = useAuth();
  const rootNavigationState = useRootNavigationState();
  const handledResponseId = useRef<string | null>(null);
  const userId = user?.id;
  const navigationReady = Boolean(rootNavigationState?.key);

  useEffect(() => {
    const retry = () => {
      void retryPendingPushTokenRemovals().catch((error) => {
        console.warn('Push token removal retry unavailable', error);
      });
    };
    retry();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') retry();
    });
    return () => appState.remove();
  }, []);

  useEffect(() => {
    if (!userId || !isPushSupported()) return;
    let inFlight = false;
    let active = true;
    const register = async (requestPermission: boolean) => {
      if (inFlight) return;
      inFlight = true;
      try {
        await registerForPush(requestPermission, () => active);
      } catch (error) {
        // Permission denial, missing native credentials, or offline registration
        // must not interrupt authentication or messaging.
        console.warn('Push registration unavailable', error);
      } finally {
        inFlight = false;
      }
    };
    void register(true);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void register(false);
    });
    const tokenListener = Notifications.addPushTokenListener(() => {
      void register(false);
    });
    return () => {
      active = false;
      appState.remove();
      tokenListener.remove();
    };
  }, [userId]);

  useEffect(() => {
    if (!navigationReady || !userId || Platform.OS === 'web') return;

    const handle = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)
        return;
      const data = response.notification.request.content.data;
      // Android reuses a notification ID for the whole chat. A later message
      // in that chat must still be tappable after a previous notification tap.
      const id = `${response.notification.request.identifier}:${data?.messageId ?? data?.requestId ?? response.notification.date}`;
      if (handledResponseId.current === id) return;
      handledResponseId.current = id;

      if (data?.recipientUserId === userId) {
        if (data.type === 'friend_request') {
          router.push('/(app)/(tabs)/profile/requests');
        } else if (
          data.type === 'chat_message' &&
          typeof data.conversationId === 'string'
        ) {
          router.push({
            pathname: '/(app)/(tabs)/chats/conversation/[conversationId]',
            params: { conversationId: data.conversationId },
          });
        }
      }
      void Notifications.clearLastNotificationResponseAsync();
    };

    const listener =
      Notifications.addNotificationResponseReceivedListener(handle);
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handle(response);
      })
      .catch((error) => console.warn('Unable to read push response', error));
    return () => listener.remove();
  }, [navigationReady, userId]);

  return null;
}
