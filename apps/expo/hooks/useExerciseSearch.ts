import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { exerciseLibrary, inferExerciseType, type ExerciseType } from '@strength/db/client';
import { createCustomExercise, listUserExercises, type UserExercise } from '@/lib/exercises';

export function getUserSelectionKey(id: string) {
  return `user:${id}`;
}

export function getLibrarySelectionKey(id: string) {
  return `library:${id}`;
}

interface UseExerciseSearchOptions {
  visible: boolean;
  excludeIds?: string[];
  filterMuscleGroup?: string | null;
}

export function useExerciseSearch({
  visible,
  excludeIds = [],
  filterMuscleGroup = null,
}: UseExerciseSearchOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userExercises, setUserExercises] = useState<UserExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<{
    name: string;
    muscleGroup: string;
    exerciseType: ExerciseType;
    description: string;
  }>({ name: '', muscleGroup: '', exerciseType: 'weighted', description: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

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

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => fetchUserExercises(searchQuery), 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      controller.abort();
    };
  }, [searchQuery, visible]);

  useEffect(() => {
    if (!visible) {
      setPendingSelection([]);
    }
  }, [visible]);

  const filteredUserExercises = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return userExercises.filter((ex) => {
      const matchesSearch = ex.name.toLowerCase().includes(query);
      const matchesMuscle =
        !filterMuscleGroup || filterMuscleGroup === 'All' || ex.muscleGroup === filterMuscleGroup;
      return ex.libraryId === null && matchesSearch && matchesMuscle && !excludeIds.includes(ex.id);
    });
  }, [userExercises, searchQuery, filterMuscleGroup, excludeIds]);

  const filteredLibraryExercises = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return exerciseLibrary.filter((ex) => {
      const matchesSearch =
        ex.name.toLowerCase().includes(query) || ex.description.toLowerCase().includes(query);
      const matchesMuscle =
        !filterMuscleGroup || filterMuscleGroup === 'All' || ex.muscleGroup === filterMuscleGroup;
      const isAlreadySelectedByPersistedId = userExercises.some(
        (userExercise) => userExercise.libraryId === ex.id && excludeIds.includes(userExercise.id),
      );
      return (
        matchesSearch &&
        matchesMuscle &&
        !excludeIds.includes(ex.id) &&
        !isAlreadySelectedByPersistedId
      );
    });
  }, [searchQuery, filterMuscleGroup, excludeIds, userExercises]);

  const handleCreateExercise = useCallback(async () => {
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
        {
          id: newExercise.id,
          name: newExercise.name,
          muscleGroup: newExercise.muscleGroup,
          description: newExercise.description,
          exerciseType: newExercise.exerciseType,
          isAmrap: newExercise.isAmrap,
          libraryId: newExercise.libraryId,
        },
        ...prev,
      ]);
      setPendingSelection((prev) => {
        const selectionKey = getUserSelectionKey(newExercise.id);
        return prev.includes(selectionKey) ? prev : [...prev, selectionKey];
      });
      setShowCreateForm(false);
      setCreateForm({ name: '', muscleGroup: '', exerciseType: 'weighted', description: '' });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create exercise');
    } finally {
      setCreating(false);
    }
  }, [createForm]);

  const toggleSelection = useCallback((selectionKey: string) => {
    setPendingSelection((prev) =>
      prev.includes(selectionKey)
        ? prev.filter((id) => id !== selectionKey)
        : [...prev, selectionKey],
    );
  }, []);

  const isSelected = useCallback(
    (selectionKey: string) => pendingSelection.includes(selectionKey),
    [pendingSelection],
  );

  return {
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
    inferExerciseType,
    handleCreateExercise,
    toggleSelection,
    isSelected,
  };
}
