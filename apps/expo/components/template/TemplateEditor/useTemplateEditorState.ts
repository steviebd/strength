import { useState, useCallback } from 'react';
import { useUndo } from '@/hooks/useUndo';
import type { SelectedExercise } from './types';

interface FormData {
  name: string;
  description: string;
  notes: string;
}

interface Errors {
  name?: string;
  exercises?: string;
}

interface AccessoryAddedWeights {
  [exerciseId: string]: number;
}

interface UseTemplateEditorStateReturn {
  formData: FormData;
  selectedExercises: SelectedExercise[];
  accessoryAddedWeights: AccessoryAddedWeights;
  errors: Errors;
  setErrors: (errors: Errors) => void;
  validateForm: () => boolean;
  setFormData: (data: Partial<FormData>) => void;
  setSelectedExercises: (exercises: SelectedExercise[]) => void;
  addExercise: (exercise: SelectedExercise) => void;
  removeExercise: (id: string) => void;
  updateExercise: (id: string, updates: Partial<SelectedExercise>) => void;
  reorderExercises: (fromIndex: number, toIndex: number) => void;
  setAccessoryAddedWeight: (exerciseId: string, weight: number) => void;
  pushUndo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  handleUndo: () => void;
  handleRedo: () => void;
  reset: () => void;
}

export function useTemplateEditorState(): UseTemplateEditorStateReturn {
  const [formData, setFormDataState] = useState<FormData>({
    name: '',
    description: '',
    notes: '',
  });

  const [selectedExercises, setSelectedExercisesState] = useState<SelectedExercise[]>([]);
  const [accessoryAddedWeights, setAccessoryAddedWeightsState] = useState<AccessoryAddedWeights>(
    {},
  );
  const [errors, setErrors] = useState<Errors>({});

  const undoState = useUndo({
    exercises: selectedExercises,
    formData,
    accessoryWeights: accessoryAddedWeights,
  });

  const setFormData = useCallback((data: Partial<FormData>) => {
    setFormDataState((prev) => ({ ...prev, ...data }));
  }, []);

  const validateForm = useCallback((): boolean => {
    const newErrors: Errors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Template name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.name]);

  const addExercise = useCallback((exercise: SelectedExercise) => {
    setSelectedExercisesState((prev) => [...prev, exercise]);
  }, []);

  const removeExercise = useCallback((id: string) => {
    setSelectedExercisesState((prev) => prev.filter((e) => e.id !== id));
    setAccessoryAddedWeightsState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const updateExercise = useCallback((id: string, updates: Partial<SelectedExercise>) => {
    setSelectedExercisesState((prev) => prev.map((e) => (e.id === id ? { ...e, ...updates } : e)));
  }, []);

  const reorderExercises = useCallback((fromIndex: number, toIndex: number) => {
    setSelectedExercisesState((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return next;
    });
  }, []);

  const setAccessoryAddedWeight = useCallback((exerciseId: string, weight: number) => {
    setAccessoryAddedWeightsState((prev) => ({ ...prev, [exerciseId]: weight }));
  }, []);

  const pushUndo = useCallback(() => {
    undoState.push({
      exercises: selectedExercises,
      formData,
      accessoryWeights: accessoryAddedWeights,
    });
  }, [undoState.push, selectedExercises, formData, accessoryAddedWeights]);

  const handleUndo = useCallback(() => {
    undoState.undo();
    const past = undoState.past;
    if (past.length > 0) {
      const lastState = past[past.length - 1];
      setSelectedExercisesState(lastState.exercises);
      setFormDataState(lastState.formData);
      setAccessoryAddedWeightsState(lastState.accessoryWeights);
    }
  }, [undoState]);

  const handleRedo = useCallback(() => {
    undoState.redo();
    const future = undoState.future;
    if (future.length > 0) {
      const nextState = future[0];
      setSelectedExercisesState(nextState.exercises);
      setFormDataState(nextState.formData);
      setAccessoryAddedWeightsState(nextState.accessoryWeights);
    }
  }, [undoState]);

  const reset = useCallback(() => {
    setFormDataState({ name: '', description: '', notes: '' });
    setSelectedExercisesState([]);
    setAccessoryAddedWeightsState({});
    setErrors({});
  }, []);

  return {
    formData,
    selectedExercises,
    accessoryAddedWeights,
    errors,
    setErrors,
    validateForm,
    setFormData,
    setSelectedExercises: setSelectedExercisesState,
    addExercise,
    removeExercise,
    updateExercise,
    reorderExercises,
    setAccessoryAddedWeight,
    pushUndo,
    canUndo: undoState.canUndo,
    canRedo: undoState.canRedo,
    handleUndo,
    handleRedo,
    reset,
  };
}
