import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/Input';
import {
  Badge,
  PageHeader,
  SectionTitle,
  SegmentedTabs,
  Surface,
} from '@/components/ui/app-primitives';
import { PageLayout } from '@/components/ui/PageLayout';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { TemplateList } from '@/components/template/TemplateList';
import { TemplateEditor } from '@/components/template/TemplateEditor';
import { WorkoutCard } from '@/components/workout/WorkoutCard';
import { useWorkoutSessionContext } from '@/context/WorkoutSessionContext';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { apiFetch } from '@/lib/api';
import { getPendingWorkouts, addPendingWorkout, removePendingWorkout } from '@/lib/storage';
import { authClient } from '@/lib/auth-client';
import {
  cacheTemplates,
  createLocalWorkoutFromCurrentProgramCycle,
  createLocalWorkoutFromTemplate,
  getLocalLastCompletedExerciseSnapshots,
  listLocalWorkoutHistory,
  upsertServerWorkoutSnapshot,
  type ExerciseHistorySnapshot,
  type WorkoutSyncStatus,
} from '@/db/workouts';
import { retryWorkoutSync } from '@/lib/workout-sync';
import { incrementHistorySet } from '@/lib/exerciseProgression';
import { useActivePrograms, type ActiveProgram } from '@/hooks/usePrograms';
import type { Template } from '@/hooks/useTemplateEditor';
import type { SelectedExercise } from '@/components/template/TemplateEditor/types';
import { colors, radius, spacing, typography } from '@/theme';

interface WorkoutHistoryItem {
  id: string;
  name: string;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  totalVolume: number | null;
  totalSets: number | null;
  exerciseCount: number | null;
  syncStatus?: WorkoutSyncStatus;
  lastSyncError?: string | null;
}

interface PendingWorkout {
  id: string;
  name: string;
  startedAt: string;
  completedAt: null;
  source: 'program';
  programCycleId: string;
  cycleWorkoutId: string;
  exerciseCount: number;
  durationMinutes: null;
  totalVolume: null;
  totalSets: null;
}

async function fetchWorkoutHistory(): Promise<WorkoutHistoryItem[]> {
  return apiFetch<WorkoutHistoryItem[]>('/api/workouts');
}

async function fetchExerciseHistorySnapshot(
  exerciseId: string,
  exerciseName?: string | null,
): Promise<ExerciseHistorySnapshot | null> {
  try {
    const params = exerciseName?.trim() ? `?name=${encodeURIComponent(exerciseName.trim())}` : '';
    return await apiFetch<ExerciseHistorySnapshot | null>(
      `/api/workouts/last/${encodeURIComponent(exerciseId)}${params}`,
    );
  } catch {
    return null;
  }
}

function hasUsableHistory(snapshot: ExerciseHistorySnapshot | null | undefined) {
  return (
    snapshot?.sets?.some(
      (set) =>
        set.weight !== null ||
        set.reps !== null ||
        set.duration !== null ||
        set.distance !== null ||
        set.height !== null,
    ) ?? false
  );
}

async function confirmHistoryIncrement() {
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Use last workout?',
      'Previous values were found. Start from them as-is, or increment them by the default amount for each exercise type?',
      [
        { text: 'Use as-is', onPress: () => resolve(false) },
        { text: 'Increment', onPress: () => resolve(true) },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      ],
    );
  });
}

export default function WorkoutsIndex() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string; focusProgramId?: string }>();
  const scrollViewRef = useRef<any>(null);
  const [view, setView] = useState<'templates' | 'history'>(
    params.view === 'history' ? 'history' : 'templates',
  );
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [showStartWorkout, setShowStartWorkout] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const { startWorkout, isLoading, error: workoutSessionError } = useWorkoutSessionContext();
  const { weightUnit } = useUserPreferences();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;

  const [workoutName, setWorkoutName] = useState('');
  const [openingProgramWorkoutId, setOpeningProgramWorkoutId] = useState<string | null>(null);
  const [opening1RMTestId, setOpening1RMTestId] = useState<string | null>(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [pendingWorkouts, setPendingWorkouts] = useState<PendingWorkout[]>([]);
  const [localHistory, setLocalHistory] = useState<WorkoutHistoryItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { activePrograms, isLoading: isLoadingActivePrograms } = useActivePrograms();
  const { width } = useWindowDimensions();
  const isNarrow = width < 400;

  const loadPendingWorkouts = useCallback(async () => {
    const workouts = await getPendingWorkouts();
    setPendingWorkouts(workouts);
  }, []);

  const loadLocalHistory = useCallback(async () => {
    if (!userId) {
      setLocalHistory([]);
      return;
    }
    const workouts = await listLocalWorkoutHistory(userId, 50);
    setLocalHistory(workouts);
  }, [userId]);

  const refreshWorkoutsScreen = useCallback(
    async (showRefreshIndicator = false) => {
      if (showRefreshIndicator) {
        setIsRefreshing(true);
      }

      try {
        await loadPendingWorkouts();
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ['templates'] }),
          queryClient.refetchQueries({ queryKey: ['activePrograms'] }),
          queryClient.refetchQueries({ queryKey: ['workoutHistory'] }),
          loadLocalHistory(),
        ]);
      } finally {
        if (showRefreshIndicator) {
          setIsRefreshing(false);
        }
      }
    },
    [loadLocalHistory, loadPendingWorkouts, queryClient],
  );

  useEffect(() => {
    void loadPendingWorkouts();
    void loadLocalHistory();
  }, [loadLocalHistory, loadPendingWorkouts]);

  useFocusEffect(
    useCallback(() => {
      void refreshWorkoutsScreen();
    }, [refreshWorkoutsScreen]),
  );

  useEffect(() => {
    if (view === 'history') {
      void loadPendingWorkouts();
      void loadLocalHistory();
      void queryClient.invalidateQueries({ queryKey: ['workoutHistory'] });
    }
  }, [loadLocalHistory, loadPendingWorkouts, view, queryClient]);

  useEffect(() => {
    if (params.focusProgramId && activePrograms.length > 0) {
      const focusId = params.focusProgramId;
      const targetIndex = activePrograms.findIndex((p) => p.id === focusId);
      if (targetIndex !== -1 && scrollViewRef.current) {
        const estimatedItemHeight = 280;
        const headerHeight = 200;
        const offset = targetIndex * estimatedItemHeight + headerHeight;
        scrollViewRef.current.scrollTo({
          y: offset,
          animated: true,
        });
      }
    }
  }, [params.focusProgramId, activePrograms]);

  const {
    data: workoutHistory = [],
    isLoading: isLoadingHistory,
    error: workoutHistoryError,
  } = useQuery({
    queryKey: ['workoutHistory'],
    queryFn: fetchWorkoutHistory,
    enabled: view === 'history',
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!userId || workoutHistory.length === 0) return;
    void Promise.all(
      workoutHistory.map((item) =>
        upsertServerWorkoutSnapshot(userId, {
          ...item,
          notes: null,
          exercises: [],
          totalVolume: item.totalVolume ?? undefined,
          totalSets: item.totalSets ?? undefined,
          durationMinutes: item.durationMinutes ?? undefined,
          exerciseCount: item.exerciseCount ?? undefined,
        }),
      ),
    ).then(loadLocalHistory);
  }, [loadLocalHistory, userId, workoutHistory]);

  const mergedHistory = useMemo(() => {
    const byId = new Map<string, WorkoutHistoryItem>();
    for (const item of workoutHistory) {
      byId.set(item.id, item);
    }
    for (const item of localHistory) {
      byId.set(item.id, item);
    }
    for (const pending of pendingWorkouts) {
      if (!byId.has(pending.id)) {
        byId.set(pending.id, { ...pending, syncStatus: 'local', lastSyncError: null });
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }, [localHistory, pendingWorkouts, workoutHistory]);

  const getDisplaySessionNumber = (program: ActiveProgram) =>
    Math.min(program.totalSessionsCompleted + 1, program.totalSessionsPlanned);

  const handleStartWorkout = async () => {
    const name = workoutName.trim() || 'Workout';
    const workout = await startWorkout(name);
    if (workout?.id) {
      setShowStartWorkout(false);
      setWorkoutName('');
      router.push(`/workout-session?workoutId=${workout.id}`);
      return;
    }

    Alert.alert('Unable to start workout', workoutSessionError ?? 'Please try again.');
  };

  const handleStartFromTemplate = async (template: Template) => {
    try {
      if (userId && template.id) {
        const templateExercises = template.exercises ?? [];
        const exerciseIds = templateExercises.map((exercise) => exercise.exerciseId);
        const localHistory = await getLocalLastCompletedExerciseSnapshots(
          userId,
          exerciseIds,
          templateExercises.map((exercise) => exercise.name),
        );
        const usableLocalHistory = localHistory.filter(hasUsableHistory);
        const localHistoryIds = new Set(usableLocalHistory.map((snapshot) => snapshot.exerciseId));
        const d1History = await Promise.all(
          templateExercises
            .filter((exercise) => !localHistoryIds.has(exercise.exerciseId))
            .map((exercise) => fetchExerciseHistorySnapshot(exercise.exerciseId, exercise.name)),
        );
        const historySnapshots = [
          ...usableLocalHistory,
          ...d1History.filter(
            (snapshot): snapshot is ExerciseHistorySnapshot =>
              snapshot !== null && snapshot !== undefined && hasUsableHistory(snapshot),
          ),
        ];
        const shouldIncrement =
          historySnapshots.length > 0 ? await confirmHistoryIncrement() : false;
        const exerciseTypeById = new Map(
          templateExercises.map((exercise) => [exercise.exerciseId, exercise.exerciseType]),
        );
        const resolvedHistorySnapshots = shouldIncrement
          ? historySnapshots.map((snapshot) => ({
              ...snapshot,
              sets: snapshot.sets.map((set) =>
                incrementHistorySet(set, exerciseTypeById.get(snapshot.exerciseId)),
              ),
            }))
          : historySnapshots;
        const local = await createLocalWorkoutFromTemplate(
          userId,
          template.id,
          resolvedHistorySnapshots,
        );
        if (local?.id) {
          router.push(`/workout-session?workoutId=${local.id}`);
          return;
        }
      }
      const workout = await apiFetch<{ id: string }>('/api/workouts', {
        method: 'POST',
        body: {
          name: template.name,
          templateId: template.id,
        },
      });
      if (workout?.id) {
        router.push(`/workout-session?workoutId=${workout.id}`);
      }
    } catch (e) {
      Alert.alert('Unable to start workout', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const handleRetrySync = async (workoutId: string) => {
    if (!userId) return;
    await retryWorkoutSync(userId, workoutId);
    await loadLocalHistory();
    await queryClient.invalidateQueries({ queryKey: ['workoutHistory'] });
  };

  useEffect(() => {
    if (!userId) return;
    const templates = queryClient.getQueryData<Template[]>(['templates', userId]);
    if (templates) {
      void cacheTemplates(userId, templates);
    }
  }, [queryClient, userId]);

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setShowTemplateEditor(true);
  };

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setShowTemplateEditor(true);
  };

  const handleTemplateSaved = async () => {
    setShowTemplateEditor(false);
    setEditingTemplate(null);
    await queryClient.refetchQueries({ queryKey: ['templates'] });
  };

  const handleOpenCurrentProgramWorkout = async (program: ActiveProgram) => {
    setOpeningProgramWorkoutId(program.id);
    try {
      if (userId) {
        const local = await createLocalWorkoutFromCurrentProgramCycle(userId, program.id);
        if (local?.id) {
          router.push(`/workout-session?workoutId=${local.id}&source=program`);
          return;
        }
      }
      const result = await apiFetch<{
        workoutId: string;
        cycleWorkoutId?: string;
        sessionName: string;
        created: boolean;
        completed: boolean;
      }>(`/api/programs/cycles/${program.id}/workouts/current/start`, {
        method: 'POST',
        body: {},
      });

      if (result.completed) {
        Alert.alert(
          'Session Already Completed',
          'This program session has already been completed.',
        );
        await queryClient.invalidateQueries({ queryKey: ['activePrograms'] });
        return;
      }

      await addPendingWorkout({
        id: result.workoutId,
        name: result.sessionName,
        startedAt: new Date().toISOString(),
        completedAt: null,
        source: 'program',
        programCycleId: program.id,
        cycleWorkoutId: result.cycleWorkoutId ?? result.workoutId,
        exercises: [],
        exerciseCount: 0,
        durationMinutes: null,
        totalVolume: null,
        totalSets: null,
      });
      setPendingWorkouts((prev) => [
        ...prev,
        {
          id: result.workoutId,
          name: result.sessionName,
          startedAt: new Date().toISOString(),
          completedAt: null,
          source: 'program',
          programCycleId: program.id,
          cycleWorkoutId: result.cycleWorkoutId ?? result.workoutId,
          exerciseCount: 0,
          durationMinutes: null,
          totalVolume: null,
          totalSets: null,
        },
      ]);
      router.push(`/workout-session?workoutId=${result.workoutId}&source=program`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open current session');
    } finally {
      setOpeningProgramWorkoutId(null);
    }
  };

  const handleOpen1RMTest = async (program: ActiveProgram) => {
    setOpening1RMTestId(program.id);
    try {
      const result = await apiFetch<{ workoutId: string; workoutName: string }>(
        `/api/programs/cycles/${program.id}/create-1rm-test-workout`,
        {
          method: 'POST',
          body: {},
        },
      );
      router.push(
        `/workout-session?workoutId=${result.workoutId}&source=program-1rm-test&programName=${encodeURIComponent(program.name)}&cycleId=${program.id}`,
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open 1RM test');
    } finally {
      setOpening1RMTestId(null);
    }
  };

  const handleDeletePendingWorkout = async (workoutId: string) => {
    await removePendingWorkout(workoutId);
    setPendingWorkouts((prev) => prev.filter((p) => p.id !== workoutId));
  };

  const _handleDeleteProgram = (program: ActiveProgram) => {
    Alert.alert('Delete Active Program', `Delete ${program.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingProgramId(program.id);
          try {
            await apiFetch(`/api/programs/cycles/${program.id}`, { method: 'DELETE' });
            await queryClient.invalidateQueries({ queryKey: ['activePrograms'] });
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete program');
          } finally {
            setDeletingProgramId(null);
          }
        },
      },
    ]);
  };

  const renderActiveProgramsSection = () => {
    if (isLoadingActivePrograms) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.accentSecondary} />
        </View>
      );
    }

    if (activePrograms.length === 0) {
      return null;
    }

    return (
      <View style={styles.programsContainer}>
        <SectionTitle title="Active programs" />
        {activePrograms.map((program) => {
          const isOpening = openingProgramWorkoutId === program.id;
          const isDeleting = deletingProgramId === program.id;
          const isFocused = params.focusProgramId === program.id;
          const currentSession = program.currentSession ?? 1;
          const displaySessionNumber = getDisplaySessionNumber(program);
          const progress = Math.min(
            100,
            (displaySessionNumber / program.totalSessionsPlanned) * 100,
          );

          return (
            <Surface
              key={`active-program:${program.id}`}
              style={{
                ...styles.programSurface,
                ...(isFocused ? styles.programSurfaceFocused : {}),
              }}
            >
              <View style={styles.programContent}>
                <View style={styles.programHeader}>
                  <View style={styles.programInfo}>
                    <Text style={styles.programName}>{program.name}</Text>
                    <View style={styles.programBadges}>
                      {isFocused && <Badge label="New" tone="emerald" />}
                      {program.currentWeek ? (
                        <Badge label={`Week ${program.currentWeek}`} tone="sky" />
                      ) : null}
                      <Badge label={`Session ${currentSession}`} tone="orange" />
                    </View>
                  </View>
                </View>

                <Text style={styles.programProgress}>
                  {displaySessionNumber} / {program.totalSessionsPlanned} sessions completed
                </Text>

                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                </View>

                <View style={styles.programActions}>
                  <Button
                    label={isOpening ? 'Opening session...' : 'Start next session'}
                    icon="play"
                    onPress={() => void handleOpenCurrentProgramWorkout(program)}
                    disabled={isOpening || isDeleting}
                    fullWidth
                  />

                  <View style={styles.programActionsRow}>
                    <View style={styles.flex1}>
                      <Button
                        label={opening1RMTestId === program.id ? 'Opening...' : '1RM Test'}
                        icon="speedometer-outline"
                        variant="secondary"
                        onPress={() => void handleOpen1RMTest(program)}
                        disabled={isOpening || isDeleting || opening1RMTestId !== null}
                      />
                    </View>
                    <Button
                      label="View Schedule"
                      icon="calendar-outline"
                      variant="secondary"
                      onPress={() => router.push(`/program-schedule?cycleId=${program.id}`)}
                      disabled={isOpening || isDeleting || opening1RMTestId !== null}
                    />
                  </View>
                </View>
              </View>
            </Surface>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <PageLayout
        scrollViewRef={scrollViewRef}
        header={
          <PageHeader
            eyebrow="Training"
            title="Workouts"
            description="Launch a session quickly, keep templates organized, and review your recent training."
          />
        }
        screenScrollViewProps={{
          refreshControl: (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                void refreshWorkoutsScreen(true);
              }}
              tintColor={colors.accentSecondary}
            />
          ),
        }}
      >
        <SegmentedTabs
          options={[
            {
              label: 'Templates',
              onPress: () => setView('templates'),
              active: view === 'templates',
            },
            {
              label: 'History',
              onPress: () => setView('history'),
              active: view === 'history',
            },
          ]}
        />

        {view === 'templates' ? (
          <View style={styles.templatesView}>
            <Surface style={styles.quickStartSurface}>
              <View style={styles.quickStartContent}>
                <View style={styles.quickStartHeader}>
                  <Badge label="Quick start" tone="orange" />
                  <Text style={styles.quickStartTitle}>Train without friction</Text>
                  <Text style={styles.quickStartDescription}>
                    Use an empty workout when you want to freestyle, or build templates for the
                    sessions you repeat every week.
                  </Text>
                </View>
                <View style={styles.quickStartActions}>
                  {isNarrow ? (
                    <>
                      <Button
                        testID="workouts-start-custom"
                        label="Start custom workout"
                        icon="play"
                        onPress={() => setShowStartWorkout(true)}
                        fullWidth
                      />
                      <Button
                        testID="workouts-new-template"
                        label="New template"
                        icon="add"
                        variant="secondary"
                        onPress={handleNewTemplate}
                        fullWidth
                      />
                    </>
                  ) : (
                    <>
                      <View style={styles.flex1}>
                        <Button
                          testID="workouts-start-custom"
                          label="Start custom workout"
                          icon="play"
                          onPress={() => setShowStartWorkout(true)}
                        />
                      </View>
                      <View style={styles.flex1}>
                        <Button
                          testID="workouts-new-template"
                          label="New template"
                          icon="add"
                          variant="secondary"
                          onPress={handleNewTemplate}
                        />
                      </View>
                    </>
                  )}
                </View>
              </View>
            </Surface>

            {renderActiveProgramsSection()}

            <View style={styles.templatesSection}>
              <SectionTitle title="Templates" />
              <TemplateList
                onEditTemplate={handleEditTemplate}
                onStartWorkout={handleStartFromTemplate}
              />
            </View>
          </View>
        ) : isLoadingHistory && pendingWorkouts.length === 0 ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={colors.accentSecondary} />
          </View>
        ) : workoutHistoryError && mergedHistory.length === 0 ? (
          <View style={styles.errorState}>
            <Text style={styles.errorTitle}>Error Loading History</Text>
            <Text style={styles.errorMessage}>
              {workoutHistoryError instanceof Error
                ? workoutHistoryError.message
                : 'Failed to load workout history'}
            </Text>
          </View>
        ) : mergedHistory.length === 0 ? (
          <Surface style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptyMessage}>
              Start from a template or open an empty workout to begin tracking.
            </Text>
          </Surface>
        ) : (
          <View style={styles.historyList}>
            <SectionTitle title="Recent workouts" />
            {mergedHistory.map((item) => {
              const isPending =
                item.syncStatus === 'pending' ||
                item.syncStatus === 'syncing' ||
                item.syncStatus === 'failed' ||
                item.syncStatus === 'conflict' ||
                pendingWorkouts.some((p) => p.id === item.id);
              return (
                <WorkoutCard
                  key={`workout-history:${item.id}`}
                  id={item.id}
                  name={item.name}
                  date={item.startedAt}
                  completedAt={item.completedAt}
                  durationMinutes={item.durationMinutes ?? null}
                  totalVolume={item.totalVolume}
                  exerciseCount={item.exerciseCount ?? 0}
                  weightUnit={weightUnit}
                  isPending={isPending}
                  syncStatus={item.syncStatus}
                  syncError={item.lastSyncError}
                  onRetry={
                    item.syncStatus === 'failed' || item.syncStatus === 'conflict'
                      ? () => handleRetrySync(item.id)
                      : undefined
                  }
                  onDelete={
                    isPending && !item.syncStatus
                      ? () => handleDeletePendingWorkout(item.id)
                      : undefined
                  }
                />
              );
            })}
          </View>
        )}
      </PageLayout>

      <Modal
        visible={showStartWorkout}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStartWorkout(false)}
      >
        <View style={[styles.modalContent, { paddingTop: insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Start workout</Text>
            <IconButton
              icon="close"
              label="Close"
              variant="ghost"
              size="sm"
              onPress={() => setShowStartWorkout(false)}
            />
          </View>

          <Surface style={styles.modalSurface}>
            <View style={styles.modalForm}>
              <TextField
                testID="workouts-custom-name"
                label="WORKOUT NAME"
                placeholder="e.g., Upper Body Day"
                value={workoutName}
                onChangeText={setWorkoutName}
              />

              <Button
                testID="workouts-start-empty"
                label={isLoading ? 'Starting...' : 'Start Empty Workout'}
                icon="play"
                onPress={handleStartWorkout}
                disabled={isLoading}
              />
            </View>
          </Surface>
        </View>
      </Modal>

      <Modal
        visible={showTemplateEditor}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTemplateEditor(false)}
      >
        <TemplateEditor
          mode={editingTemplate ? 'edit' : 'create'}
          templateId={editingTemplate?.id}
          initialData={
            editingTemplate
              ? {
                  name: editingTemplate.name,
                  description: editingTemplate.description ?? undefined,
                  notes: editingTemplate.notes ?? undefined,
                  exercises: editingTemplate.exercises as unknown as SelectedExercise[],
                }
              : undefined
          }
          onClose={() => {
            setShowTemplateEditor(false);
            setEditingTemplate(null);
          }}
          onSaved={handleTemplateSaved}
        />
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  programsContainer: {
    gap: spacing.sm,
  },
  programSurface: {
    backgroundColor: 'rgba(30,41,59,0.7)',
  },
  programSurfaceFocused: {
    backgroundColor: 'rgba(30,41,59,0.7)',
    borderWidth: 2,
    borderColor: colors.accentSecondary,
  },
  programContent: {
    gap: spacing.md,
  },
  programHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  programInfo: {
    flex: 1,
    gap: spacing.sm,
  },
  programName: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  programBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  programProgress: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
  },
  progressBarBg: {
    height: 8,
    overflow: 'hidden',
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accentSecondary,
  },
  programActions: {
    gap: spacing.sm,
  },
  programActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  deleteButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.2)',
    backgroundColor: 'rgba(244,63,94,0.1)',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
    color: colors.error,
  },

  templatesView: {
    gap: spacing.lg,
  },
  quickStartSurface: {
    backgroundColor: colors.surface,
  },
  quickStartContent: {
    gap: spacing.md,
  },
  quickStartHeader: {
    gap: spacing.xs,
  },
  quickStartTitle: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  quickStartDescription: {
    fontSize: typography.fontSizes.base,
    lineHeight: 24,
    color: colors.textMuted,
  },
  quickStartActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  templatesSection: {
    gap: spacing.sm,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  errorTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  errorMessage: {
    fontSize: typography.fontSizes.base,
    textAlign: 'center',
    color: colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: 'rgba(30,41,59,0.7)',
    paddingVertical: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyMessage: {
    fontSize: typography.fontSizes.base,
    textAlign: 'center',
    color: colors.textMuted,
  },
  historyList: {
    gap: spacing.md,
  },
  modalContent: {
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
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },

  modalSurface: {
    backgroundColor: colors.surface,
  },
  modalForm: {
    gap: spacing.md,
  },
});
