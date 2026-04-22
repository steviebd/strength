import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { authClient } from '@/lib/auth-client';
import { colors, radius, spacing, typography } from '@/theme';
import {
  ActionButton,
  Badge,
  MetricTile,
  PageHeader,
  SectionTitle,
  Surface,
} from '@/components/ui/app-primitives';
import { PageLayout } from '@/components/ui/PageLayout';

const today = new Date();
const formattedDate = today.toLocaleDateString('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export default function HomeScreen() {
  const router = useRouter();
  const session = authClient.useSession();
  const user = session.data?.user;
  const displayName = user?.name || user?.email || 'Athlete';
  const avatarLetter = user?.name?.[0] || user?.email?.[0] || '?';

  const nextWorkout = {
    title: 'Upper Body Push',
    focus: 'Bench + overhead press',
    exercises: ['Bench Press', 'Incline Dumbbell Press', 'Cable Flyes', 'Tricep Pushdowns'],
  };

  const weeklyProgress = {
    workoutsCompleted: 4,
    workoutsTarget: 5,
    streakDays: 12,
    totalVolume: '42.5k',
  };

  return (
    <PageLayout
      header={
        <PageHeader
          eyebrow={formattedDate}
          title={`Welcome back, ${displayName}`}
          description="Train hard, recover properly, and keep the numbers moving."
          rightSlot={
            <Pressable style={styles.avatar} onPress={() => router.push('/profile')}>
              <Text style={styles.avatarText}>{avatarLetter}</Text>
            </Pressable>
          }
        />
      }
    >
      <Surface style={styles.workoutCard}>
        <View style={styles.workoutContent}>
          <View style={styles.workoutHeader}>
            <View style={styles.workoutHeaderLeft}>
              <Badge label="Today" tone="orange" />
              <View style={styles.workoutTitleGroup}>
                <Text style={styles.workoutTitle}>{nextWorkout.title}</Text>
                <Text style={styles.workoutFocus}>{nextWorkout.focus}</Text>
              </View>
            </View>
            <View style={styles.workoutIcon}>
              <Ionicons name="barbell-outline" size={24} color="#fdba74" />
            </View>
          </View>

          <View style={styles.exerciseList}>
            {nextWorkout.exercises.map((exercise, index) => (
              <View key={exercise} style={styles.exerciseRow}>
                <View style={styles.exerciseNumber}>
                  <Text style={styles.exerciseNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.exerciseText}>{exercise}</Text>
              </View>
            ))}
          </View>

          <View style={styles.workoutActions}>
            <View style={{ flex: 1 }}>
              <ActionButton
                label="Start Workout"
                icon="play"
                onPress={() => router.push('/(app)/workouts')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ActionButton
                label="Programs"
                icon="layers-outline"
                variant="secondary"
                onPress={() => router.push('/(app)/programs')}
              />
            </View>
          </View>
        </View>
      </Surface>

      <View style={styles.metricsRow}>
        <MetricTile
          label="Workouts"
          value={`${weeklyProgress.workoutsCompleted}/${weeklyProgress.workoutsTarget}`}
          hint="This week"
          tone="orange"
        />
        <MetricTile
          label="Streak"
          value={`${weeklyProgress.streakDays}d`}
          hint="Consistency"
          tone="emerald"
        />
        <MetricTile label="Volume" value={weeklyProgress.totalVolume} hint="Lifted" tone="sky" />
      </View>

      <SectionTitle title="Quick Access" />
      <View style={styles.quickAccessSection}>
        <Surface style={styles.quickAccessCard}>
          <View style={styles.quickAccessRow}>
            <View style={styles.quickAccessContent}>
              <Text style={styles.quickAccessTitle}>Nutrition</Text>
              <Text style={styles.quickAccessDesc}>
                Log meals, track macros, and compare intake against recovery.
              </Text>
            </View>
            <ActionButton
              label="Open"
              icon="restaurant-outline"
              variant="secondary"
              onPress={() => router.push('/(app)/nutrition')}
            />
          </View>
        </Surface>

        <Surface style={styles.quickAccessCard}>
          <View style={styles.quickAccessRow}>
            <View style={styles.quickAccessContent}>
              <Text style={styles.quickAccessTitle}>Templates</Text>
              <Text style={styles.quickAccessDesc}>
                Launch saved sessions fast or build a new training template.
              </Text>
            </View>
            <ActionButton
              label="Manage"
              icon="albums-outline"
              variant="secondary"
              onPress={() => router.push('/(app)/workouts')}
            />
          </View>
        </Surface>
      </View>

      <SectionTitle title="Recovery Snapshot" />
      <Surface style={styles.recoveryCard}>
        <View style={styles.recoveryContent}>
          <View style={styles.recoveryHeader}>
            <Text style={styles.recoveryStatusText}>Current status</Text>
            <Badge label="Ready to train" tone="emerald" />
          </View>
          <View style={styles.recoveryMetrics}>
            <MetricTile label="Sleep" value="7h 48m" hint="Last night" />
            <MetricTile label="Recovery" value="78%" hint="WHOOP synced" tone="emerald" />
          </View>
        </View>
      </Surface>
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  avatar: {
    height: 56,
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  workoutCard: {
    marginBottom: spacing.lg - 4,
  },
  workoutContent: {
    gap: 20,
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  workoutHeaderLeft: {
    flex: 1,
    gap: 12,
  },
  workoutTitleGroup: {
    gap: 8,
  },
  workoutTitle: {
    fontSize: 30,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    lineHeight: 30,
  },
  workoutFocus: {
    fontSize: typography.fontSizes.base,
    color: '#94a3b8',
    lineHeight: 24,
  },
  workoutIcon: {
    borderRadius: 16,
    backgroundColor: 'rgba(251,146,60,0.1)',
    padding: 12,
  },
  exerciseList: {
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: 16,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exerciseNumber: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  exerciseNumberText: {
    fontSize: 14,
    fontWeight: typography.fontWeights.medium,
    color: '#cbd5e1',
  },
  exerciseText: {
    flex: 1,
    fontSize: typography.fontSizes.base,
    color: '#e2e8f0',
  },
  workoutActions: {
    flexDirection: 'row',
    gap: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.lg - 4,
  },
  quickAccessSection: {
    gap: 12,
    marginBottom: spacing.lg - 4,
  },
  quickAccessCard: {
    backgroundColor: 'rgba(24,24,27,0.7)',
  },
  quickAccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  quickAccessContent: {
    flex: 1,
    gap: 4,
  },
  quickAccessTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  quickAccessDesc: {
    fontSize: typography.fontSizes.sm,
    color: '#94a3b8',
    lineHeight: 24,
  },
  recoveryCard: {
    backgroundColor: 'rgba(24,24,27,0.7)',
  },
  recoveryContent: {
    gap: 16,
  },
  recoveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recoveryStatusText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
    color: '#94a3b8',
  },
  recoveryMetrics: {
    flexDirection: 'row',
    gap: 12,
  },
});
