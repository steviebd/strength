import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { ScreenScrollView } from '@/components/ui/Screen';
import { exerciseLibrary, type ExerciseLibraryItem } from '@strength/db';
import { ensurePersistedExercise } from '@/lib/exercises';
import { colors, spacing, radius } from '@/theme';
import {
  useExerciseSearch,
  getUserSelectionKey,
  getLibrarySelectionKey,
} from '@/hooks/useExerciseSearch';

interface ExercisePickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercises: Array<{ id: string; name: string; muscleGroup: string | null }>) => void;
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

export function ExercisePicker({
  visible,
  onClose,
  onSelect,
  selectedIds = [],
}: ExercisePickerProps) {
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState('All');

  const {
    searchQuery,
    setSearchQuery,
    userExercises,
    loading,
    pendingSelection,
    setPendingSelection,
    showCreateForm,
    setShowCreateForm,
    createForm,
    setCreateForm,
    creating,
    createError,
    setCreateError,
    filteredUserExercises,
    filteredLibraryExercises,
    handleCreateExercise,
    toggleSelection,
  } = useExerciseSearch({
    visible,
    excludeIds: selectedIds,
    filterMuscleGroup: selectedMuscleGroup,
  });

  const handleToggleUser = (exerciseId: string) => {
    toggleSelection(getUserSelectionKey(exerciseId));
  };

  const handleToggleLibrary = (exerciseId: string) => {
    if (selectedIds.includes(exerciseId)) {
      return;
    }
    toggleSelection(getLibrarySelectionKey(exerciseId));
  };

  const handleConfirm = () => {
    void (async () => {
      const selectedExercises: Array<{ id: string; name: string; muscleGroup: string | null }> = [];

      for (const selectionKey of pendingSelection) {
        if (selectionKey.startsWith('user:')) {
          const userId = selectionKey.slice('user:'.length);
          const selectedUserExercise = userExercises.find((exercise) => exercise.id === userId);

          if (!selectedUserExercise) {
            continue;
          }

          selectedExercises.push({
            id: selectedUserExercise.id,
            name: selectedUserExercise.name,
            muscleGroup: selectedUserExercise.muscleGroup,
          });
          continue;
        }

        if (!selectionKey.startsWith('library:')) {
          continue;
        }

        const libraryId = selectionKey.slice('library:'.length);
        const selectedLibraryExercise = exerciseLibrary.find(
          (exercise) => exercise.id === libraryId,
        );

        if (!selectedLibraryExercise) {
          continue;
        }

        try {
          const persistedExercise = await ensurePersistedExercise(selectedLibraryExercise);
          selectedExercises.push({
            id: persistedExercise.id,
            name: persistedExercise.name,
            muscleGroup: persistedExercise.muscleGroup,
          });
        } catch (e) {
          setCreateError(e instanceof Error ? e.message : 'Failed to add exercise');
        }
      }

      onSelect(selectedExercises);
      setPendingSelection([]);
      onClose();
    })();
  };

  const handleClose = () => {
    setPendingSelection([]);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>
              {showCreateForm ? 'Create Exercise' : 'Add Exercise'}
            </Text>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>
          {!showCreateForm && (
            <>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search exercises..."
                  placeholderTextColor={colors.placeholderText}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {loading && (
                  <View style={styles.searchLoader}>
                    <ActivityIndicator size="small" color="#f97316" />
                  </View>
                )}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroll}
                contentContainerStyle={styles.filterContent}
              >
                {MUSCLE_GROUPS.map((group) => (
                  <Pressable
                    key={`muscle-filter:${group}`}
                    onPress={() => setSelectedMuscleGroup(group)}
                    style={[
                      styles.filterTab,
                      selectedMuscleGroup === group && styles.filterTabActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterTabText,
                        selectedMuscleGroup === group && styles.filterTabTextActive,
                      ]}
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
          <ScreenScrollView bottomInset={48} horizontalPadding={16}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Name *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="e.g. Hammer Curls"
                placeholderTextColor={colors.placeholderText}
                value={createForm.name}
                onChangeText={(text) => setCreateForm((f) => ({ ...f, name: text }))}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Muscle Group *</Text>
              <View style={styles.muscleGroupGrid}>
                {CREATE_MUSCLE_GROUPS.map((group) => (
                  <Pressable
                    key={`create-muscle-group:${group}`}
                    onPress={() => setCreateForm((f) => ({ ...f, muscleGroup: group }))}
                    style={[
                      styles.muscleGroupChip,
                      createForm.muscleGroup === group && styles.muscleGroupChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.muscleGroupChipText,
                        createForm.muscleGroup === group && styles.muscleGroupChipTextActive,
                      ]}
                    >
                      {group}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.formInput, styles.formInputMultiline]}
                placeholder="Add notes about form, equipment, etc."
                placeholderTextColor={colors.placeholderText}
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
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateExercise}
                disabled={creating}
                style={styles.createButton}
              >
                <Text style={styles.createButtonText}>{creating ? 'Creating...' : 'Create'}</Text>
              </Pressable>
            </View>
          </ScreenScrollView>
        ) : (
          <>
            <Pressable
              onPress={() => {
                setShowCreateForm(true);
                setSearchQuery('');
                setSelectedMuscleGroup('All');
              }}
              style={styles.createExercisePrompt}
            >
              <Text style={styles.createExercisePromptText}>+ Create Custom Exercise</Text>
            </Pressable>

            <ScreenScrollView bottomInset={132} horizontalPadding={16}>
              {filteredUserExercises.length === 0 && filteredLibraryExercises.length === 0 ? (
                <View style={styles.noResults}>
                  <Text style={styles.noResultsText}>No exercises found</Text>
                </View>
              ) : (
                <>
                  {filteredUserExercises.length > 0 && (
                    <>
                      <Text style={styles.sectionLabel}>Your Exercises</Text>
                      {filteredUserExercises.map((exercise) => {
                        const isSelected = pendingSelection.includes(
                          getUserSelectionKey(exercise.id),
                        );
                        return (
                          <Pressable
                            key={`user:${exercise.id}`}
                            onPress={() => handleToggleUser(exercise.id)}
                            style={[styles.exerciseItem, isSelected && styles.exerciseItemSelected]}
                          >
                            <View style={styles.exerciseInfo}>
                              <Text style={styles.exerciseName}>{exercise.name}</Text>
                              <Text style={styles.exerciseMuscle}>
                                {exercise.muscleGroup || 'No muscle group'}
                              </Text>
                            </View>
                            {isSelected && (
                              <View style={styles.selectedBadge}>
                                <Text style={styles.selectedBadgeText}>✓</Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                  {filteredLibraryExercises.length > 0 && (
                    <>
                      <Text style={styles.sectionLabel}>Exercise Library</Text>
                      {filteredLibraryExercises.map((exercise) => {
                        const isSelected = pendingSelection.includes(
                          getLibrarySelectionKey(exercise.id),
                        );
                        return (
                          <Pressable
                            key={`library:${exercise.id}`}
                            onPress={() => handleToggleLibrary(exercise.id)}
                            style={[styles.exerciseItem, isSelected && styles.exerciseItemSelected]}
                          >
                            <View style={styles.exerciseInfo}>
                              <Text style={styles.exerciseName}>{exercise.name}</Text>
                              <Text style={styles.exerciseMuscle}>{exercise.muscleGroup}</Text>
                              <Text style={styles.exerciseDescription} numberOfLines={2}>
                                {exercise.description}
                              </Text>
                            </View>
                            {isSelected && (
                              <View style={styles.selectedBadge}>
                                <Text style={styles.selectedBadgeText}>✓</Text>
                              </View>
                            )}
                          </Pressable>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </ScreenScrollView>

            {pendingSelection.length > 0 && (
              <View style={styles.selectionBar}>
                <Text style={styles.selectionCount}>{pendingSelection.length} selected</Text>
                <Pressable onPress={handleConfirm} style={styles.addSelectedButton}>
                  <Text style={styles.addSelectedButtonText}>
                    Add {pendingSelection.length} Exercise{pendingSelection.length > 1 ? 's' : ''}
                  </Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: colors.surfaceAlt,
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.text,
  },
  searchContainer: {
    position: 'relative',
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  searchLoader: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  filterScroll: {
    marginTop: spacing.md,
  },
  filterContent: {
    gap: spacing.sm,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 9999,
    backgroundColor: colors.surfaceAlt,
  },
  filterTabActive: {
    backgroundColor: colors.accent,
  },
  filterTabText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  filterTabTextActive: {
    color: colors.text,
    fontWeight: '500',
  },
  createExercisePrompt: {
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
    paddingVertical: spacing.md,
  },
  createExercisePromptText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  noResults: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  noResultsText: {
    color: colors.textMuted,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.6,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  exerciseItem: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  exerciseItemSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(239,111,79,0.1)',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  exerciseMuscle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  exerciseDescription: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  selectedBadge: {
    marginLeft: spacing.sm,
    borderRadius: 9999,
    backgroundColor: 'rgba(239,111,79,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  selectedBadgeText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  selectionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectionCount: {
    color: colors.text,
  },
  addSelectedButton: {
    borderRadius: 9999,
    backgroundColor: colors.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  addSelectedButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  formInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 48,
    fontSize: 15,
    color: colors.text,
  },
  formInputMultiline: {
    minHeight: 80,
    height: 'auto',
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  muscleGroupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  muscleGroupChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  muscleGroupChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  muscleGroupChipText: {
    fontSize: 14,
    color: colors.text,
  },
  muscleGroupChipTextActive: {
    color: colors.text,
  },
  errorBox: {
    borderRadius: radius.sm,
    backgroundColor: 'rgba(239,68,68,0.2)',
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
  },
  formButtons: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  createButton: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
});
