import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  LayoutChangeEvent,
} from 'react-native';
import { exerciseLibrary, type ExerciseLibraryItem as LibItem } from '@strength/db';
import {
  createCustomExercise,
  ensurePersistedExercise,
  listUserExercises,
  type UserExercise,
} from '@/lib/exercises';
import type { ExerciseLibraryItem } from '@/context/WorkoutSessionContext';
import { colors, radius, spacing, typography } from '@/theme';

interface ExerciseSearchProps {
  onSelect: (exercises: ExerciseLibraryItem[]) => void;
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
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const scrollViewportHeight = useRef(0);

  const handleClose = () => {
    setPendingSelection([]);
    onClose();
  };

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
      onSelect([
        {
          id: newExercise.id,
          name: newExercise.name,
          muscleGroup: newExercise.muscleGroup ?? '',
          description: newExercise.description ?? '',
        },
      ]);
      handleClose();
    } catch (e) {
      console.error('Create exercise error:', e);
      setCreateError(e instanceof Error ? e.message : 'Failed to create exercise');
    } finally {
      setCreating(false);
    }
  }

  function handleConfirm() {
    const selectedExercises: ExerciseLibraryItem[] = [];
    for (const id of pendingSelection) {
      const userEx = filteredUserExercises.find((ex) => ex.id === id);
      if (userEx) {
        selectedExercises.push({
          id: userEx.id,
          name: userEx.name,
          muscleGroup: userEx.muscleGroup ?? '',
          description: userEx.description ?? '',
        });
      } else {
        const libEx = filteredLibraryExercises.find((ex) => ex.id === id);
        if (libEx) {
          selectedExercises.push({
            id: libEx.id,
            name: libEx.name,
            muscleGroup: libEx.muscleGroup,
            description: libEx.description,
          });
        }
      }
    }
    onSelect(selectedExercises);
    setPendingSelection([]);
    onClose();
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
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>{item.title}</Text>
        </View>
      );
    }
    const ex = item.data;
    const isUser = item.isUser;
    const isSelected = pendingSelection.includes(ex.id);
    return (
      <Pressable
        style={({ pressed }) => [
          styles.exerciseRow,
          styles.exerciseRowBorder,
          isSelected ? styles.exerciseRowSelected : styles.exerciseRowDefault,
          pressed && styles.exerciseRowPressed,
        ]}
        onPress={async () => {
          if (isUser) {
            setPendingSelection((prev) =>
              prev.includes(ex.id) ? prev.filter((id) => id !== ex.id) : [...prev, ex.id],
            );
            return;
          }
          const existingUserExercise = userExercises.find((ue) => ue.libraryId === ex.id);
          if (existingUserExercise) {
            if (excludeIds.includes(existingUserExercise.id)) {
              return;
            }
            setPendingSelection((prev) =>
              prev.includes(existingUserExercise.id)
                ? prev.filter((id) => id !== existingUserExercise.id)
                : [...prev, existingUserExercise.id],
            );
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
            setPendingSelection((prev) =>
              prev.includes(newExercise.id)
                ? prev.filter((id) => id !== newExercise.id)
                : [...prev, newExercise.id],
            );
          } catch (e) {
            console.error('Failed to create exercise from library:', e);
          }
        }}
      >
        <View style={styles.exerciseInfo}>
          <View style={styles.exerciseNameRow}>
            <Text style={styles.exerciseName} numberOfLines={1}>
              {ex.name}
            </Text>
            {!isUser && (
              <View style={styles.libraryBadge}>
                <Text style={styles.libraryBadgeText}>Library</Text>
              </View>
            )}
          </View>
          <Text style={styles.muscleGroupText}>{ex.muscleGroup}</Text>
        </View>
        {isSelected ? (
          <View style={styles.selectedBadge}>
            <Text style={styles.selectedBadgeText}>✓</Text>
          </View>
        ) : (
          <View style={styles.addBadge}>
            <Text style={styles.addBadgeText}>+ Add</Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>
            {showCreateForm ? 'Create Exercise' : 'Add Exercise'}
          </Text>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </Pressable>
        </View>
        {!showCreateForm && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor="#71717a"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {loading && (
              <View style={styles.loadingIndicator}>
                <ActivityIndicator size="small" color="#f97316" />
              </View>
            )}
          </View>
        )}
      </View>

      {showCreateForm ? (
        <View style={styles.createForm}>
          <View style={styles.formField}>
            <Text style={styles.formLabel}>Name *</Text>
            <TextInput
              style={styles.formInput}
              placeholder="e.g. Hammer Curls"
              placeholderTextColor="#71717a"
              value={createForm.name}
              onChangeText={(text) => setCreateForm((f) => ({ ...f, name: text }))}
              autoFocus
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Muscle Group *</Text>
            <View style={styles.muscleGroupGrid}>
              {MUSCLE_GROUPS.map((group) => {
                const isSelected = createForm.muscleGroup === group;
                return (
                  <Pressable
                    key={group}
                    onPress={() => setCreateForm((f) => ({ ...f, muscleGroup: group }))}
                    style={[
                      styles.muscleGroupChip,
                      isSelected ? styles.muscleGroupChipSelected : styles.muscleGroupChipDefault,
                    ]}
                  >
                    <Text
                      style={[
                        styles.muscleGroupChipText,
                        isSelected
                          ? styles.muscleGroupChipTextSelected
                          : styles.muscleGroupChipTextDefault,
                      ]}
                    >
                      {group}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.formInput, styles.formInputMultiline]}
              placeholder="Add notes about form, equipment, etc."
              placeholderTextColor="#71717a"
              value={createForm.description}
              onChangeText={(text) => setCreateForm((f) => ({ ...f, description: text }))}
              multiline
            />
          </View>

          {createError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{createError}</Text>
            </View>
          )}

          <View style={styles.formButtons}>
            <Pressable
              onPress={() => {
                setShowCreateForm(false);
                setCreateForm({ name: '', muscleGroup: '', description: '' });
                setCreateError(null);
              }}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleCreateExercise}
              disabled={creating}
              style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
            >
              <Text style={styles.createButtonText}>{creating ? 'Creating...' : 'Create'}</Text>
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
            style={({ pressed }) => [
              styles.createExerciseButton,
              pressed && styles.createExerciseButtonPressed,
            ]}
          >
            <Text style={styles.createExerciseButtonText}>+ Create Custom Exercise</Text>
          </Pressable>

          <FlatList
            data={listData}
            keyExtractor={(item, _index) =>
              item.type === 'header' ? `header-${item.title}` : item.data.id
            }
            contentContainerStyle={{ paddingBottom: 100 }}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No exercises found</Text>
              </View>
            }
            onLayout={(e: LayoutChangeEvent) => {
              scrollViewportHeight.current = e.nativeEvent.layout.height;
            }}
          />

          {pendingSelection.length > 0 && (
            <View style={styles.selectionBar}>
              <Text style={styles.selectionText}>{pendingSelection.length} selected</Text>
              <Pressable onPress={handleConfirm} style={styles.confirmButton}>
                <Text style={styles.confirmButtonText}>
                  Add {pendingSelection.length} Exercise{pendingSelection.length > 1 ? 's' : ''}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  closeButton: {
    padding: spacing.sm,
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  searchContainer: {
    position: 'relative',
  },
  searchInput: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: typography.fontSizes.base,
    color: colors.text,
  },
  loadingIndicator: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  headerRow: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    color: colors.textMuted,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  exerciseRowBorder: {
    borderBottomWidth: 1,
  },
  exerciseRowSelected: {
    backgroundColor: 'rgba(239,111,79,0.1)',
    borderBottomColor: 'rgba(239,111,79,0.5)',
  },
  exerciseRowDefault: {
    backgroundColor: colors.surface,
    borderBottomColor: 'rgba(63,63,70,0.5)',
  },
  exerciseRowPressed: {
    opacity: 0.8,
  },
  exerciseInfo: {
    flex: 1,
    minWidth: 0,
  },
  exerciseNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  exerciseName: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
  },
  libraryBadge: {
    borderRadius: 9999,
    backgroundColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  libraryBadgeText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  muscleGroupText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  selectedBadge: {
    marginLeft: spacing.md,
    borderRadius: 9999,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  selectedBadgeText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: '#ffffff',
  },
  addBadge: {
    marginLeft: spacing.md,
    borderRadius: 9999,
    backgroundColor: 'rgba(239,111,79,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  addBadgeText: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.accent,
  },
  createForm: {
    flex: 1,
    padding: spacing.md,
  },
  formField: {
    marginBottom: spacing.md,
  },
  formLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  formInput: {
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: typography.fontSizes.base,
    color: colors.text,
  },
  formInputMultiline: {
    height: 80,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  muscleGroupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  muscleGroupChip: {
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  muscleGroupChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  muscleGroupChipDefault: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  muscleGroupChipText: {
    fontSize: typography.fontSizes.sm,
  },
  muscleGroupChipTextSelected: {
    color: '#ffffff',
  },
  muscleGroupChipTextDefault: {
    color: colors.text,
  },
  errorBox: {
    borderRadius: radius.sm,
    backgroundColor: 'rgba(239,68,68,0.2)',
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: typography.fontSizes.sm,
    color: '#f87171',
  },
  formButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  cancelButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
  },
  cancelButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    textAlign: 'center',
  },
  createButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingVertical: 12,
  },
  createButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.95 }],
  },
  createButtonText: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: '#ffffff',
    textAlign: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  createExerciseButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accent,
    backgroundColor: 'rgba(239,111,79,0.1)',
    paddingVertical: 12,
  },
  createExerciseButtonPressed: {
    opacity: 0.8,
  },
  createExerciseButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.accent,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyStateText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionText: {
    fontSize: typography.fontSizes.base,
    color: colors.text,
  },
  confirmButton: {
    borderRadius: 9999,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  confirmButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: '#ffffff',
  },
});
