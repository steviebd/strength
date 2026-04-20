import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import {
  exerciseLibrary,
  type ExerciseLibraryItem,
} from '../../../../packages/db/src/exercise-library';
import {
  createCustomExercise,
  ensurePersistedExercise,
  listUserExercises,
  type UserExercise,
} from '@/lib/exercises';

interface ExercisePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: { id: string; name: string; muscleGroup: string | null }) => void;
  selectedIds?: string[];
}

const MUSCLE_GROUPS = [
  'All',
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Core',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Full Body',
  'Cardio',
];
const CREATE_MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Core',
  'Quads',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Full Body',
  'Cardio',
];

interface CreateFormState {
  name: string;
  muscleGroup: string;
  description: string;
}

export function ExercisePicker({
  visible,
  onClose,
  onSelect,
  selectedIds = [],
}: ExercisePickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('All');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: '',
    muscleGroup: '',
    description: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [userExercises, setUserExercises] = useState<UserExercise[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const controller = new AbortController();
    async function fetchUserExercises(search: string) {
      setLoading(true);
      try {
        const data = await listUserExercises(search, controller.signal);
        setUserExercises(data);
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          console.error('Failed to fetch user exercises:', e);
        }
      } finally {
        setLoading(false);
      }
    }
    const timeoutId = setTimeout(() => fetchUserExercises(searchQuery), 300);
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchQuery, visible]);

  const filteredUserExercises = useMemo(() => {
    return userExercises.filter((ex) => {
      const matchesSearch = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesMuscle = selectedMuscleGroup === 'All' || ex.muscleGroup === selectedMuscleGroup;
      return matchesSearch && matchesMuscle && !selectedIds.includes(ex.id);
    });
  }, [userExercises, searchQuery, selectedMuscleGroup, selectedIds]);

  async function handleCreateExercise() {
    if (!createForm.name.trim()) {
      setCreateError('Name is required');
      return;
    }
    if (!createForm.muscleGroup) {
      setCreateError('Muscle group is required');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const newExercise = await createCustomExercise(createForm);
      setUserExercises((prev) => [
        ...prev,
        {
          id: newExercise.id,
          name: newExercise.name,
          muscleGroup: newExercise.muscleGroup,
          description: newExercise.description,
          libraryId: newExercise.libraryId,
        },
      ]);
      onSelect({
        id: newExercise.id,
        name: newExercise.name,
        muscleGroup: newExercise.muscleGroup,
      });
      onClose();
      setShowCreateForm(false);
      setCreateForm({ name: '', muscleGroup: '', description: '' });
    } catch (e) {
      console.error('Create exercise error:', e);
      setCreateError(e instanceof Error ? e.message : 'Failed to create exercise');
    } finally {
      setCreating(false);
    }
  }

  const filteredLibraryExercises = useMemo(() => {
    return exerciseLibrary.filter((ex) => {
      const matchesSearch =
        ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ex.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesMuscle = selectedMuscleGroup === 'All' || ex.muscleGroup === selectedMuscleGroup;
      const isAlreadySelectedByPersistedId = userExercises.some((userExercise) => {
        return userExercise.libraryId === ex.id && selectedIds.includes(userExercise.id);
      });

      return (
        matchesSearch &&
        matchesMuscle &&
        !selectedIds.includes(ex.id) &&
        !isAlreadySelectedByPersistedId
      );
    });
  }, [searchQuery, selectedMuscleGroup, selectedIds, userExercises]);

  const handleSelectLibrary = async (exercise: ExerciseLibraryItem) => {
    if (selectedIds.includes(exercise.id)) {
      onClose();
      return;
    }

    try {
      const persistedExercise = await ensurePersistedExercise(exercise);

      if (selectedIds.includes(persistedExercise.id)) {
        onClose();
        return;
      }

      setUserExercises((prev) => {
        if (prev.some((userExercise) => userExercise.id === persistedExercise.id)) {
          return prev;
        }

        return [...prev, persistedExercise];
      });

      onSelect({
        id: persistedExercise.id,
        name: persistedExercise.name,
        muscleGroup: persistedExercise.muscleGroup,
      });
      onClose();
    } catch (e) {
      console.error('Failed to persist library exercise:', e);
      setCreateError(e instanceof Error ? e.message : 'Failed to add exercise');
    }
  };

  const handleSelectUser = (exercise: UserExercise) => {
    if (!selectedIds.includes(exercise.id)) {
      onSelect({
        id: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
      });
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-darkBg">
        <View className="border-b border-darkBorder p-4">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-darkText text-xl font-bold">
              {showCreateForm ? 'Create Exercise' : 'Add Exercise'}
            </Text>
            <Pressable
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full bg-darkBorder"
            >
              <Text className="text-darkText text-xl">×</Text>
            </Pressable>
          </View>
          {!showCreateForm && (
            <>
              <View className="relative">
                <TextInput
                  className="rounded-xl border border-darkBorder bg-darkCard px-4 py-3 text-darkText"
                  placeholder="Search exercises..."
                  placeholderTextColor="#71717a"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {loading && (
                  <View className="absolute right-3 top-3">
                    <ActivityIndicator size="small" color="#f97316" />
                  </View>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="mt-3"
                contentContainerStyle={{ gap: 8 }}
              >
                {MUSCLE_GROUPS.map((group) => (
                  <Pressable
                    key={group}
                    onPress={() => setSelectedMuscleGroup(group)}
                    className={`rounded-full px-4 py-2 ${selectedMuscleGroup === group ? 'bg-coral' : 'bg-darkBorder'}`}
                  >
                    <Text
                      className={`text-sm ${selectedMuscleGroup === group ? 'text-white font-medium' : 'text-darkMuted'}`}
                    >
                      {group}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </View>

        {showCreateForm ? (
          <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 100 }}>
            <View className="mb-4">
              <Text className="mb-2 text-darkText text-sm font-medium">Name *</Text>
              <TextInput
                className="h-12 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText"
                placeholder="e.g. Hammer Curls"
                placeholderTextColor="#71717a"
                value={createForm.name}
                onChangeText={(text) => setCreateForm((f) => ({ ...f, name: text }))}
              />
            </View>

            <View className="mb-4">
              <Text className="mb-2 text-darkText text-sm font-medium">Muscle Group *</Text>
              <View className="flex-row flex-wrap gap-2">
                {CREATE_MUSCLE_GROUPS.map((group) => (
                  <Pressable
                    key={group}
                    onPress={() => setCreateForm((f) => ({ ...f, muscleGroup: group }))}
                    className={`rounded-full px-3 py-2 border ${
                      createForm.muscleGroup === group
                        ? 'bg-coral border-coral'
                        : 'bg-darkCard border-darkBorder'
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        createForm.muscleGroup === group ? 'text-white' : 'text-darkText'
                      }`}
                    >
                      {group}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="mb-6">
              <Text className="mb-2 text-darkText text-sm font-medium">Description (optional)</Text>
              <TextInput
                className="min-h-20 rounded-xl border border-darkBorder bg-darkCard px-4 py-3 text-darkText"
                placeholder="Add notes about form, equipment, etc."
                placeholderTextColor="#71717a"
                value={createForm.description}
                onChangeText={(text) => setCreateForm((f) => ({ ...f, description: text }))}
                multiline
              />
            </View>

            {createError && (
              <View className="mb-4 rounded-lg bg-red-500/20 p-3">
                <Text className="text-red-400 text-sm">{createError}</Text>
              </View>
            )}

            <View className="flex-row gap-3">
              <Pressable
                onPress={() => {
                  setShowCreateForm(false);
                  setCreateForm({ name: '', muscleGroup: '', description: '' });
                  setCreateError(null);
                }}
                className="flex-1 rounded-xl border border-darkBorder bg-darkCard py-3"
              >
                <Text className="text-darkText text-center font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateExercise}
                disabled={creating}
                className="flex-1 rounded-xl bg-coral py-3 active:scale-95"
              >
                <Text className="text-white text-center font-semibold">
                  {creating ? 'Creating...' : 'Create'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          <>
            <Pressable
              onPress={() => {
                setShowCreateForm(true);
                setSearchQuery('');
                setSelectedMuscleGroup('All');
              }}
              className="mx-4 mt-4 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-coral bg-coral/10 py-3"
            >
              <Text className="text-coral text-sm font-semibold">+ Create Custom Exercise</Text>
            </Pressable>

            <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 100 }}>
              {filteredUserExercises.length === 0 && filteredLibraryExercises.length === 0 ? (
                <View className="items-center justify-center py-12">
                  <Text className="text-darkMuted">No exercises found</Text>
                </View>
              ) : (
                <>
                  {filteredUserExercises.length > 0 && (
                    <>
                      <Text className="text-darkMuted text-xs font-semibold uppercase tracking-wider mb-2">
                        Your Exercises
                      </Text>
                      {filteredUserExercises.map((exercise) => (
                        <Pressable
                          key={exercise.id}
                          onPress={() => handleSelectUser(exercise)}
                          className="mb-2 rounded-xl border border-coral/30 bg-coral/10 p-4"
                        >
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1">
                              <Text className="text-darkText text-base font-medium">
                                {exercise.name}
                              </Text>
                              <Text className="text-darkMuted mt-1 text-xs">
                                {exercise.muscleGroup || 'No muscle group'}
                              </Text>
                            </View>
                            <View className="ml-3 rounded-full bg-coral/20 px-3 py-1">
                              <Text className="text-coral text-xs font-semibold">+ Add</Text>
                            </View>
                          </View>
                        </Pressable>
                      ))}
                    </>
                  )}
                  {filteredLibraryExercises.length > 0 && (
                    <>
                      <Text className="text-darkMuted text-xs font-semibold uppercase tracking-wider mb-2 mt-4">
                        Exercise Library
                      </Text>
                      {filteredLibraryExercises.map((exercise) => {
                        return (
                          <Pressable
                            key={exercise.id}
                            onPress={() => handleSelectLibrary(exercise)}
                            className="mb-2 rounded-xl border border-darkBorder bg-darkCard p-4"
                          >
                            <View className="flex-row items-center justify-between">
                              <View className="flex-1">
                                <Text className="text-darkText text-base font-medium">
                                  {exercise.name}
                                </Text>
                                <Text className="text-darkMuted mt-1 text-xs">
                                  {exercise.muscleGroup}
                                </Text>
                                <Text className="text-darkMuted mt-1 text-xs" numberOfLines={2}>
                                  {exercise.description}
                                </Text>
                              </View>
                              <View className="ml-3 rounded-full bg-coral/20 px-3 py-1">
                                <Text className="text-coral text-xs font-semibold">+ Add</Text>
                              </View>
                            </View>
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}
