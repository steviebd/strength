import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { colors, radius, spacing, typography, textRoles } from '@/theme';
import { Button } from '@/components/ui/Button';
import {
  Badge,
  MetricTile,
  PageHeader,
  SectionTitle,
  Surface,
} from '@/components/ui/app-primitives';
import { PageLayout } from '@/components/ui/PageLayout';
import { useHomeSummary } from '@/hooks/useHomeSummary';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { createLocalWorkoutFromProgramCycleWorkout } from '@/db/workouts';

export default function HomeScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const session = authClient.useSession();
  const user = session.data?.user;
  const displayName = user?.name || user?.email || 'Athlete';
  const avatarLetter = user?.name?.[0] || user?.email?.[0] || '?';
  const { activeTimezone } = useUserPreferences();
  const { data: homeData } = useHomeSummary();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ focusProgramId?: string }>();

  useFocusEffect(
    useCallback(() => {
      void queryClient.refetchQueries({ queryKey: ['homeSummary', activeTimezone] });
    }, [activeTimezone, queryClient]),
  );

  useEffect(() => {
    if (params.focusProgramId && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: 0, animated: true });
    }
  }, [params.focusProgramId]);

  const formattedDate =
    homeData?.date.formatted ??
    new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

  const weeklyProgress = homeData?.weeklyStats ?? {
    workoutsCompleted: 0,
    workoutsTarget: 0,
    streakDays: 0,
    totalVolume: 0,
    totalVolumeLabel: '0',
  };

  const workout = homeData?.todayWorkout?.workout;
  const nextWorkout = homeData?.todayWorkout?.nextWorkout;
  const isRestDay = homeData?.todayWorkout?.isRestDay ?? false;
  const hasActiveProgram = homeData?.todayWorkout?.hasActiveProgram ?? false;
  const startableCycleWorkoutId = workout?.cycleWorkoutId ?? nextWorkout?.cycleWorkoutId ?? null;
  const workoutTitle = workout?.programName ?? nextWorkout?.programName ?? 'No Active Program';
  const workoutSubtitle = workout?.name ?? (nextWorkout ? `Next: ${nextWorkout.name}` : null);

  const handleStartWorkout = async () => {
    if (!startableCycleWorkoutId) {
      router.push('/(app)/workouts');
      return;
    }

    try {
      if (user?.id) {
        const local = await createLocalWorkoutFromProgramCycleWorkout(
          user.id,
          startableCycleWorkoutId,
        );
        if (local?.id) {
          router.push(`/workout-session?workoutId=${local.id}&source=program`);
          return;
        }
      }
      const result = await apiFetch<{
        workoutId: string;
        sessionName: string;
        created: boolean;
        completed: boolean;
      }>(`/api/programs/cycle-workouts/${startableCycleWorkoutId}/start`, {
        method: 'POST',
        body: {},
      });

      if (result.completed) {
        Alert.alert('Already Completed', 'This workout has already been completed.');
        return;
      }

      router.push(`/workout-session?workoutId=${result.workoutId}&source=program`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start workout');
    }
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['homeSummary', activeTimezone] });
    setIsRefreshing(false);
  }, [activeTimezone]);

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
      scrollViewRef={scrollViewRef}
      screenScrollViewProps={{
        refreshControl: (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentSecondary}
          />
        ),
      }}
    >
      <Surface style={styles.workoutCard}>
        <View style={styles.workoutContent}>
          <View style={styles.workoutHeader}>
            <View style={styles.workoutHeaderLeft}>
              {isRestDay ? (
                <Badge label="Rest Day" tone="emerald" />
              ) : (
                <Badge label="Today" tone="orange" />
              )}
              <View style={styles.workoutTitleGroup}>
                <Text style={styles.workoutTitle} numberOfLines={1} ellipsizeMode="tail">
                  {workoutTitle}
                </Text>
                {workoutSubtitle && (
                  <Text style={styles.workoutSubtitle} numberOfLines={2} ellipsizeMode="tail">
                    {workoutSubtitle}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.workoutIcon}>
              <Ionicons
                name={isRestDay ? 'moon-outline' : 'barbell-outline'}
                size={24}
                color={isRestDay ? '#6ee7b7' : '#fdba74'}
              />
            </View>
          </View>

          {!isRestDay && workout?.exercises && workout.exercises.length > 0 && (
            <View style={styles.exerciseList}>
              {workout.exercises.map((exercise, index) => (
                <View key={`${exercise.name}-${index}`} style={styles.exerciseRow}>
                  <View style={styles.exerciseNumber}>
                    <Text style={styles.exerciseNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.exerciseText}>
                    {exercise.name}
                    {exercise.count > 1 ? ` x${exercise.count}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.workoutActions}>
            <View style={{ flex: 1 }}>
              {hasActiveProgram ? (
                <Button
                  label={
                    workout?.isComplete ? 'Completed' : isRestDay ? 'Start Next' : 'Start Workout'
                  }
                  icon={workout?.isComplete ? 'checkmark' : 'play'}
                  onPress={handleStartWorkout}
                  disabled={workout?.isComplete}
                />
              ) : (
                <Button
                  label="Start Workout"
                  icon="play"
                  onPress={() => router.push('/(app)/workouts')}
                />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Button
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
        <MetricTile
          label="Volume"
          value={weeklyProgress.totalVolumeLabel}
          hint="Lifted"
          tone="sky"
        />
      </View>

      <SectionTitle title="Quick Access" />
      <View style={styles.quickAccessSection}>
        <Pressable
          onPress={() => router.push('/nutrition?focusChat=1')}
          style={({ pressed }) => [pressed ? styles.quickAccessPressed : undefined]}
        >
          <Surface style={styles.quickAccessCard}>
            <View style={styles.quickAccessRow}>
              <View style={styles.quickAccessContent}>
                <Text style={styles.quickAccessTitle}>Nutrition</Text>
                <Text style={styles.quickAccessDesc}>
                  Log meals, track macros, and compare intake against recovery.
                </Text>
              </View>
              <Button
                label="Open"
                icon="restaurant-outline"
                variant="secondary"
                onPress={() => router.push('/nutrition?focusChat=1')}
              />
            </View>
          </Surface>
        </Pressable>

        <Surface style={styles.quickAccessCard}>
          <View style={styles.quickAccessRow}>
            <View style={styles.quickAccessContent}>
              <Text style={styles.quickAccessTitle}>Templates</Text>
              <Text style={styles.quickAccessDesc}>
                Launch saved sessions fast or build a new training template.
              </Text>
            </View>
            <Button
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
            {homeData?.recoverySnapshot?.isWhoopConnected ? (
              <Badge
                label={
                  homeData.recoverySnapshot.recoveryStatus === 'green'
                    ? 'Ready to train'
                    : homeData.recoverySnapshot.recoveryStatus === 'yellow'
                      ? 'Moderate'
                      : 'Needs recovery'
                }
                tone={
                  homeData.recoverySnapshot.recoveryStatus === 'green'
                    ? 'emerald'
                    : homeData.recoverySnapshot.recoveryStatus === 'yellow'
                      ? 'orange'
                      : 'rose'
                }
              />
            ) : (
              <Badge label="WHOOP disconnected" tone="neutral" />
            )}
          </View>
          <View style={styles.recoveryMetrics}>
            {homeData?.recoverySnapshot?.isWhoopConnected ? (
              <>
                <MetricTile
                  label="Sleep"
                  value={homeData.recoverySnapshot.sleepDurationLabel ?? '--'}
                  hint="Last night"
                />
                <MetricTile
                  label="Recovery"
                  value={
                    homeData.recoverySnapshot.recoveryScore !== null
                      ? `${homeData.recoverySnapshot.recoveryScore}%`
                      : '--'
                  }
                  hint="WHOOP synced"
                  tone={
                    homeData.recoverySnapshot.recoveryStatus === 'green'
                      ? 'emerald'
                      : homeData.recoverySnapshot.recoveryStatus === 'yellow'
                        ? 'orange'
                        : 'rose'
                  }
                />
              </>
            ) : (
              <>
                <MetricTile label="Sleep" value="--" hint="No data" />
                <MetricTile label="Recovery" value="--" hint="Connect WHOOP" />
              </>
            )}
          </View>
        </View>
      </Surface>

      <View style={styles.legalFooter}>
        <Pressable onPress={() => router.push('/privacy')}>
          <Text style={styles.legalFooterText}>Privacy Policy</Text>
        </Pressable>
        <Text style={styles.legalFooterDot}>·</Text>
        <Pressable onPress={() => router.push('/terms')}>
          <Text style={styles.legalFooterText}>Terms of Service</Text>
        </Pressable>
      </View>
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
    fontSize: textRoles.screenTitle.fontSize,
    fontWeight: textRoles.screenTitle.fontWeight,
    color: colors.text,
    lineHeight: textRoles.screenTitle.lineHeight,
  },
  workoutSubtitle: {
    fontSize: 18,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    lineHeight: 24,
  },
  workoutFocus: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    lineHeight: 24,
  },
  workoutIcon: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(251,146,60,0.1)',
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
    color: colors.textMuted,
  },
  exerciseText: {
    flex: 1,
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
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
  quickAccessCard: {},
  quickAccessPressed: {
    opacity: 0.82,
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
    color: colors.textMuted,
    lineHeight: 24,
  },
  recoveryCard: {},
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
    color: colors.textMuted,
  },
  recoveryMetrics: {
    flexDirection: 'row',
    gap: 12,
  },
  legalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  legalFooterText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  legalFooterDot: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
});
