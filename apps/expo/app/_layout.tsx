import { Stack } from 'expo-router';
import { AuthProvider } from '@/lib/auth-context';
import '@/global.css';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack />
    </AuthProvider>
  );
}
