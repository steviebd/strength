export interface TemplateExercise {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  sets: number;
  reps: number;
  targetWeight: number;
  addedWeight?: number;
  isAmrap?: boolean;
  isAccessory: boolean;
  isRequired: boolean;
  orderIndex: number;
  exerciseType?: string;
  targetDuration?: number | null;
  targetDistance?: number | null;
  targetHeight?: number | null;
}

export interface Template {
  id?: string;
  name: string;
  description: string | null;
  notes: string | null;
  exercises: TemplateExercise[];
  createdAt: string;
  updatedAt: string;
}

export interface SelectedExercise {
  id: string;
  exerciseId: string;
  name: string;
  muscleGroup: string | null;
  description?: string | null;
  libraryId?: string;
  exerciseType?: string;
  isAmrap?: boolean;
  isAccessory?: boolean;
  isRequired?: boolean;
  sets?: number;
  reps?: number;
  repsRaw?: string;
  targetWeight?: number;
  addedWeight?: number;
  targetDuration?: number;
  targetDistance?: number;
  targetHeight?: number;
}

export interface TemplateEditorProps {
  mode: 'create' | 'edit';
  templateId?: string;
  initialData?: {
    name: string;
    description?: string;
    notes?: string;
    exercises?: SelectedExercise[];
  };
  onSaved?: (template: Template) => void;
  onClose?: () => void;
}
