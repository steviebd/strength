import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { colors } from '@/theme';

export function TabIconWithBadge({
  icon,
  hasBadge,
  color,
  focused,
}: {
  icon: { active: string; inactive: string };
  hasBadge?: boolean;
  color: string;
  focused: boolean;
}) {
  return (
    <View style={{ width: 22, height: 22 }}>
      <Ionicons color={color} name={(focused ? icon.active : icon.inactive) as any} size={22} />
      {hasBadge && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.error,
          }}
        />
      )}
    </View>
  );
}
