import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActionButton,
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
import { useActivePrograms, type ActiveProgram } from '@/hooks/usePrograms';
import type { Template } from '@/hooks/useTemplateEditor';
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
  const { startWorkout, isLoading } = useWorkoutSessionContext();
  const { activeTimezone, weightUnit } = useUserPreferences();

  const [workoutName, setWorkoutName] = useState('');
  const [openingProgramWorkoutId, setOpeningProgramWorkoutId] = useState<string | null>(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [pendingWorkouts, setPendingWorkouts] = useState<PendingWorkout[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const { activePrograms, isLoading: isLoadingActivePrograms } = useActivePrograms();

  const loadPendingWorkouts = useCallback(async () => {
    const workouts = await getPendingWorkouts();
    setPendingWorkouts(workouts);
  }, []);

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
        ]);
      } finally {
        if (showRefreshIndicator) {
          setIsRefreshing(false);
        }
      }
    },
    [loadPendingWorkouts, queryClient],
  );

  useEffect(() => {
    void loadPendingWorkouts();
  }, [loadPendingWorkouts]);

  useFocusEffect(
    useCallback(() => {
      void refreshWorkoutsScreen();
    }, [refreshWorkoutsScreen]),
  );

  useEffect(() => {
    if (view === 'history') {
      void loadPendingWorkouts();
      void queryClient.invalidateQueries({ queryKey: ['workoutHistory'] });
    }
  }, [loadPendingWorkouts, view, queryClient]);

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
  const mergedHistory = useMemo(() => {
    const serverIds = new Set(workoutHistory.map((w) => w.id));
    const pendingFiltered = pendingWorkouts.filter((p) => !serverIds.has(p.id));
    return [...pendingFiltered, ...workoutHistory];
  }, [pendingWorkouts, workoutHistory]);

  const getDisplaySessionNumber = (program: ActiveProgram) =>
    Math.min(program.totalSessionsCompleted + 1, program.totalSessionsPlanned);

  const handleStartWorkout = async () => {
    const name = workoutName.trim() || 'Workout';
    await startWorkout(name);
    setShowStartWorkout(false);
    setWorkoutName('');
    router.push('/workout-session');
  };

  const handleStartFromTemplate = async (template: Template) => {
    try {
      const workout = await apiFetch<{ id: string }>('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          templateId: template.id,
          timezone: activeTimezone,
        }),
      });
      if (workout?.id) {
        router.push(`/workout-session?workoutId=${workout.id}`);
      }
    } catch (err) {
      console.error('Failed to start workout from template:', err);
    }
  };

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
      const result = await apiFetch<{
        workoutId: string;
        sessionName: string;
        created: boolean;
        completed: boolean;
      }>(`/api/programs/cycles/${program.id}/workouts/current/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: activeTimezone }),
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
        cycleWorkoutId: result.workoutId,
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
          cycleWorkoutId: result.workoutId,
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

  const handleDeletePendingWorkout = async (workoutId: string) => {
    await removePendingWorkout(workoutId);
    setPendingWorkouts((prev) => prev.filter((p) => p.id !== workoutId));
  };

  const handleDeleteProgram = (program: ActiveProgram) => {
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
              key={program.id}
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
                  <ActionButton
                    label={isOpening ? 'Opening session...' : 'Start next session'}
                    icon="play"
                    onPress={() => void handleOpenCurrentProgramWorkout(program)}
                    disabled={isOpening || isDeleting}
                  />

                  <View style={styles.programActionsRow}>
                    <View style={styles.flex1}>
                      <ActionButton
                        label="1RM Test"
                        icon="speedometer-outline"
                        variant="secondary"
                        onPress={() => router.push(`/program-1rm-test?cycleId=${program.id}`)}
                        disabled={isOpening || isDeleting}
                      />
                    </View>
                    <Pressable
                      style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
                      onPress={() => handleDeleteProgram(program)}
                      disabled={isOpening || isDeleting}
                    >
                      {isDeleting ? (
                        <ActivityIndicator size="small" color="#fda4af" />
                      ) : (
                        <Text style={styles.deleteButtonText}>Delete</Text>
                      )}
                    </Pressable>
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
                  <View style={styles.flex1}>
                    <ActionButton
                      label="Start custom workout"
                      icon="play"
                      onPress={() => setShowStartWorkout(true)}
                    />
                  </View>
                  <View style={styles.flex1}>
                    <ActionButton
                      label="New template"
                      icon="add"
                      variant="secondary"
                      onPress={handleNewTemplate}
                    />
                  </View>
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
        ) : workoutHistoryError ? (
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
            {mergedHistory.map((item, index) => {
              const isPending =
                index < pendingWorkouts.length && pendingWorkouts.some((p) => p.id === item.id);
              return (
                <WorkoutCard
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  date={item.startedAt}
                  durationMinutes={item.durationMinutes ?? null}
                  totalVolume={item.totalVolume}
                  exerciseCount={item.exerciseCount ?? 0}
                  weightUnit={weightUnit}
                  isPending={isPending}
                  onDelete={isPending ? () => handleDeletePendingWorkout(item.id) : undefined}
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
            <Pressable onPress={() => setShowStartWorkout(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          <Surface style={styles.modalSurface}>
            <View style={styles.modalForm}>
              <Text style={styles.inputLabel}>WORKOUT NAME</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g., Upper Body Day"
                placeholderTextColor={colors.placeholderText}
                value={workoutName}
                onChangeText={setWorkoutName}
              />

              <ActionButton
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
  closeButton: {
    padding: spacing.sm,
  },
  closeButtonText: {
    fontSize: typography.fontSizes.lg,
    color: colors.textMuted,
  },
  modalSurface: {
    backgroundColor: colors.surface,
  },
  modalForm: {
    gap: spacing.md,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: typography.fontWeights.semibold,
    letterSpacing: 1.6,
    color: colors.textMuted,
  },
  textInput: {
    height: 56,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSizes.lg,
    color: colors.text,
  },
});
