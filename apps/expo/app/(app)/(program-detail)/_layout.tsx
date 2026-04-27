import { Stack } from 'expo-router';

export default function ProgramDetailLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // @ts-ignore - hide tab bar for this stack
        tabBarStyle: { display: 'none' },
      }}
    />
  );
}
