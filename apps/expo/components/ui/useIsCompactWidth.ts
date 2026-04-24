import { useWindowDimensions } from 'react-native';

const COMPACT_WIDTH = 360;

export function useIsCompactWidth(): boolean {
  const { width } = useWindowDimensions();
  return width < COMPACT_WIDTH;
}
