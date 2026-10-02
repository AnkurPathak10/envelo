import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { PlatformPressable } from '@react-navigation/elements';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

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
import { useFloatingTabLayout } from '@/lib/navigation/floatingTabs';

function TabIcon({ children }: { children: ReactNode }) {
  return <View style={styles.iconContainer}>{children}</View>;
}

function RoundedTabButton(props: BottomTabBarButtonProps) {
  // The navigator sets radius=0 on the actual button in its default variant.
  // Round that button, not just its outer wrapper, so icon AND label are covered.
  return (
    <PlatformPressable {...props} style={[props.style, styles.tabButton]} />
  );
}

function TabNavigator() {
  const scheme = useAppColorScheme();
  const c = messagingColors[scheme];
  const { user } = useAuth();
  const { unreadCount } = useInboxBadge();
  const { requests } = useFriendRequests();
  const floating = useFloatingTabLayout();
  const tabBarStyle = {
    ...styles.floatingBar,
    backgroundColor: c.bgSurface,
    borderColor: c.border,
    borderRadius: floating.height / 2,
    height: floating.height,
    bottom: floating.bottom,
    left: floating.sideInset,
    right: floating.sideInset,
  };

  return (
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accentPrimary,
        tabBarActiveBackgroundColor: c.bgBase,
        tabBarInactiveTintColor: c.textMuted,
        tabBarButton: RoundedTabButton,
        tabBarLabelPosition: 'below-icon',
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIconStyle: { height: 26 },
        tabBarItemStyle: {
          borderRadius: radius.lg,
          marginHorizontal: 2,
        },
        tabBarStyle,
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
              : tabBarStyle,
          tabBarIcon: ({ color }) => (
            <TabIcon>
              <MaterialIcons
                color={color}
                name="chat-bubble-outline"
                size={22}
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
              <MaterialIcons color={color} name="settings" size={22} />
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
              : tabBarStyle,
          tabBarIcon: () => (
            <TabIcon>
              {user ? (
                <ConversationAvatar
                  avatarUrl={user.avatarUrl}
                  name={user.displayName}
                  size={24}
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
  floatingBar: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
    elevation: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  tabButton: {
    borderRadius: radius.lg + spacing.xs,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  badge: { position: 'absolute', right: -5, top: -3 },
  iconContainer: {
    alignItems: 'center',
    borderRadius: radius.lg,
    height: 26,
    justifyContent: 'center',
    minWidth: 36,
  },
});
