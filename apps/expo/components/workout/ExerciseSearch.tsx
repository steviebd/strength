import { useState, useEffect, useMemo } from 'react';
import { FlatList, Pressable, Text, TextInput, View, ActivityIndicator } from 'react-native';
import { exerciseLibrary, type ExerciseLibraryItem as LibItem } from '@strength/db';
import {
  createCustomExercise,
  ensurePersistedExercise,
  listUserExercises,
  type UserExercise,
} from '@/lib/exercises';
import type { ExerciseLibraryItem } from '@/context/WorkoutSessionContext';

interface ExerciseSearchProps {
  onSelect: (exercise: ExerciseLibraryItem) => void;
  onClose: () => void;
  excludeIds?: string[];
  visible?: boolean;
}

type CombinedExercise = LibItem & { libraryId?: string };
type ListItem =
  | { type: 'header'; title: string }
  | { type: 'exercise'; data: CombinedExercise; isUser: boolean };

const MUSCLE_GROUPS = [
  'Back',
  'Biceps',
  'Calves',
  'Cardio',
  'Chest',
  'Core',
  'Forearms',
  'Full Body',
  'Glutes',
  'Hamstrings',
  'Quads',
  'Shoulders',
  'Triceps',
];

interface CreateFormState {
  name: string;
  muscleGroup: string;
  description: string;
}

export function ExerciseSearch({
  onSelect,
  onClose,
  excludeIds = [],
  visible = true,
}: ExerciseSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userExercises, setUserExercises] = useState<UserExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: '',
    muscleGroup: '',
    description: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
          libraryId: null,
        },
      ]);
      onSelect({
        id: newExercise.id,
        name: newExercise.name,
        muscleGroup: newExercise.muscleGroup,
        description: newExercise.description,
      });
      onClose();
    } catch (e) {
      console.error('Create exercise error:', e);
      setCreateError(e instanceof Error ? e.message : 'Failed to create exercise');
    } finally {
      setCreating(false);
    }
  }

  const filteredUserExercises = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return userExercises.filter(
      (ex) => ex.name.toLowerCase().includes(query) && !excludeIds.includes(ex.id),
    );
  }, [userExercises, searchQuery, excludeIds]);

  const filteredLibraryExercises = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return exerciseLibrary.filter(
      (ex) =>
        ex.name.toLowerCase().includes(query) &&
        !excludeIds.includes(ex.id) &&
        !userExercises.some((userExercise) => {
          return userExercise.libraryId === ex.id && excludeIds.includes(userExercise.id);
        }),
    );
  }, [searchQuery, excludeIds, userExercises]);

  const listData = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    if (filteredUserExercises.length > 0) {
      items.push({ type: 'header', title: 'Your Exercises' });
      filteredUserExercises.forEach((ex) =>
        items.push({ type: 'exercise', data: ex as CombinedExercise, isUser: true }),
      );
    }
    if (filteredLibraryExercises.length > 0) {
      items.push({ type: 'header', title: 'Exercise Library' });
      filteredLibraryExercises.forEach((ex) =>
        items.push({ type: 'exercise', data: ex, isUser: false }),
      );
    }
    return items;
  }, [filteredUserExercises, filteredLibraryExercises]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <View className="bg-darkBg px-4 py-2">
          <Text className="text-darkMuted text-xs font-semibold uppercase tracking-wider">
            {item.title}
          </Text>
        </View>
      );
    }
    const ex = item.data;
    const isUser = item.isUser;
    return (
      <Pressable
        className="flex flex-row items-center justify-between border-b border-darkBorder/50 p-4 active:bg-darkCard"
        onPress={async () => {
          if (isUser) {
            onSelect(ex as ExerciseLibraryItem);
            onClose();
            return;
          }
          const existingUserExercise = userExercises.find((ue) => ue.libraryId === ex.id);
          if (existingUserExercise) {
            if (excludeIds.includes(existingUserExercise.id)) {
              onClose();
              return;
            }
            onSelect({
              id: existingUserExercise.id,
              name: existingUserExercise.name,
              muscleGroup: existingUserExercise.muscleGroup,
              description: existingUserExercise.description,
            });
            onClose();
            return;
          }
          try {
            const newExercise = await ensurePersistedExercise(ex);
            setUserExercises((prev) => {
              if (prev.some((userExercise) => userExercise.id === newExercise.id)) {
                return prev;
              }

              return [
                ...prev,
                {
                  id: newExercise.id,
                  name: newExercise.name,
                  muscleGroup: newExercise.muscleGroup,
                  description: newExercise.description,
                  libraryId: newExercise.libraryId,
                },
              ];
            });
            onSelect({
              id: newExercise.id,
              name: newExercise.name,
              muscleGroup: newExercise.muscleGroup,
              description: newExercise.description,
            });
            onClose();
          } catch (e) {
            console.error('Failed to create exercise from library:', e);
          }
        }}
      >
        <View className="flex-1 min-w-0">
          <View className="flex flex-row items-center gap-2">
            <Text className="text-darkText text-base font-medium truncate">{ex.name}</Text>
            {!isUser && (
              <View className="rounded-full bg-darkBorder px-2 py-0.5">
                <Text className="text-darkMuted text-xs">Library</Text>
              </View>
            )}
          </View>
          <Text className="text-darkMuted text-xs">{ex.muscleGroup}</Text>
        </View>
        <View className="ml-3 rounded-full bg-coral/20 px-3 py-1">
          <Text className="text-coral text-xs font-semibold">+ Add</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-darkBg">
      <View className="p-4 border-b border-darkBorder">
        <View className="mb-4 flex flex-row items-center justify-between">
          <Text className="text-darkText text-lg font-semibold">
            {showCreateForm ? 'Create Exercise' : 'Add Exercise'}
          </Text>
          <Pressable onPress={onClose} className="p-2">
            <Text className="text-darkMuted text-xl">✕</Text>
          </Pressable>
        </View>
        {!showCreateForm && (
          <View className="relative">
            <TextInput
              className="h-12 rounded-xl border border-darkBorder bg-darkCard px-4 pr-10 text-darkText"
              placeholder="Search exercises..."
              placeholderTextColor="#71717a"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {loading && (
              <View className="absolute right-3 top-3">
                <ActivityIndicator size="small" color="#f97316" />
              </View>
            )}
          </View>
        )}
      </View>

      {showCreateForm ? (
        <View className="flex-1 p-4">
          <View className="mb-4">
            <Text className="mb-2 text-darkText text-sm font-medium">Name *</Text>
            <TextInput
              className="h-12 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText"
              placeholder="e.g. Hammer Curls"
              placeholderTextColor="#71717a"
              value={createForm.name}
              onChangeText={(text) => setCreateForm((f) => ({ ...f, name: text }))}
              autoFocus
            />
          </View>

          <View className="mb-4">
            <Text className="mb-2 text-darkText text-sm font-medium">Muscle Group *</Text>
            <View className="flex-row flex-wrap gap-2">
              {MUSCLE_GROUPS.map((group) => (
                <Pressable
                  key={group}
                  onPress={() => setCreateForm((f) => ({ ...f, muscleGroup: group }))}
                  className={`rounded-full px-3 py-2 ${
                    createForm.muscleGroup === group
                      ? 'bg-coral border-coral'
                      : 'bg-darkCard border-darkBorder'
                  } border`}
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
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => {
              setShowCreateForm(true);
              setSearchQuery('');
            }}
            className="mx-4 mt-4 flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-coral bg-coral/10 py-3"
          >
            <Text className="text-coral text-sm font-semibold">+ Create Custom Exercise</Text>
          </Pressable>

          <FlatList
            data={listData}
            keyExtractor={(item, _index) =>
              item.type === 'header' ? `header-${item.title}` : item.data.id
            }
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={renderItem}
            ListEmptyComponent={
              <View className="flex items-center justify-center p-8">
                <Text className="text-darkMuted text-sm">No exercises found</Text>
              </View>
            }
          />
        </>
      )}
    </View>
  );
}
