import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';

type InboxBadgeValue = {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
};

const InboxBadgeContext = createContext<InboxBadgeValue | null>(null);

export function InboxBadgeProvider({ children }: PropsWithChildren) {
  const [unreadCount, setUnreadCount] = useState(0);
  return (
    <InboxBadgeContext.Provider value={{ unreadCount, setUnreadCount }}>
      {children}
    </InboxBadgeContext.Provider>
  );
}

export function useInboxBadge(): InboxBadgeValue {
  const value = useContext(InboxBadgeContext);
  if (!value) throw new Error('InboxBadgeProvider is missing');
  return value;
}
