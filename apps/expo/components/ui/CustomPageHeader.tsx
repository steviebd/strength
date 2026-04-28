import { type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { colors, spacing, typography } from '@/theme';

interface CustomPageHeaderProps {
  title: string;
  onBack?: () => void;
  rightSlot?: ReactNode;
}

export function CustomPageHeader({ title, onBack, rightSlot }: CustomPageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={handleBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={styles.title}>{title}</Text>
      {rightSlot ? rightSlot : <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.lg,
  },
  backButton: {
    padding: spacing.xs,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  spacer: {
    width: 40,
  },
});
