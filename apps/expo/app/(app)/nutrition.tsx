import { View, Text } from 'react-native';

export default function Nutrition() {
  return (
    <View className="flex-1 items-center justify-center bg-darkBg">
      <Text className="text-darkText text-xl">Nutrition Screen</Text>
      <Text className="text-darkMuted mt-2">Track your meals and macros</Text>
    </View>
  );
}
