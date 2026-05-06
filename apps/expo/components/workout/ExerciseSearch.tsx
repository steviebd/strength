import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { exerciseLibrary, type ExerciseLibraryItem as LibItem } from '@strength/db/client';
import {
  createCustomExercise,
  deleteCustomExercise,
  ensurePersistedExercise,
  listUserExercises,
  type UserExercise,
} from '@/lib/exercises';
import type { ExerciseLibraryItem } from '@/context/WorkoutSessionContext';
import { colors, radius, spacing, typography } from '@/theme';

interface ExerciseSearchProps {
  onSelect: (exercises: ExerciseLibraryItem[]) => void | Promise<void>;
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
  exerciseType: string;
  isAmrap: boolean;
}

function getUserSelectionKey(id: string) {
  return `user:${id}`;
}

function getLibrarySelectionKey(id: string) {
  return `library:${id}`;
}

function getListItemKey(item: ListItem) {
  return item.type === 'header'
    ? `header:${item.title}`
    : `${item.isUser ? 'user' : 'library'}:${item.data.id}`;
}

function formatExerciseType(type: string | null | undefined) {
  const value = type ?? 'weighted';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function ExerciseSearch({
  onSelect,
  onClose,
  excludeIds = [],
  visible = true,
}: ExerciseSearchProps) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [userExercises, setUserExercises] = useState<UserExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: '',
    muscleGroup: '',
    description: '',
    exerciseType: 'weighted',
    isAmrap: false,
  });
  const [creating, setCreating] = useState(false);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const scrollViewportHeight = useRef(0);
  const createScrollRef = useRef<ScrollView>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const descriptionFieldY = useRef(0);
  const confirmingRef = useRef(false);
  const longPressedSelectionKey = useRef<string | null>(null);

  const handleClose = () => {
    if (confirmingRef.current) {
      return;
    }
    setPendingSelection([]);
    onClose();
  };

  useEffect(() => {
    if (!visible) {
      confirmingRef.current = false;
      setConfirming(false);
      setPendingSelection([]);
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
          // no-op
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
      setUserExercises((prev) => {
        const exercise = {
          id: newExercise.id,
          name: newExercise.name,
          muscleGroup: newExercise.muscleGroup,
          description: newExercise.description,
          libraryId: newExercise.libraryId ?? null,
          exerciseType: newExercise.exerciseType,
          isAmrap: newExercise.isAmrap,
        };
        return [exercise, ...prev.filter((existing) => existing.id !== newExercise.id)];
      });
      setPendingSelection((prev) => {
        const selectionKey = getUserSelectionKey(newExercise.id);
        return prev.includes(selectionKey) ? prev : [...prev, selectionKey];
      });
      setShowCreateForm(false);
      setCreateForm({
        name: '',
        muscleGroup: '',
        description: '',
        exerciseType: 'weighted',
        isAmrap: false,
      });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create exercise');
    } finally {
      setCreating(false);
    }
  }

  function handleSelectMuscleGroup(group: string) {
    setCreateForm((f) => ({ ...f, muscleGroup: group }));
    requestAnimationFrame(() => {
      createScrollRef.current?.scrollTo({
        y: Math.max(0, descriptionFieldY.current - spacing.lg),
        animated: true,
      });
      descriptionInputRef.current?.focus();
    });
  }

  function scrollDescriptionIntoView() {
    createScrollRef.current?.scrollTo({
      y: Math.max(0, descriptionFieldY.current - spacing.lg),
      animated: true,
    });
  }

  function toggleSelection(selectionKey: string) {
    setPendingSelection((prev) =>
      prev.includes(selectionKey)
        ? prev.filter((id) => id !== selectionKey)
        : [...prev, selectionKey],
    );
  }

  async function handleDeleteCustomExercise(exercise: CombinedExercise) {
    if (deletingExerciseId) {
      return;
    }

    setDeletingExerciseId(exercise.id);
    setCreateError(null);
    try {
      await deleteCustomExercise(exercise.id);
      const selectionKey = getUserSelectionKey(exercise.id);
      setPendingSelection((prev) => prev.filter((id) => id !== selectionKey));
      setUserExercises((prev) => prev.filter((existing) => existing.id !== exercise.id));
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to delete exercise');
    } finally {
      setDeletingExerciseId(null);
    }
  }

  function handleUserExercisePress(exercise: CombinedExercise, selectionKey: string) {
    const isSelected = pendingSelection.includes(selectionKey);
    Alert.alert(exercise.name, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: isSelected ? 'Remove from workout' : 'Add to workout',
        onPress: () => toggleSelection(selectionKey),
      },
      {
        text: 'Delete exercise',
        style: 'destructive',
        onPress: () => void handleDeleteCustomExercise(exercise),
      },
    ]);
  }

  function handleConfirm() {
    if (confirmingRef.current || pendingSelection.length === 0) {
      return;
    }

    confirmingRef.current = true;
    setConfirming(true);

    void (async () => {
      try {
        const selectedExercises: ExerciseLibraryItem[] = [];

        for (const selectionKey of pendingSelection) {
          if (selectionKey.startsWith('user:')) {
            const userId = selectionKey.slice('user:'.length);
            const userEx = userExercises.find((exercise) => exercise.id === userId);

            if (!userEx) {
              continue;
            }

            selectedExercises.push({
              id: userEx.id,
              libraryId: userEx.libraryId,
              name: userEx.name,
              muscleGroup: userEx.muscleGroup ?? '',
              description: userEx.description ?? '',
              exerciseType: userEx.exerciseType ?? 'weighted',
              isAmrap: userEx.isAmrap ?? false,
            });
            continue;
          }

          if (!selectionKey.startsWith('library:')) {
            continue;
          }

          const libraryId = selectionKey.slice('library:'.length);
          const libraryExercise = exerciseLibrary.find((exercise) => exercise.id === libraryId);

          if (!libraryExercise) {
            continue;
          }

          try {
            const persistedExercise = await ensurePersistedExercise(libraryExercise);
            selectedExercises.push({
              id: persistedExercise.id,
              libraryId: persistedExercise.libraryId,
              name: persistedExercise.name,
              muscleGroup: persistedExercise.muscleGroup ?? '',
              description: persistedExercise.description ?? '',
              exerciseType:
                libraryExercise.exerciseType ?? persistedExercise.exerciseType ?? 'weighted',
              isAmrap: persistedExercise.isAmrap ?? false,
            });
          } catch {
            selectedExercises.push({
              id: libraryExercise.id,
              libraryId: libraryExercise.id,
              name: libraryExercise.name,
              muscleGroup: libraryExercise.muscleGroup,
              description: libraryExercise.description,
              exerciseType: (libraryExercise as any).exerciseType ?? 'weighted',
              isAmrap: (libraryExercise as any).isAmrap ?? false,
            });
          }
        }

        await onSelect(selectedExercises);
        setPendingSelection([]);
        onClose();
      } catch (e) {
        setCreateError(e instanceof Error ? e.message : 'Failed to add exercise');
        confirmingRef.current = false;
        setConfirming(false);
      }
    })();
  }

  const excludeIdSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const excludedLibraryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const userExercise of userExercises) {
      if (userExercise.libraryId && excludeIdSet.has(userExercise.id)) {
        ids.add(userExercise.libraryId);
      }
    }
    return ids;
  }, [userExercises, excludeIdSet]);

  const filteredUserExercises = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return userExercises.filter(
      (ex) =>
        ex.libraryId === null && ex.name.toLowerCase().includes(query) && !excludeIdSet.has(ex.id),
    );
  }, [userExercises, searchQuery, excludeIdSet]);

  const filteredLibraryExercises = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return exerciseLibrary.filter(
      (ex) =>
        ex.name.toLowerCase().includes(query) &&
        !excludeIdSet.has(ex.id) &&
        !excludedLibraryIds.has(ex.id),
    );
  }, [searchQuery, excludeIdSet, excludedLibraryIds]);

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
    const selectionKey = isUser ? getUserSelectionKey(ex.id) : getLibrarySelectionKey(ex.id);
    const isSelected = pendingSelection.includes(selectionKey);
    return (
      <Pressable
        testID={`workout-exercise-${isUser ? 'user' : 'library'}-${ex.id}`}
        accessibilityLabel={`workout-exercise-${ex.name}`}
        disabled={deletingExerciseId === ex.id}
        style={({ pressed }) => [
          styles.exerciseRow,
          styles.exerciseRowBorder,
          isSelected ? styles.exerciseRowSelected : styles.exerciseRowDefault,
          pressed && styles.exerciseRowPressed,
        ]}
        onPress={() => {
          if (longPressedSelectionKey.current === selectionKey) {
            longPressedSelectionKey.current = null;
            return;
          }
          toggleSelection(selectionKey);
        }}
        onLongPress={
          isUser
            ? () => {
                longPressedSelectionKey.current = selectionKey;
                setTimeout(() => {
                  if (longPressedSelectionKey.current === selectionKey) {
                    longPressedSelectionKey.current = null;
                  }
                }, 1000);
                handleUserExercisePress(ex, selectionKey);
              }
            : undefined
        }
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
          <View style={styles.exerciseMetaRow}>
            <Text style={styles.muscleGroupText}>{ex.muscleGroup}</Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{formatExerciseType(ex.exerciseType)}</Text>
            </View>
          </View>
        </View>
        {deletingExerciseId === ex.id ? (
          <View style={styles.addBadge}>
            <Text style={styles.addBadgeText}>Deleting...</Text>
          </View>
        ) : isSelected ? (
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
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
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
              testID="workout-exercise-search"
              style={styles.searchInput}
              placeholder="Search exercises..."
              placeholderTextColor={colors.placeholderText}
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
        <KeyboardAvoidingView
          style={styles.createForm}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={insets.top}
        >
          <ScrollView
            ref={createScrollRef}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.createFormContent,
              { paddingBottom: insets.bottom + spacing.xxl * 4 },
            ]}
          >
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Hammer Curls"
                placeholderTextColor={colors.placeholderText}
                value={createForm.name}
                onChangeText={(text) => setCreateForm((f) => ({ ...f, name: text }))}
                returnKeyType="next"
                onSubmitEditing={scrollDescriptionIntoView}
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
                      key={`muscle-group:${group}`}
                      onPress={() => handleSelectMuscleGroup(group)}
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

            <View
              style={styles.formField}
              onLayout={(event) => {
                descriptionFieldY.current = event.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.formLabel}>Description (optional)</Text>
              <TextInput
                ref={descriptionInputRef}
                style={[styles.formInput, styles.formInputMultiline]}
                placeholder="Add notes about form, equipment, etc."
                placeholderTextColor={colors.placeholderText}
                value={createForm.description}
                onChangeText={(text) => setCreateForm((f) => ({ ...f, description: text }))}
                multiline
                onFocus={() => {
                  requestAnimationFrame(scrollDescriptionIntoView);
                }}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Exercise Type</Text>
              <View style={styles.typeGrid}>
                {(['weighted', 'bodyweight', 'timed', 'cardio', 'plyo'] as const).map((type) => {
                  const isSelected = createForm.exerciseType === type;
                  return (
                    <Pressable
                      key={`exercise-type:${type}`}
                      onPress={() => setCreateForm((f) => ({ ...f, exerciseType: type }))}
                      style={[
                        styles.typeChip,
                        isSelected ? styles.typeChipSelected : styles.typeChipDefault,
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeChipText,
                          isSelected ? styles.typeChipTextSelected : styles.typeChipTextDefault,
                        ]}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.formField, styles.amrapRow]}>
              <Text style={styles.formLabel}>AMRAP</Text>
              <Pressable
                onPress={() => setCreateForm((f) => ({ ...f, isAmrap: !f.isAmrap }))}
                style={[styles.amrapTrack, createForm.isAmrap && styles.amrapTrackOn]}
              >
                <View style={[styles.amrapThumb, createForm.isAmrap && styles.amrapThumbOn]} />
              </Pressable>
            </View>

            {createError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{createError}</Text>
              </View>
            )}
          </ScrollView>
          <View style={[styles.formFooter, { paddingBottom: insets.bottom + spacing.sm }]}>
            <Pressable
              onPress={() => {
                setShowCreateForm(false);
                setCreateForm({
                  name: '',
                  muscleGroup: '',
                  description: '',
                  exerciseType: 'weighted',
                  isAmrap: false,
                });
                setCreateError(null);
              }}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleCreateExercise}
              disabled={creating}
              style={({ pressed }) => [
                styles.createButton,
                pressed && styles.createButtonPressed,
                creating && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.createButtonText}>{creating ? 'Creating...' : 'Create'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : (
        <>
          <Pressable
            onPress={() => {
              setShowCreateForm(true);
              setSearchQuery('');
              setCreateError(null);
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
            keyExtractor={(item) => getListItemKey(item)}
            contentContainerStyle={{ paddingBottom: 140 }}
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
            <View style={[styles.selectionBar, { paddingBottom: insets.bottom + spacing.md }]}>
              <Text style={styles.selectionText}>{pendingSelection.length} selected</Text>
              <Pressable
                testID="workout-exercise-confirm"
                accessibilityLabel="workout-exercise-confirm"
                onPress={handleConfirm}
                disabled={confirming}
                style={styles.confirmButton}
              >
                <Text style={styles.confirmButtonText}>
                  {confirming
                    ? 'Adding...'
                    : `Add ${pendingSelection.length} Exercise${pendingSelection.length > 1 ? 's' : ''}`}
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
  },
  exerciseMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: 2,
  },
  typeBadge: {
    borderRadius: radius.sm,
    backgroundColor: 'rgba(239,111,79,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,111,79,0.28)',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  typeBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: typography.fontWeights.semibold,
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
    color: colors.text,
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
  },
  createFormContent: {
    padding: spacing.md,
  },
  formFooter: {
    flexDirection: 'row',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
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
    color: colors.text,
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
    color: colors.error,
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
    color: colors.text,
    textAlign: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonDisabled: {
    opacity: 0.7,
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
    color: colors.text,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  typeChip: {
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  typeChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  typeChipDefault: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  typeChipText: {
    fontSize: typography.fontSizes.sm,
  },
  typeChipTextSelected: {
    color: colors.text,
  },
  typeChipTextDefault: {
    color: colors.text,
  },
  amrapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amrapTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.border,
    padding: 2,
  },
  amrapTrackOn: {
    backgroundColor: colors.accent,
  },
  amrapThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    transform: [{ translateX: 0 }],
  },
  amrapThumbOn: {
    transform: [{ translateX: 20 }],
  },
});
