import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConversationAvatar } from '@/components/conversations/conversation-avatar';
import { UnreadBadge } from '@/components/conversations/unread-badge';
import { messagingColors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';
import {
  InboxBadgeProvider,
  useInboxBadge,
} from '@/lib/conversations/InboxBadgeContext';
import {
  FriendRequestsProvider,
  useFriendRequests,
} from '@/lib/friends/FriendRequestsContext';
import { useAppColorScheme } from '@/lib/theme/useAppColorScheme';

function TabIcon({ children }: { children: ReactNode }) {
  return <View style={styles.iconContainer}>{children}</View>;
}

function TabNavigator() {
  const scheme = useAppColorScheme();
  const c = messagingColors[scheme];
  const { user } = useAuth();
  const { unreadCount } = useInboxBadge();
  const { requests } = useFriendRequests();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentPrimary,
        tabBarActiveBackgroundColor: c.bgSurface,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarItemStyle: {
          borderRadius: radius.lg,
          marginVertical: spacing.xs,
        },
        tabBarStyle: { backgroundColor: c.bgBase, borderTopColor: c.border },
      }}
    >
      <Tabs.Screen
        name="chats"
        options={({ route }) => ({
          title: 'Chats',
          tabBarStyle:
            getFocusedRouteNameFromRoute(route) &&
            getFocusedRouteNameFromRoute(route) !== 'index'
              ? { display: 'none' }
              : { backgroundColor: c.bgBase, borderTopColor: c.border },
          tabBarIcon: ({ color }) => (
            <TabIcon>
              <MaterialIcons
                color={color}
                name="chat-bubble-outline"
                size={25}
              />
              {unreadCount > 0 ? (
                <View style={styles.badge}>
                  <UnreadBadge count={unreadCount} />
                </View>
              ) : null}
            </TabIcon>
          ),
        })}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <TabIcon>
              <MaterialIcons color={color} name="settings" size={25} />
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={({ route }) => ({
          title: 'Profile',
          tabBarStyle:
            getFocusedRouteNameFromRoute(route) &&
            getFocusedRouteNameFromRoute(route) !== 'index'
              ? { display: 'none' }
              : { backgroundColor: c.bgBase, borderTopColor: c.border },
          tabBarIcon: () => (
            <TabIcon>
              {user ? (
                <ConversationAvatar
                  avatarUrl={user.avatarUrl}
                  name={user.displayName}
                  size={27}
                  userId={user.id}
                />
              ) : null}
              {requests.length > 0 ? (
                <View style={styles.badge}>
                  <UnreadBadge count={requests.length} />
                </View>
              ) : null}
            </TabIcon>
          ),
        })}
      />
    </Tabs>
  );
}

export default function TabsLayout() {
  const { user } = useAuth();
  return (
    <InboxBadgeProvider>
      <FriendRequestsProvider key={user?.id ?? 'signed-out'}>
        <TabNavigator />
      </FriendRequestsProvider>
    </InboxBadgeProvider>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', right: -12, top: -5 },
  iconContainer: {
    alignItems: 'center',
    borderRadius: radius.lg,
    height: 36,
    justifyContent: 'center',
    minWidth: spacing.xl + spacing.lg,
  },
});
