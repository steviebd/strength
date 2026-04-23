import { useState, useMemo, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
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

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
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

interface DaySchedule {
  date: Date;
  workout: ProgramScheduleWorkout | null;
  isRestDay: boolean;
  isToday: boolean;
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

  return (
    <Surface style={styles.sessionSurface}>
      <View style={styles.sessionHeader}>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionName}>{workout.name}</Text>
          <View style={styles.sessionMeta}>
            <Badge label={badge.label} tone={badge.tone} />
            {workout.scheduledTime ? (
              <Text style={styles.sessionTime}>{workout.scheduledTime}</Text>
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
        <ActionButton
          label={isStarting ? 'Starting...' : 'Start'}
          icon="play"
          onPress={() => onStart(workout.cycleWorkoutId)}
          disabled={isStarting}
        />
        {canOpen && (
          <ActionButton
            label="Open"
            icon="open-outline"
            variant="secondary"
            onPress={() => onOpen(workout.workoutId!, workout.cycleWorkoutId)}
          />
        )}
        <ActionButton
          label="Reschedule"
          icon="calendar-outline"
          variant="ghost"
          onPress={() => onReschedule(workout)}
        />
      </View>
    </Surface>
  );
}

interface RestDayRowProps {
  date: Date;
}

function RestDayRow({ date }: RestDayRowProps) {
  return (
    <Surface style={styles.restDaySurface}>
      <View style={styles.restDayContent}>
        <Text style={styles.restDayLabel}>Rest Day</Text>
        <Text style={styles.restDayDate}>{formatDisplayDate(date)}</Text>
      </View>
      <Badge label="Rest Day" tone="neutral" />
    </Surface>
  );
}

interface RescheduleModalProps {
  visible: boolean;
  workout: ProgramScheduleWorkout | null;
  onClose: () => void;
  onSave: (cycleWorkoutId: string, date: string, time: string | null) => void;
  isSaving: boolean;
}

function RescheduleModal({ visible, workout, onClose, onSave, isSaving }: RescheduleModalProps) {
  const [selectedDateOffset, setSelectedDateOffset] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const dateOptions = useMemo(() => {
    const options: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      options.push(d);
    }
    return options;
  }, []);

  const handleSave = () => {
    if (!workout) return;
    const d = dateOptions[selectedDateOffset];
    const dateStr = formatDate(d);
    onSave(workout.cycleWorkoutId, dateStr, selectedTime);
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

  const [displayWeekStart, setDisplayWeekStart] = useState<Date>(() => getMondayOfWeek(new Date()));
  const [startingWorkoutId, setStartingWorkoutId] = useState<string | null>(null);
  const [rescheduleModalWorkout, setRescheduleModalWorkout] =
    useState<ProgramScheduleWorkout | null>(null);

  const goToPreviousWeek = useCallback(() => {
    setDisplayWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);

  const goToNextWeek = useCallback(() => {
    setDisplayWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, []);

  const goToToday = useCallback(() => {
    setDisplayWeekStart(getMondayOfWeek(new Date()));
  }, []);

  const weekDays = useMemo<DaySchedule[]>(() => {
    const days: DaySchedule[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(displayWeekStart);
      d.setDate(d.getDate() + i);
      const isToday = isSameDay(d, today);

      const matchingWorkout = schedule?.thisWeek.find((w) => {
        if (!w.scheduledDate) return false;
        const wDate = new Date(w.scheduledDate);
        return isSameDay(wDate, d);
      });

      days.push({
        date: d,
        workout: matchingWorkout ?? null,
        isRestDay: false,
        isToday,
      });
    }
    return days;
  }, [displayWeekStart, schedule?.thisWeek]);

  const allWeekWorkouts = useMemo(() => {
    return weekDays.map((d) => d.workout).filter((w): w is ProgramScheduleWorkout => w !== null);
  }, [weekDays]);

  const completedCount = useMemo(() => {
    return schedule?.completed.length ?? 0;
  }, [schedule?.completed]);

  const remainingCount = useMemo(() => {
    return (
      (schedule?.cycle.totalSessionsPlanned ?? 0) - (schedule?.cycle.totalSessionsCompleted ?? 0)
    );
  }, [schedule?.cycle.totalSessionsPlanned, schedule?.cycle.totalSessionsCompleted]);

  const thisWeekWorkouts = useMemo(() => {
    return allWeekWorkouts.filter((w) => w.status !== 'complete');
  }, [allWeekWorkouts]);

  const upcomingWorkouts = useMemo(() => {
    return schedule?.upcoming ?? [];
  }, [schedule?.upcoming]);

  const completedWorkouts = useMemo(() => {
    return schedule?.completed ?? [];
  }, [schedule?.completed]);

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
            cycleWorkoutId: result.workoutId,
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
      } catch (err) {
        console.error('Failed to start workout:', err);
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
    async (cycleWorkoutId: string, date: string, time: string | null) => {
      try {
        await rescheduleWorkout.mutateAsync({
          cycleWorkoutId,
          scheduledDate: date,
          scheduledTime: time,
        });
        setRescheduleModalWorkout(null);
      } catch (err) {
        console.error('Failed to reschedule workout:', err);
      }
    },
    [rescheduleWorkout],
  );

  const weekRangeLabel = useMemo(() => {
    const start = displayWeekStart;
    const end = new Date(displayWeekStart);
    end.setDate(end.getDate() + 6);
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${startStr} - ${endStr}`;
  }, [displayWeekStart]);

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
        <MetricTile label="This Week" value={String(thisWeekWorkouts.length)} tone="sky" />
      </View>

      <View style={styles.weekNavigation}>
        <Pressable onPress={goToPreviousWeek} style={styles.navButton}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Pressable onPress={goToToday} style={styles.todayButton}>
          <Text style={styles.todayButtonText}>Today</Text>
        </Pressable>
        <Text style={styles.weekRange}>{weekRangeLabel}</Text>
        <Pressable onPress={goToNextWeek} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.weekGrid}>
        {weekDays.map((day, idx) => {
          return (
            <Surface
              key={`day:${idx}`}
              style={{ ...styles.dayCard, ...(day.isToday ? styles.dayCardToday : {}) }}
            >
              <View style={styles.dayHeader}>
                <Text style={styles.dayName}>{formatDayName(day.date)}</Text>
                <Text style={styles.dayDate}>{formatDisplayDate(day.date)}</Text>
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
                <RestDayRow date={day.date} />
              )}
            </Surface>
          );
        })}
      </View>

      {thisWeekWorkouts.length > 0 && (
        <>
          <SectionTitle title="This Week" />
          {thisWeekWorkouts.map((workout) => (
            <SessionRow
              key={`tw:${workout.cycleWorkoutId}`}
              workout={workout}
              onStart={handleStartWorkout}
              onOpen={handleOpenWorkout}
              onReschedule={handleReschedule}
              isStarting={startingWorkoutId === workout.cycleWorkoutId}
            />
          ))}
        </>
      )}

      {upcomingWorkouts.length > 0 && (
        <>
          <SectionTitle title="Upcoming" />
          {upcomingWorkouts.map((workout) => (
            <SessionRow
              key={`up:${workout.cycleWorkoutId}`}
              workout={workout}
              onStart={handleStartWorkout}
              onOpen={handleOpenWorkout}
              onReschedule={handleReschedule}
              isStarting={startingWorkoutId === workout.cycleWorkoutId}
            />
          ))}
        </>
      )}

      {completedWorkouts.length > 0 && (
        <>
          <SectionTitle title="Completed" />
          {completedWorkouts.map((workout) => (
            <SessionRow
              key={`comp:${workout.cycleWorkoutId}`}
              workout={workout}
              onStart={handleStartWorkout}
              onOpen={handleOpenWorkout}
              onReschedule={handleReschedule}
              isStarting={startingWorkoutId === workout.cycleWorkoutId}
            />
          ))}
        </>
      )}

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
  weekNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  navButton: {
    padding: spacing.sm,
  },
  todayButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  todayButtonText: {
    color: colors.accentSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  weekRange: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
  },
  weekGrid: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  dayCard: {
    padding: spacing.md,
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
  dayName: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  dayDate: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  sessionSurface: {
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
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
  restDaySurface: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  restDayContent: {
    gap: spacing.xs,
  },
  restDayLabel: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
  },
  restDayDate: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
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
