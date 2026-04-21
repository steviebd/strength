import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

interface TemplateCardProps {
  id: string;
  name: string;
  exerciseCount: number;
  onStart: (templateId: string) => void;
  onEdit: (templateId: string) => void;
}

export function TemplateCard({ id, name, exerciseCount, onStart, onEdit }: TemplateCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Pressable
          onPress={() => onEdit(id)}
          style={({ pressed }) => [styles.editButton, pressed && styles.editButtonPressed]}
        >
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      </View>
      <Text style={styles.exerciseCountText}>{exerciseCount} exercises</Text>
      <Pressable
        onPress={() => onStart(id)}
        style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
      >
        <Text style={styles.startButtonText}>Start Workout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  name: {
    flex: 1,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  editButton: {
    borderRadius: 9999,
    backgroundColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  editButtonPressed: {
    opacity: 0.8,
  },
  editText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
  },
  exerciseCountText: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  startButton: {
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    paddingVertical: 14,
  },
  startButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  startButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: '#ffffff',
    textAlign: 'center',
  },
});
