import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { PageLayout } from '@/components/ui/PageLayout';
import { CustomPageHeader } from '@/components/ui/CustomPageHeader';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { colors, radius, spacing, typography } from '@/theme';

type ProgramCycleResponse = {
  cycle: {
    id: string;
    name: string;
    squat1rm: number;
    bench1rm: number;
    deadlift1rm: number;
    ohp1rm: number;
    startingSquat1rm: number | null;
    startingBench1rm: number | null;
    startingDeadlift1rm: number | null;
    startingOhp1rm: number | null;
  };
};

type OneRMWorkout = {
  id: string;
  squat1rm: number | null;
  bench1rm: number | null;
  deadlift1rm: number | null;
  ohp1rm: number | null;
  startingSquat1rm: number | null;
  startingBench1rm: number | null;
  startingDeadlift1rm: number | null;
  startingOhp1rm: number | null;
  completedAt: string | null;
};

function toDisplayWeight(valueKg: number | null | undefined, unit: 'kg' | 'lbs') {
  if (valueKg === null || valueKg === undefined) return '';
  return unit === 'lbs' ? (valueKg * 2.20462).toFixed(1) : valueKg.toString();
}

function toStorageWeight(value: string, unit: 'kg' | 'lbs') {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return unit === 'lbs' ? parsed * 0.453592 : parsed;
}

export default function ProgramOneRMTestScreen() {
  const router = useRouter();
  const { cycleId } = useLocalSearchParams<{ cycleId?: string }>();
  const { activeTimezone, weightUnit } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingWorkout, setOpeningWorkout] = useState(false);
  const [cycle, setCycle] = useState<ProgramCycleResponse['cycle'] | null>(null);
  const [testWorkout, setTestWorkout] = useState<OneRMWorkout | null>(null);
  const [values, setValues] = useState({
    squat: '',
    bench: '',
    deadlift: '',
    ohp: '',
  });
  const [initialValues, setInitialValues] = useState({
    squat: '',
    bench: '',
    deadlift: '',
    ohp: '',
  });

  const load = useCallback(async () => {
    if (!cycleId) return;

    setLoading(true);
    try {
      const cycleResponse = await apiFetch<ProgramCycleResponse>(`/api/programs/cycles/${cycleId}`);
      setCycle(cycleResponse.cycle);

      try {
        const workout = await apiFetch<OneRMWorkout>(
          `/api/programs/cycles/${cycleId}/1rm-test-workout`,
        );
        setTestWorkout(workout);
        const nextValues = {
          squat: toDisplayWeight(workout.squat1rm ?? cycleResponse.cycle.squat1rm, weightUnit),
          bench: toDisplayWeight(workout.bench1rm ?? cycleResponse.cycle.bench1rm, weightUnit),
          deadlift: toDisplayWeight(
            workout.deadlift1rm ?? cycleResponse.cycle.deadlift1rm,
            weightUnit,
          ),
          ohp: toDisplayWeight(workout.ohp1rm ?? cycleResponse.cycle.ohp1rm, weightUnit),
        };
        setValues(nextValues);
        setInitialValues(nextValues);
      } catch {
        setTestWorkout(null);
        const nextValues = {
          squat: toDisplayWeight(cycleResponse.cycle.squat1rm, weightUnit),
          bench: toDisplayWeight(cycleResponse.cycle.bench1rm, weightUnit),
          deadlift: toDisplayWeight(cycleResponse.cycle.deadlift1rm, weightUnit),
          ohp: toDisplayWeight(cycleResponse.cycle.ohp1rm, weightUnit),
        };
        setValues(nextValues);
        setInitialValues(nextValues);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load 1RM test');
    } finally {
      setLoading(false);
    }
  }, [cycleId, weightUnit]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenWorkout = useCallback(async () => {
    if (!cycleId) return;

    setOpeningWorkout(true);
    try {
      const result = await apiFetch<{ workoutId: string }>(
        `/api/programs/cycles/${cycleId}/create-1rm-test-workout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      router.push(
        `/workout-session?workoutId=${result.workoutId}&source=program-1rm-test&cycleId=${cycleId}`,
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open 1RM test workout');
    } finally {
      setOpeningWorkout(false);
    }
  }, [activeTimezone, cycleId, router]);

  const handleSave = useCallback(async () => {
    if (!cycleId || !cycle) return;

    const payload = {
      squat1rm: toStorageWeight(values.squat, weightUnit),
      bench1rm: toStorageWeight(values.bench, weightUnit),
      deadlift1rm: toStorageWeight(values.deadlift, weightUnit),
      ohp1rm: toStorageWeight(values.ohp, weightUnit),
      startingSquat1rm: cycle.startingSquat1rm ?? cycle.squat1rm,
      startingBench1rm: cycle.startingBench1rm ?? cycle.bench1rm,
      startingDeadlift1rm: cycle.startingDeadlift1rm ?? cycle.deadlift1rm,
      startingOhp1rm: cycle.startingOhp1rm ?? cycle.ohp1rm,
      isComplete: true,
    };

    setSaving(true);
    try {
      await apiFetch(`/api/programs/cycles/${cycleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      try {
        await apiFetch(`/api/programs/cycles/${cycleId}/1rm-test-workout`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        // Saving cycle data is still useful if a test workout was not created yet.
      }

      Alert.alert('Saved', '1RMs updated and the program was marked complete.');
      router.replace('/(app)/programs');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save 1RMs');
    } finally {
      setSaving(false);
    }
  }, [cycle, cycleId, router, values, weightUnit]);

  const hasUnsavedChanges = useMemo(
    () =>
      values.squat !== initialValues.squat ||
      values.bench !== initialValues.bench ||
      values.deadlift !== initialValues.deadlift ||
      values.ohp !== initialValues.ohp,
    [initialValues, values],
  );

  const handleExit = useCallback(() => {
    const goToPrograms = () => router.replace('/(app)/programs');

    if (!hasUnsavedChanges) {
      goToPrograms();
      return;
    }

    Alert.alert('Discard 1RM changes?', 'Your unsaved 1RM values will be lost.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: goToPrograms,
      },
    ]);
  }, [hasUnsavedChanges, router]);

  if (!cycleId) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
          paddingHorizontal: spacing.lg,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: typography.fontSizes.lg,
            fontWeight: typography.fontWeights.semibold,
          }}
        >
          Missing program cycle
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <PageLayout
      headerType="custom"
      header={
        <CustomPageHeader
          title="1RM Test"
          onBack={handleExit}
          rightSlot={
            <Pressable onPress={handleExit} style={styles.headerAction}>
              <Text style={styles.headerActionText}>Discard</Text>
            </Pressable>
          }
        />
      }
    >
      <View>
        <Text style={styles.sectionLabel}>Program Cycle</Text>
        <Text style={styles.programTitle}>{cycle?.name ?? 'Program'}</Text>

        <Pressable
          style={[styles.primaryButton, openingWorkout && styles.buttonDisabled]}
          onPress={() => {
            void handleOpenWorkout();
          }}
          disabled={openingWorkout}
        >
          {openingWorkout ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {testWorkout?.completedAt
                ? 'Start Another 1RM Test Workout'
                : 'Open 1RM Test Workout'}
            </Text>
          )}
        </Pressable>

        <Text style={styles.instructionsText}>
          Complete the 1RM test workout, then record the final values here. These will update this
          program and be used as defaults when you start the next one.
        </Text>

        {[
          {
            key: 'squat',
            label: 'Squat 1RM',
            start: cycle?.startingSquat1rm ?? cycle?.squat1rm ?? null,
          },
          {
            key: 'bench',
            label: 'Bench 1RM',
            start: cycle?.startingBench1rm ?? cycle?.bench1rm ?? null,
          },
          {
            key: 'deadlift',
            label: 'Deadlift 1RM',
            start: cycle?.startingDeadlift1rm ?? cycle?.deadlift1rm ?? null,
          },
          {
            key: 'ohp',
            label: 'Overhead Press 1RM',
            start: cycle?.startingOhp1rm ?? cycle?.ohp1rm ?? null,
          },
        ].map((field) => (
          <View key={`program-test:${field.key}`} style={styles.inputCard}>
            <Text style={styles.inputLabel}>{field.label}</Text>
            <Text style={styles.startingValueText}>
              Starting: {toDisplayWeight(field.start, weightUnit) || '0'} {weightUnit}
            </Text>
            <TextInput
              style={styles.textInput}
              value={values[field.key as keyof typeof values]}
              onChangeText={(text) =>
                setValues((prev) => ({
                  ...prev,
                  [field.key]: text.replace(/[^0-9.]/g, ''),
                }))
              }
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.placeholderText}
            />
          </View>
        ))}

        <Pressable
          style={[styles.successButton, saving && styles.buttonDisabled]}
          onPress={() => {
            void handleSave();
          }}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Save 1RMs</Text>
          )}
        </Pressable>
      </View>
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  headerAction: {
    minWidth: 64,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  headerActionText: {
    color: colors.error,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    marginBottom: spacing.xs,
  },
  programTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
  },
  successButton: {
    borderRadius: radius.xl,
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    textAlign: 'center',
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  instructionsText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    marginBottom: spacing.md,
  },
  inputCard: {
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  inputLabel: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
    marginBottom: spacing.xs,
  },
  startingValueText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    marginBottom: spacing.md,
  },
  textInput: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
});
