import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import type { ConversationParticipant } from '@/lib/api/conversations';

interface GroupCreationState {
  selectedFriends: ConversationParticipant[];
  reset: () => void;
  toggleFriend: (friend: ConversationParticipant) => void;
  retainFriends: (ids: Set<string>) => void;
}

const GroupCreationContext = createContext<GroupCreationState | null>(null);

export function GroupCreationProvider({ children }: PropsWithChildren) {
  const [selectedFriends, setSelectedFriends] = useState<
    ConversationParticipant[]
  >([]);
  const reset = useCallback(() => setSelectedFriends([]), []);
  const toggleFriend = useCallback(
    (friend: ConversationParticipant) =>
      setSelectedFriends((current) =>
        current.some((item) => item.id === friend.id)
          ? current.filter((item) => item.id !== friend.id)
          : [...current, friend]
      ),
    []
  );
  const retainFriends = useCallback(
    (ids: Set<string>) =>
      setSelectedFriends((current) => {
        const filtered = current.filter((item) => ids.has(item.id));
        return filtered.length === current.length ? current : filtered;
      }),
    []
  );
  const value = useMemo<GroupCreationState>(
    () => ({
      selectedFriends,
      reset,
      toggleFriend,
      retainFriends,
    }),
    [selectedFriends, reset, toggleFriend, retainFriends]
  );
  return (
    <GroupCreationContext.Provider value={value}>
      {children}
    </GroupCreationContext.Provider>
  );
}

export function useGroupCreation(): GroupCreationState {
  const context = useContext(GroupCreationContext);
  if (!context) throw new Error('Group creation must be inside Chats.');
  return context;
}
