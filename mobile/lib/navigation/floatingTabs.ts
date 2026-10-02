import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Keep footer placement and screen/FAB clearance in sync on every tab.
export function getFloatingTabLayout(
  width: number,
  bottomInset: number,
  fontScale = 1
) {
  const sideInset = Math.max(20, (width - 360) / 2);
  const height = 64 + Math.ceil(Math.max(0, fontScale - 1) * 16);
  const bottom = bottomInset + 12;
  return {
    sideInset,
    height,
    bottom,
    contentBottom: bottom + height + 16,
    composeBottom: bottom + height + 16,
  };
}

export function useFloatingTabLayout() {
  const { width, fontScale } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  return getFloatingTabLayout(width, bottom, fontScale);
}
