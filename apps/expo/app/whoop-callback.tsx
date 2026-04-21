import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { View, Text } from 'react-native';
import { colors, typography } from '@/theme';

export default function WhoopCallback() {
  const router = useRouter();

  useEffect(() => {
    WebBrowser.dismissBrowser().catch(() => {});
    router.replace('/(app)/profile');
  }, [router]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <Text style={{ color: colors.text, fontSize: typography.fontSizes.lg }}>
        Connecting WHOOP...
      </Text>
    </View>
  );
}
