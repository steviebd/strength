import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '@/theme';

interface ActiveWorkoutBannerProps {
  workoutId: string;
  workoutName: string;
  startedAt: string;
  onContinue: () => void;
  onDiscard: () => void;
}

export function ActiveWorkoutBanner({
  workoutId: _workoutId,
  workoutName,
  startedAt,
  onContinue,
  onDiscard,
}: ActiveWorkoutBannerProps) {
  const formatStartedAt = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.eyebrow}>Active Workout</Text>
          <Text style={styles.workoutName} numberOfLines={1}>
            {workoutName}
          </Text>
          <Text style={styles.startedAtText}>Started at {formatStartedAt(startedAt)}</Text>
        </View>
      </View>
      <View style={styles.buttonsRow}>
        <Pressable
          onPress={onContinue}
          style={({ pressed }) => [styles.continueButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </Pressable>
        <Pressable
          onPress={onDiscard}
          style={({ pressed }) => [styles.discardButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.discardButtonText}>Discard</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 24,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239,111,79,0.5)',
    backgroundColor: 'rgba(239,111,79,0.1)',
    padding: spacing.md,
  },
  header: {
    marginBottom: spacing.md,
  },
  headerContent: {
    flex: 1,
  },
  eyebrow: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    color: colors.accent,
  },
  workoutName: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginTop: 4,
  },
  startedAtText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  continueButton: {
    flex: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    paddingVertical: 12,
  },
  continueButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: '#ffffff',
    textAlign: 'center',
  },
  discardButton: {
    flex: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
  },
  discardButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textMuted,
    textAlign: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
});
