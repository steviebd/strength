import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import type { SelectedExercise, Template } from './types';

interface TemplateEditorApiProps {
  mode: 'create' | 'edit';
  templateId?: string;
  initialData?: {
    name: string;
    description?: string;
    notes?: string;
    exercises?: SelectedExercise[];
  };
  selectedExercises: SelectedExercise[];
  formData: { name: string; description: string; notes: string };
  onSaved?: (template: Template) => void;
}

interface UseTemplateEditorApiReturn {
  isLoading: boolean;
  isSaving: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'saved';
  errors: { name?: string; exercises?: string };
  setErrors: (errors: { name?: string; exercises?: string }) => void;
  saveTemplate: () => Promise<Template | null>;
  validateAndSave: () => Promise<Template | null>;
  loadExercises: () => Promise<SelectedExercise[]>;
}

export function useTemplateEditorApi({
  mode,
  templateId,
  initialData: _initialData,
  selectedExercises,
  formData,
  onSaved,
}: TemplateEditorApiProps): UseTemplateEditorApiReturn {
  const [isLoading, _setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; exercises?: string }>({});

  const validateForm = useCallback((): boolean => {
    const newErrors: { name?: string; exercises?: string } = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Template name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData.name]);

  const saveTemplate = useCallback(async (): Promise<Template | null> => {
    if (!validateForm()) return null;

    setIsSaving(true);
    try {
      const isNew = mode === 'create';

      const savedTemplate = await apiFetch<Template>(
        isNew ? '/api/templates' : `/api/templates/${templateId}`,
        {
          method: isNew ? 'POST' : 'PUT',
          body: {
            name: formData.name,
            description: formData.description || undefined,
            notes: formData.notes || undefined,
          },
        },
      );

      if (!isNew && templateId) {
        await syncExercises(templateId, savedTemplate.id!);
      } else {
        for (let i = 0; i < selectedExercises.length; i++) {
          const ex = selectedExercises[i];
          await apiFetch(`/api/templates/${savedTemplate.id}/exercises`, {
            method: 'POST',
            body: {
              exerciseId: ex.exerciseId,
              orderIndex: i,
              isAccessory: ex.isAccessory ?? false,
              isRequired: ex.isRequired ?? true,
              sets: ex.sets ?? 3,
              reps: ex.reps ?? 10,
              targetWeight: ex.targetWeight ?? 0,
              isAmrap: ex.isAmrap ?? false,
            },
          });
        }
      }

      onSaved?.(savedTemplate);
      return savedTemplate;
    } catch (err) {
      setErrors({ exercises: err instanceof Error ? err.message : 'Failed to save template' });
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [mode, templateId, formData, selectedExercises, validateForm, onSaved]);

  const syncExercises = async (currentTemplateId: string, _newTemplateId: string) => {
    const newExerciseIds = new Set(selectedExercises.map((e) => e.exerciseId));

    const existingExercises = await apiFetch<Array<{ exerciseId: string; orderIndex: number }>>(
      `/api/templates/${currentTemplateId}/exercises`,
    );

    const deletePromises = existingExercises
      .filter((existing) => !newExerciseIds.has(existing.exerciseId))
      .map((existing) =>
        apiFetch(`/api/templates/${currentTemplateId}/exercises/${existing.exerciseId}`, {
          method: 'DELETE',
        }),
      );

    await Promise.all(deletePromises);

    const addPromises: Array<Promise<unknown>> = [];
    for (let i = 0; i < selectedExercises.length; i++) {
      const ex = selectedExercises[i];
      const existing = existingExercises.find((ee) => ee.exerciseId === ex.exerciseId);
      if (!existing) {
        addPromises.push(
          apiFetch(`/api/templates/${currentTemplateId}/exercises`, {
            method: 'POST',
            body: {
              exerciseId: ex.exerciseId,
              orderIndex: i,
              isAccessory: ex.isAccessory ?? false,
              isRequired: ex.isRequired ?? true,
              sets: ex.sets ?? 3,
              reps: ex.reps ?? 10,
              targetWeight: ex.targetWeight ?? 0,
              isAmrap: ex.isAmrap ?? false,
            },
          }),
        );
      }
    }

    await Promise.all(addPromises);
  };

  const loadExercises = useCallback(async (): Promise<SelectedExercise[]> => {
    try {
      return await apiFetch('/api/exercises');
    } catch {
      return [];
    }
  }, []);

  const handleSubmit = useCallback(async (): Promise<Template | null> => {
    return saveTemplate();
  }, [saveTemplate]);

  const _validateAndSave = useCallback(async (): Promise<Template | null> => {
    if (!validateForm()) return null;
    return saveTemplate();
  }, [validateForm, saveTemplate]);

  return {
    isLoading,
    isSaving,
    autoSaveStatus: isSaving ? 'saving' : 'idle',
    errors,
    setErrors,
    saveTemplate,
    validateAndSave: handleSubmit,
    loadExercises,
  };
}
