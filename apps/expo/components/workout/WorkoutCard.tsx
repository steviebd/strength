import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Surface } from '@/components/ui/app-primitives';
import { colors, spacing, typography } from '@/theme';

type WeightUnit = 'kg' | 'lbs';

const KG_TO_LBS = 2.20462;

interface WorkoutCardProps {
  id: string;
  name: string;
  date: string;
  durationMinutes: number | null;
  totalVolume: number | null;
  exerciseCount: number;
  weightUnit?: WeightUnit;
  isPending?: boolean;
  onDelete?: () => void;
}

export function WorkoutCard({
  id,
  name,
  date,
  durationMinutes,
  totalVolume,
  exerciseCount,
  weightUnit = 'kg',
  isPending,
  onDelete,
}: WorkoutCardProps) {
  const router = useRouter();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '--';
    if (minutes < 60) return `${minutes}m`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  const formatVolume = (volume: number | null) => {
    if (!volume) return '--';
    const displayVolume = weightUnit === 'lbs' ? volume * KG_TO_LBS : volume;
    if (displayVolume >= 1000) return `${(displayVolume / 1000).toFixed(1)}k`;
    return displayVolume.toString();
  };

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/workout-session', params: { workoutId: id } })}
    >
      <Surface style={{ ...styles.surface, ...(isPending ? styles.surfacePending : {}) }}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {name}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.dateText}>{formatDate(date)}</Text>
            <View style={styles.rightActions}>
              {isPending ? <Badge label="Pending" tone="orange" /> : null}
              {onDelete ? (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Duration</Text>
            <Text style={styles.metricValue}>{formatDuration(durationMinutes)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Volume</Text>
            <Text style={styles.metricValue}>
              {formatVolume(totalVolume)} {weightUnit}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Exercises</Text>
            <Text style={styles.metricValue}>{exerciseCount}</Text>
          </View>
        </View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
    gap: spacing.md,
  },
  surfacePending: {
    borderColor: 'rgba(251,146,60,0.4)',
    borderStyle: 'dashed',
  },
  header: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rightActions: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  dateText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  deleteButton: {
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.2)',
    backgroundColor: 'rgba(251,113,133,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.error,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricCard: {
    minWidth: 96,
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metricLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  metricValue: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginTop: 4,
  },
});
