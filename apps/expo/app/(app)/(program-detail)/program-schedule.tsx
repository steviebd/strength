import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { PageLayout } from '@/components/ui/PageLayout';
import { CustomPageHeader } from '@/components/ui/CustomPageHeader';
import {
  Surface,
  Badge,
  SectionTitle,
  MetricTile,
  ActionButton,
} from '@/components/ui/app-primitives';
import {
  useProgramSchedule,
  useStartCycleWorkout,
  useRescheduleWorkout,
  type ProgramScheduleWorkout,
} from '@/hooks/useProgramSchedule';
import { addPendingWorkout } from '@/lib/storage';
import { colors, spacing, radius, typography } from '@/theme';

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDayName(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getStatusBadge(
  workout: ProgramScheduleWorkout | null,
  isRestDay: boolean,
  _isToday: boolean,
): { label: string; tone: 'neutral' | 'orange' | 'emerald' | 'sky' | 'rose' } {
  if (isRestDay) {
    return { label: 'Rest Day', tone: 'neutral' };
  }
  if (!workout) {
    return { label: 'Upcoming', tone: 'sky' };
  }
  switch (workout.status) {
    case 'today':
      return { label: 'Today', tone: 'orange' };
    case 'complete':
      return { label: 'Complete', tone: 'emerald' };
    case 'missed':
      return { label: 'Missed', tone: 'rose' };
    case 'upcoming':
      return { label: 'Upcoming', tone: 'sky' };
    case 'unscheduled':
      return { label: 'Unscheduled', tone: 'neutral' };
    default:
      return { label: 'Upcoming', tone: 'sky' };
  }
}

interface SessionRowProps {
  workout: ProgramScheduleWorkout;
  onStart: (cycleWorkoutId: string) => void;
  onOpen: (workoutId: string, cycleWorkoutId: string) => void;
  onReschedule: (workout: ProgramScheduleWorkout) => void;
  isStarting: boolean;
}

function SessionRow({ workout, onStart, onOpen, onReschedule, isStarting }: SessionRowProps) {
  const badge = getStatusBadge(workout, false, false);
  const canOpen = workout.workoutId != null;
  const isComplete = workout.status === 'complete';

  return (
    <View style={styles.sessionContainer}>
      <View style={styles.sessionHeader}>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionName}>{workout.name}</Text>
          <View style={styles.sessionMeta}>
            <Badge label={badge.label} tone={badge.tone} />
            {workout.scheduledAt ? (
              <Text style={styles.sessionTime}>
                {new Date(workout.scheduledAt).toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}
              </Text>
            ) : null}
          </View>
          {workout.exercises.length > 0 && (
            <Text style={styles.sessionExercises} numberOfLines={1}>
              {workout.exercises.slice(0, 3).join(', ')}
              {workout.exercises.length > 3 ? ` +${workout.exercises.length - 3}` : ''}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.sessionActions}>
        {!isComplete && (
          <ActionButton
            label={isStarting ? 'Starting...' : 'Start'}
            icon="play"
            onPress={() => onStart(workout.cycleWorkoutId)}
            disabled={isStarting}
          />
        )}
        {canOpen && (
          <ActionButton
            label="Open"
            icon="open-outline"
            variant="secondary"
            onPress={() => onOpen(workout.workoutId!, workout.cycleWorkoutId)}
          />
        )}
        {!isComplete && (
          <ActionButton
            label="Reschedule"
            icon="calendar-outline"
            variant="ghost"
            onPress={() => onReschedule(workout)}
          />
        )}
      </View>
    </View>
  );
}

interface RescheduleModalProps {
  visible: boolean;
  workout: ProgramScheduleWorkout | null;
  onClose: () => void;
  onSave: (cycleWorkoutId: string, scheduledAt: number) => void;
  isSaving: boolean;
}

function RescheduleModal({ visible, workout, onClose, onSave, isSaving }: RescheduleModalProps) {
  const [selectedDateOffset, setSelectedDateOffset] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const dateOptions = useMemo(() => {
    const options: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      options.push(d);
    }
    return options;
  }, []);

  useEffect(() => {
    if (!workout?.scheduledAt) {
      setSelectedDateOffset(0);
      setSelectedTime(null);
      return;
    }
    const scheduled = new Date(workout.scheduledAt);
    const scheduledDate = new Date(
      scheduled.getFullYear(),
      scheduled.getMonth(),
      scheduled.getDate(),
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = scheduledDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    setSelectedDateOffset(Math.max(0, Math.min(diffDays, 59)));

    const hours = scheduled.getHours();
    const minutes = scheduled.getMinutes();
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    setSelectedTime(
      ['06:00', '07:00', '08:00', '09:00', '12:00', '17:00', '18:00', '19:00', '20:00'].includes(
        timeStr,
      )
        ? timeStr
        : null,
    );
  }, [workout, visible]);

  const handleSave = () => {
    if (!workout) return;
    const d = dateOptions[selectedDateOffset];
    if (selectedTime) {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      d.setHours(hours, minutes, 0, 0);
    } else {
      d.setHours(0, 0, 0, 0);
    }
    onSave(workout.cycleWorkoutId, d.getTime());
  };

  const handleClose = () => {
    setSelectedDateOffset(0);
    setSelectedTime(null);
    onClose();
  };

  if (!workout) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.modalContainer, { paddingTop: spacing.lg }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Reschedule</Text>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.modalContent}>
          <Text style={styles.modalWorkoutName}>{workout.name}</Text>

          <Text style={styles.modalSectionLabel}>DATE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateScroll}>
            <View style={styles.dateOptions}>
              {dateOptions.map((d, idx) => (
                <Pressable
                  key={`date:${idx}`}
                  style={[
                    styles.dateOption,
                    selectedDateOffset === idx && styles.dateOptionSelected,
                  ]}
                  onPress={() => setSelectedDateOffset(idx)}
                >
                  <Text
                    style={[
                      styles.dateOptionDay,
                      selectedDateOffset === idx && styles.dateOptionDaySelected,
                    ]}
                  >
                    {formatDayName(d)}
                  </Text>
                  <Text
                    style={[
                      styles.dateOptionDate,
                      selectedDateOffset === idx && styles.dateOptionDateSelected,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.modalSectionLabel}>TIME (OPTIONAL)</Text>
          <View style={styles.timeOptions}>
            {['06:00', '07:00', '08:00', '09:00', '12:00', '17:00', '18:00', '19:00', '20:00'].map(
              (t) => (
                <Pressable
                  key={`time:${t}`}
                  style={[styles.timeOption, selectedTime === t && styles.timeOptionSelected]}
                  onPress={() => setSelectedTime(selectedTime === t ? null : t)}
                >
                  <Text
                    style={[
                      styles.timeOptionText,
                      selectedTime === t && styles.timeOptionTextSelected,
                    ]}
                  >
                    {t}
                  </Text>
                </Pressable>
              ),
            )}
          </View>

          <View style={styles.modalActions}>
            <ActionButton
              label={isSaving ? 'Saving...' : 'Save'}
              icon="checkmark"
              onPress={handleSave}
              disabled={isSaving}
            />
            <ActionButton label="Cancel" variant="secondary" onPress={handleClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ProgramScheduleScreen() {
  const router = useRouter();
  useSafeAreaInsets();
  const { cycleId } = useLocalSearchParams<{ cycleId: string }>();

  const { data: schedule, isLoading } = useProgramSchedule(cycleId ?? '');
  const startWorkout = useStartCycleWorkout();
  const rescheduleWorkout = useRescheduleWorkout();

  const [daysToShow, setDaysToShow] = useState(14);
  const [startingWorkoutId, setStartingWorkoutId] = useState<string | null>(null);
  const [rescheduleModalWorkout, setRescheduleModalWorkout] =
    useState<ProgramScheduleWorkout | null>(null);

  const allWorkouts = useMemo(() => {
    if (!schedule) return [];
    return [...schedule.thisWeek, ...schedule.upcoming, ...schedule.completed];
  }, [schedule]);

  const unscheduledWorkouts = useMemo(() => {
    return allWorkouts.filter((w) => w.status === 'unscheduled');
  }, [allWorkouts]);

  const timelineDays = useMemo(() => {
    const days: {
      date: Date;
      isToday: boolean;
      workout: ProgramScheduleWorkout | null;
    }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < daysToShow; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const isToday = i === 0;

      const workout =
        allWorkouts.find((w) => {
          if (!w.scheduledAt) return false;
          const wDate = new Date(w.scheduledAt);
          return isSameDay(wDate, d);
        }) ?? null;

      days.push({ date: d, isToday, workout });
    }
    return days;
  }, [daysToShow, allWorkouts]);

  const completedCount = useMemo(() => {
    return schedule?.completed.length ?? 0;
  }, [schedule?.completed]);

  const remainingCount = useMemo(() => {
    return (
      (schedule?.cycle.totalSessionsPlanned ?? 0) - (schedule?.cycle.totalSessionsCompleted ?? 0)
    );
  }, [schedule?.cycle.totalSessionsPlanned, schedule?.cycle.totalSessionsCompleted]);

  const thisWeekCount = useMemo(() => {
    if (!schedule) return 0;
    const today = new Date();
    const monday = getMondayOfWeek(today);
    const nextMonday = new Date(monday);
    nextMonday.setDate(monday.getDate() + 7);

    return allWorkouts.filter((w) => {
      if (w.status === 'complete' || !w.scheduledAt) return false;
      const d = new Date(w.scheduledAt);
      return d >= monday && d < nextMonday;
    }).length;
  }, [schedule, allWorkouts]);

  const handleStartWorkout = useCallback(
    async (cycleWorkoutId: string) => {
      setStartingWorkoutId(cycleWorkoutId);
      try {
        const result = await startWorkout.mutateAsync(cycleWorkoutId);
        if (result.workoutId) {
          await addPendingWorkout({
            id: result.workoutId,
            name: result.sessionName,
            startedAt: new Date().toISOString(),
            completedAt: null,
            source: 'program',
            programCycleId: cycleId ?? '',
            cycleWorkoutId: cycleWorkoutId,
            exercises: [],
            exerciseCount: 0,
            durationMinutes: null,
            totalVolume: null,
            totalSets: null,
          });
          router.push(
            `/workout-session?workoutId=${result.workoutId}&source=program&cycleId=${cycleId}`,
          );
        }
      } catch {
        // no-op
      } finally {
        setStartingWorkoutId(null);
      }
    },
    [startWorkout, cycleId, router],
  );

  const handleOpenWorkout = useCallback(
    (workoutId: string, _cycleWorkoutId: string) => {
      router.push(`/workout-session?workoutId=${workoutId}&source=program`);
    },
    [router],
  );

  const handleReschedule = useCallback((workout: ProgramScheduleWorkout) => {
    setRescheduleModalWorkout(workout);
  }, []);

  const handleRescheduleSave = useCallback(
    async (cycleWorkoutId: string, scheduledAt: number) => {
      try {
        await rescheduleWorkout.mutateAsync({
          cycleWorkoutId,
          scheduledAt,
        });
        setRescheduleModalWorkout(null);
      } catch {
        // no-op
      }
    },
    [rescheduleWorkout],
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!schedule) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Schedule not found</Text>
      </View>
    );
  }

  return (
    <PageLayout
      headerType="custom"
      header={<CustomPageHeader title={schedule.cycle.name} onBack={() => router.back()} />}
    >
      <View style={styles.metricsRow}>
        <MetricTile label="Completed" value={String(completedCount)} tone="emerald" />
        <MetricTile label="Remaining" value={String(remainingCount)} tone="orange" />
        <MetricTile label="This Week" value={String(thisWeekCount)} tone="sky" />
      </View>

      {unscheduledWorkouts.length > 0 && (
        <>
          <SectionTitle title="Unscheduled" />
          {unscheduledWorkouts.map((workout) => (
            <Surface key={`unsched:${workout.cycleWorkoutId}`} style={styles.dayCard}>
              <SessionRow
                workout={workout}
                onStart={handleStartWorkout}
                onOpen={handleOpenWorkout}
                onReschedule={handleReschedule}
                isStarting={startingWorkoutId === workout.cycleWorkoutId}
              />
            </Surface>
          ))}
        </>
      )}

      <SectionTitle title="Upcoming Schedule" />
      {timelineDays.map((day, idx) => {
        const badge = getStatusBadge(day.workout, !day.workout, day.isToday);
        return (
          <Surface
            key={`day:${idx}`}
            style={{ ...styles.dayCard, ...(day.isToday ? styles.dayCardToday : {}) }}
          >
            <View style={styles.dayHeader}>
              <View style={styles.dayHeaderLeft}>
                <Text style={styles.dayName}>{formatDayName(day.date)}</Text>
                <Text style={styles.dayDate}>{formatDisplayDate(day.date)}</Text>
              </View>
              <Badge label={badge.label} tone={badge.tone} />
            </View>
            {day.workout ? (
              <SessionRow
                workout={day.workout}
                onStart={handleStartWorkout}
                onOpen={handleOpenWorkout}
                onReschedule={handleReschedule}
                isStarting={startingWorkoutId === day.workout.cycleWorkoutId}
              />
            ) : (
              <View style={styles.restDayRow}>
                <Text style={styles.restDayLabel}>Rest Day</Text>
              </View>
            )}
          </Surface>
        );
      })}

      <View style={styles.loadMoreContainer}>
        <ActionButton
          label="Load 14 more days"
          icon="add"
          variant="secondary"
          onPress={() => setDaysToShow((d) => d + 14)}
        />
      </View>

      <View style={{ height: spacing.xxl }} />

      <RescheduleModal
        visible={rescheduleModalWorkout !== null}
        workout={rescheduleModalWorkout}
        onClose={() => setRescheduleModalWorkout(null)}
        onSave={handleRescheduleSave}
        isSaving={rescheduleWorkout.isPending}
      />
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.lg,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dayCard: {
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dayCardToday: {
    borderColor: colors.accentSecondary,
    borderWidth: 1,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  dayHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dayName: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  dayDate: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  sessionContainer: {
    gap: spacing.sm,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  sessionInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  sessionName: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sessionTime: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  sessionExercises: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    marginTop: spacing.xs,
  },
  sessionActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  restDayRow: {
    paddingVertical: spacing.sm,
  },
  restDayLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
  },
  loadMoreContainer: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
  },
  closeButton: {
    padding: spacing.sm,
  },
  modalContent: {
    gap: spacing.lg,
  },
  modalWorkoutName: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
  },
  modalSectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
    letterSpacing: 1.6,
    marginBottom: spacing.sm,
  },
  dateScroll: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  dateOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  dateOption: {
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    minWidth: 56,
  },
  dateOptionSelected: {
    backgroundColor: colors.accent,
  },
  dateOptionDay: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
  },
  dateOptionDaySelected: {
    color: colors.text,
  },
  dateOptionDate: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    marginTop: spacing.xs,
  },
  dateOptionDateSelected: {
    color: colors.text,
  },
  timeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  timeOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  timeOptionSelected: {
    backgroundColor: colors.accent,
  },
  timeOptionText: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  timeOptionTextSelected: {
    color: colors.text,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
