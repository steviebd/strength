import { useState, useCallback, useRef } from 'react';
import { authClient } from '@/lib/auth-client';
import { apiFetch } from '@/lib/api';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { generateId } from '@strength/db';
import type { Template, TemplateExercise } from '@/components/template/TemplateEditor/types';
export type { Template, TemplateExercise };

interface UseTemplateEditorReturn {
  template: Template | null;
  exercises: TemplateExercise[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  autoSaveStatus: 'idle' | 'saving' | 'saved';
  weightUnit: 'kg' | 'lbs';
  loadTemplate: (templateId: string) => Promise<void>;
  saveTemplate: () => Promise<Template | null>;
  deleteTemplate: () => Promise<boolean>;
  addExercise: (exercise: {
    id: string;
    name: string;
    muscleGroup: string | null;
  }) => Promise<void>;
  removeExercise: (exerciseId: string) => void;
  updateExercise: (exerciseId: string, updates: Partial<TemplateExercise>) => void;
  reorderExercises: (fromIndex: number, toIndex: number) => void;
  setTemplateName: (name: string) => void;
  setTemplateDescription: (description: string) => void;
  setTemplateNotes: (notes: string) => void;
  fetchTemplates: () => Promise<Template[]>;
  createEmptyTemplate: () => Template;
}

interface LastWorkoutResponse {
  exerciseId: string;
  workoutDate: string | null;
  sets: { weight: number | null; reps: number | null; rpe: number | null }[];
}

export function useTemplateEditor(): UseTemplateEditorReturn {
  const session = authClient.useSession();
  const [template, setTemplate] = useState<Template | null>(null);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const { weightUnit } = useUserPreferences();
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const templateNameRef = useRef('');
  const templateDescriptionRef = useRef('');
  const templateNotesRef = useRef('');

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    setAutoSaveStatus('idle');
    autoSaveTimerRef.current = setTimeout(async () => {
      if (template?.id) {
        setAutoSaveStatus('saving');
        await saveTemplate();
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      }
    }, 1500);
  }, [template?.id]);

  const loadTemplate = useCallback(
    async (templateId: string) => {
      if (!session.data?.user) return;
      setIsLoading(true);
      setError(null);
      try {
        const data = await apiFetch<any>(`/api/templates/${templateId}`);
        setTemplate(data);
        const mappedExercises: TemplateExercise[] = (data.exercises || []).map((ex: any) => ({
          id: ex.id,
          exerciseId: ex.exerciseId,
          name: ex.exercise?.name || '',
          muscleGroup: ex.exercise?.muscleGroup || null,
          sets: ex.sets || 3,
          reps: ex.reps || 10,
          targetWeight: ex.targetWeight || 0,
          isAmrap: ex.isAmrap || false,
          isAccessory: ex.isAccessory || false,
          isRequired: ex.isRequired !== false,
          orderIndex: ex.orderIndex || 0,
        }));
        setExercises(mappedExercises);
        templateNameRef.current = data.name || '';
        templateDescriptionRef.current = data.description || '';
        templateNotesRef.current = data.notes || '';
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load template');
      } finally {
        setIsLoading(false);
      }
    },
    [session.data?.user],
  );

  const saveTemplate = useCallback(async (): Promise<Template | null> => {
    if (!session.data?.user) return null;
    setIsSaving(true);
    setError(null);
    try {
      const isNew = !template?.id;

      const savedTemplate = await apiFetch<Template>(
        isNew ? '/api/templates' : `/api/templates/${template.id}`,
        {
          method: isNew ? 'POST' : 'PUT',
          body: {
            name: templateNameRef.current,
            description: templateDescriptionRef.current || undefined,
            notes: templateNotesRef.current || undefined,
          },
        },
      );

      if (!isNew && template?.id) {
        await syncExercises(template.id);
      } else if (isNew) {
        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];
          await apiFetch(`/api/templates/${savedTemplate.id}/exercises`, {
            method: 'POST',
            body: {
              exerciseId: ex.exerciseId,
              orderIndex: i,
              isAccessory: ex.isAccessory,
              isRequired: ex.isRequired,
              sets: ex.sets,
              reps: ex.reps,
              targetWeight: ex.targetWeight,
              isAmrap: ex.isAmrap,
            },
          });
        }
      }

      const nextTemplate = { ...savedTemplate, exercises };
      setTemplate(nextTemplate);
      return nextTemplate;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [session.data?.user, template?.id, exercises]);

  const syncExercises = async (currentTemplateId: string) => {
    const existingExercises = await apiFetch<Array<{ exerciseId: string; orderIndex: number }>>(
      `/api/templates/${currentTemplateId}/exercises`,
    );

    const deletePromises = existingExercises.map((existing) =>
      apiFetch(`/api/templates/${currentTemplateId}/exercises/${existing.exerciseId}`, {
        method: 'DELETE',
      }),
    );

    await Promise.all(deletePromises);

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      await apiFetch(`/api/templates/${currentTemplateId}/exercises`, {
        method: 'POST',
        body: {
          exerciseId: ex.exerciseId,
          orderIndex: i,
          isAccessory: ex.isAccessory,
          isRequired: ex.isRequired,
          sets: ex.sets,
          reps: ex.reps,
          targetWeight: ex.targetWeight,
          isAmrap: ex.isAmrap,
        },
      });
    }
  };

  const deleteTemplate = useCallback(async (): Promise<boolean> => {
    if (!template?.id) return false;
    setIsSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/templates/${template.id}`, {
        method: 'DELETE',
      });
      setTemplate(null);
      setExercises([]);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [template?.id]);

  const addExercise = useCallback(
    async (exercise: { id: string; name: string; muscleGroup: string | null }) => {
      let historyDefaults: LastWorkoutResponse | null = null;

      try {
        historyDefaults = await apiFetch<LastWorkoutResponse | null>(
          `/api/workouts/last/${exercise.id}`,
        );
      } catch {
        // no-op
      }

      const firstSetWithValues = historyDefaults?.sets.find(
        (set) => set.weight !== null || set.reps !== null,
      );

      const newExercise: TemplateExercise = {
        id: generateId(),
        exerciseId: exercise.id,
        name: exercise.name,
        muscleGroup: exercise.muscleGroup,
        sets: historyDefaults?.sets.length || 3,
        reps: firstSetWithValues?.reps ?? 10,
        targetWeight: firstSetWithValues?.weight ?? 0,
        isAmrap: false,
        isAccessory: false,
        isRequired: true,
        orderIndex: exercises.length,
      };
      setExercises((prev) => [...prev, newExercise]);
      scheduleAutoSave();
    },
    [exercises.length, scheduleAutoSave],
  );

  const removeExercise = useCallback(
    (exerciseId: string) => {
      setExercises((prev) =>
        prev.filter((e) => e.id !== exerciseId).map((e, idx) => ({ ...e, orderIndex: idx })),
      );
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  const updateExercise = useCallback(
    (exerciseId: string, updates: Partial<TemplateExercise>) => {
      setExercises((prev) => prev.map((e) => (e.id === exerciseId ? { ...e, ...updates } : e)));
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  const reorderExercises = useCallback(
    (fromIndex: number, toIndex: number) => {
      setExercises((prev) => {
        const newExercises = [...prev];
        const [removed] = newExercises.splice(fromIndex, 1);
        newExercises.splice(toIndex, 0, removed);
        return newExercises.map((e, idx) => ({ ...e, orderIndex: idx }));
      });
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  const setTemplateName = useCallback(
    (name: string) => {
      templateNameRef.current = name;
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  const setTemplateDescription = useCallback(
    (description: string) => {
      templateDescriptionRef.current = description;
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  const setTemplateNotes = useCallback(
    (notes: string) => {
      templateNotesRef.current = notes;
      scheduleAutoSave();
    },
    [scheduleAutoSave],
  );

  const fetchTemplates = useCallback(async (): Promise<Template[]> => {
    if (!session.data?.user) return [];
    try {
      return await apiFetch<Template[]>('/api/templates');
    } catch {
      return [];
    }
  }, [session.data?.user]);

  const createEmptyTemplate = useCallback((): Template => {
    const newTemplate: Template = {
      name: '',
      description: null,
      notes: null,
      exercises: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTemplate(newTemplate);
    setExercises([]);
    templateNameRef.current = '';
    templateDescriptionRef.current = '';
    templateNotesRef.current = '';
    return newTemplate;
  }, []);

  return {
    template,
    exercises,
    isLoading,
    isSaving,
    error,
    autoSaveStatus,
    weightUnit,
    loadTemplate,
    saveTemplate,
    deleteTemplate,
    addExercise,
    removeExercise,
    updateExercise,
    reorderExercises,
    setTemplateName,
    setTemplateDescription,
    setTemplateNotes,
    fetchTemplates,
    createEmptyTemplate,
  };
}
