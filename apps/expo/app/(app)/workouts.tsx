import { useState } from 'react';
import { View, Text, Pressable, TextInput, Modal, ActivityIndicator, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { TemplateList } from '@/components/template/TemplateList';
import { TemplateEditor } from '@/components/template/TemplateEditor';
import { WorkoutCard } from '@/components/workout/WorkoutCard';
import { useWorkoutSessionContext } from '@/context/WorkoutSessionContext';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { apiFetch } from '@/lib/api';
import type { Template } from '@/hooks/useTemplateEditor';

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

interface ActiveProgram {
  id: string;
  programSlug: string;
  name: string;
  currentWeek: number | null;
  currentSession: number | null;
  totalSessionsCompleted: number;
  totalSessionsPlanned: number;
}

async function fetchWorkoutHistory(): Promise<WorkoutHistoryItem[]> {
  return apiFetch<WorkoutHistoryItem[]>('/api/workouts');
}

async function fetchActivePrograms(): Promise<ActiveProgram[]> {
  return apiFetch<ActiveProgram[]>('/api/programs/active');
}

export default function WorkoutsIndex() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [view, setView] = useState<'templates' | 'history'>('templates');
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [showStartWorkout, setShowStartWorkout] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const { startWorkout, isLoading } = useWorkoutSessionContext();
  const { weightUnit } = useUserPreferences();

  const [workoutName, setWorkoutName] = useState('');
  const [openingProgramWorkoutId, setOpeningProgramWorkoutId] = useState<string | null>(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: workoutHistory = [], isLoading: isLoadingHistory } = useQuery({
    queryKey: ['workoutHistory'],
    queryFn: fetchWorkoutHistory,
    enabled: view === 'history',
  });
  const { data: activePrograms = [], isLoading: isLoadingActivePrograms } = useQuery({
    queryKey: ['activePrograms'],
    queryFn: fetchActivePrograms,
  });

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
        body: JSON.stringify({ name: template.name, templateId: template.id }),
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

  const handleTemplateSaved = () => {
    setShowTemplateEditor(false);
    setEditingTemplate(null);
    queryClient.resetQueries({ queryKey: ['templates'] });
  };

  const handleOpenCurrentProgramWorkout = async (program: ActiveProgram) => {
    setOpeningProgramWorkoutId(program.id);
    try {
      const result = await apiFetch<{
        workoutId: string;
        created: boolean;
        completed: boolean;
      }>(`/api/programs/cycles/${program.id}/workouts/current/start`, {
        method: 'POST',
      });

      if (result.completed) {
        Alert.alert(
          'Session Already Completed',
          'This program session has already been completed.',
        );
        await queryClient.invalidateQueries({ queryKey: ['activePrograms'] });
        return;
      }

      router.push(`/workout-session?workoutId=${result.workoutId}&source=program`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open current session');
    } finally {
      setOpeningProgramWorkoutId(null);
    }
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

  const renderHistoryItem = ({ item }: { item: WorkoutHistoryItem }) => (
    <View className="mb-3">
      <WorkoutCard
        id={item.id}
        name={item.name}
        date={item.startedAt}
        durationMinutes={item.durationMinutes ?? null}
        totalVolume={item.totalVolume}
        exerciseCount={item.exerciseCount ?? 0}
        weightUnit={weightUnit}
      />
    </View>
  );

  const renderActiveProgramsSection = () => {
    if (isLoadingActivePrograms) {
      return (
        <View className="items-center justify-center py-8">
          <ActivityIndicator size="small" color="#ef6f4f" />
        </View>
      );
    }

    if (activePrograms.length === 0) {
      return null;
    }

    return (
      <View className="px-4 pt-4">
        <Text className="mb-3 text-sm font-semibold text-darkText">Active Programs</Text>
        <View className="gap-3">
          {activePrograms.map((program) => {
            const isOpening = openingProgramWorkoutId === program.id;
            const isDeleting = deletingProgramId === program.id;
            const currentSession = program.currentSession ?? 1;
            const displaySessionNumber = getDisplaySessionNumber(program);
            const progress = Math.min(
              100,
              (displaySessionNumber / program.totalSessionsPlanned) * 100,
            );

            return (
              <View key={program.id} className="rounded-2xl border border-coral/40 bg-coral/10 p-4">
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-darkText">{program.name}</Text>
                  {program.currentWeek ? (
                    <Text className="text-xs text-darkMuted">
                      Week {program.currentWeek} · Session {currentSession}
                    </Text>
                  ) : null}
                </View>
                <Text className="mb-3 text-sm text-darkMuted">
                  {displaySessionNumber} / {program.totalSessionsPlanned} sessions
                </Text>
                <View className="h-2 overflow-hidden rounded-full bg-darkBorder">
                  <View
                    className="h-full rounded-full bg-coral"
                    style={{ width: `${progress}%` }}
                  />
                </View>
                <View className="mt-4 flex-row gap-3">
                  <Pressable
                    className={`flex-1 items-center justify-center rounded-xl bg-coral px-4 py-3 ${
                      isOpening ? 'opacity-50' : ''
                    }`}
                    onPress={() => void handleOpenCurrentProgramWorkout(program)}
                    disabled={isOpening || isDeleting}
                  >
                    {isOpening ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text className="text-sm font-semibold text-white">Resume session</Text>
                    )}
                  </Pressable>
                  <Pressable
                    className="items-center justify-center rounded-xl border border-pine/40 px-4 py-3"
                    onPress={() => router.push(`/program-1rm-test?cycleId=${program.id}`)}
                    disabled={isOpening || isDeleting}
                  >
                    <Text className="text-sm font-medium text-pine">1RM Test</Text>
                  </Pressable>
                  <Pressable
                    className={`items-center justify-center rounded-xl border border-red-500/40 px-4 py-3 ${
                      isDeleting ? 'opacity-50' : ''
                    }`}
                    onPress={() => handleDeleteProgram(program)}
                    disabled={isOpening || isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#f87171" />
                    ) : (
                      <Text className="text-sm font-medium text-red-400">Delete</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-darkBg">
      <View
        className="border-b border-darkBorder px-4"
        style={{ paddingTop: insets.top + 16, paddingBottom: 16 }}
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-darkText text-xl font-bold">Workouts</Text>
        </View>

        <View className="mt-4 flex-row rounded-xl bg-darkCard p-1">
          <Pressable
            onPress={() => setView('templates')}
            className={`flex-1 rounded-lg py-2 ${view === 'templates' ? 'bg-darkBorder' : ''}`}
          >
            <Text
              className={`text-center text-sm ${view === 'templates' ? 'text-darkText font-medium' : 'text-darkMuted'}`}
            >
              Templates
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setView('history')}
            className={`flex-1 rounded-lg py-2 ${view === 'history' ? 'bg-darkBorder' : ''}`}
          >
            <Text
              className={`text-center text-sm ${view === 'history' ? 'text-darkText font-medium' : 'text-darkMuted'}`}
            >
              History
            </Text>
          </Pressable>
        </View>
      </View>

      {view === 'templates' ? (
        <View className="flex-1">
          {renderActiveProgramsSection()}
          <View className="flex-1">
            <TemplateList
              onEditTemplate={handleEditTemplate}
              onStartWorkout={handleStartFromTemplate}
            />
          </View>
        </View>
      ) : isLoadingHistory ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#ef6f4f" />
        </View>
      ) : workoutHistory.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-darkText text-xl font-bold mb-2">No Workouts Yet</Text>
          <Text className="text-darkMuted text-center">
            Start a workout from a template or begin an empty workout.
          </Text>
        </View>
      ) : (
        <FlatList
          data={workoutHistory}
          renderItem={renderHistoryItem}
          keyExtractor={(item) => item.id}
          className="flex-1 p-4"
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={renderActiveProgramsSection()}
        />
      )}

      <Modal
        visible={showStartWorkout}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStartWorkout(false)}
      >
        <View className="flex-1 bg-darkBg px-6" style={{ paddingTop: insets.top + 16 }}>
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-darkText text-2xl font-bold">Start Workout</Text>
            <Pressable onPress={() => setShowStartWorkout(false)} className="p-2">
              <Text className="text-darkMuted text-lg">✕</Text>
            </Pressable>
          </View>

          <View className="mb-4">
            <Text className="text-darkMuted mb-2 text-sm">Workout Name</Text>
            <TextInput
              className="h-14 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText text-lg"
              placeholder="e.g., Upper Body Day"
              placeholderTextColor="#71717a"
              value={workoutName}
              onChangeText={setWorkoutName}
            />
          </View>

          <Pressable
            className={`h-14 items-center justify-center rounded-2xl ${isLoading ? 'bg-darkBorder' : 'bg-coral'}`}
            onPress={handleStartWorkout}
            disabled={isLoading}
          >
            <Text className="text-white text-lg font-semibold">
              {isLoading ? 'Starting...' : 'Start Empty Workout'}
            </Text>
          </Pressable>
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

      <View className="absolute bottom-8 left-6 right-6 flex-row gap-3">
        <Pressable
          onPress={() => setShowStartWorkout(true)}
          className="flex-1 items-center justify-center rounded-full bg-pine py-4"
        >
          <Text className="text-white text-sm font-semibold">Start Custom Workout</Text>
        </Pressable>
        <Pressable
          onPress={handleNewTemplate}
          className="flex-1 items-center justify-center rounded-full bg-coral py-4"
        >
          <Text className="text-white text-sm font-semibold">+ New Template</Text>
        </Pressable>
      </View>
    </View>
  );
}
