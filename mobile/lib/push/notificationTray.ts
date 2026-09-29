import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function dismissChatNotifications(
  userId: string,
  conversationId: string
): Promise<void> {
  if (
    Platform.OS === 'web' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  )
    return;
  const notifications = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    notifications
      .filter(({ request }) => {
        const data = request.content.data;
        return (
          data?.type === 'chat_message' &&
          data.recipientUserId === userId &&
          data.conversationId === conversationId
        );
      })
      .map(({ request }) =>
        Notifications.dismissNotificationAsync(request.identifier)
      )
  );
}
