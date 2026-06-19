import { useEffect, useState } from 'react';
import { Dimensions, Platform, useWindowDimensions } from 'react-native';

/**
 * Width for layout breakpoints. On native, uses screen width so opening the
 * keyboard (window resize) does not reflow forms or remount inputs.
 */
export function useLayoutWidth(): number {
  const { width: windowWidth } = useWindowDimensions();
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('screen').width);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const onChange = ({ screen }: { screen: { width: number } }) => {
      setScreenWidth(screen.width);
    };
    const sub = Dimensions.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  if (Platform.OS === 'web') return windowWidth;
  return screenWidth;
}
