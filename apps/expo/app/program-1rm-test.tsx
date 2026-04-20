import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { useUserPreferences } from '@/context/UserPreferencesContext';

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
  const { weightUnit } = useUserPreferences();
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
        setValues({
          squat: toDisplayWeight(workout.squat1rm ?? cycleResponse.cycle.squat1rm, weightUnit),
          bench: toDisplayWeight(workout.bench1rm ?? cycleResponse.cycle.bench1rm, weightUnit),
          deadlift: toDisplayWeight(
            workout.deadlift1rm ?? cycleResponse.cycle.deadlift1rm,
            weightUnit,
          ),
          ohp: toDisplayWeight(workout.ohp1rm ?? cycleResponse.cycle.ohp1rm, weightUnit),
        });
      } catch {
        setTestWorkout(null);
        setValues({
          squat: toDisplayWeight(cycleResponse.cycle.squat1rm, weightUnit),
          bench: toDisplayWeight(cycleResponse.cycle.bench1rm, weightUnit),
          deadlift: toDisplayWeight(cycleResponse.cycle.deadlift1rm, weightUnit),
          ohp: toDisplayWeight(cycleResponse.cycle.ohp1rm, weightUnit),
        });
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
        { method: 'POST' },
      );
      router.push(
        `/workout-session?workoutId=${result.workoutId}&source=program-1rm-test&cycleId=${cycleId}`,
      );
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open 1RM test workout');
    } finally {
      setOpeningWorkout(false);
    }
  }, [cycleId, router]);

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

  if (!cycleId) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg px-6">
        <Text className="text-darkText text-lg font-semibold">Missing program cycle</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg">
        <ActivityIndicator size="large" color="#ef6f4f" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-darkBg" contentContainerStyle={{ paddingBottom: 64 }}>
      <View className="px-6 pt-16">
        <View className="mb-6 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="h-10 w-10 items-center justify-center rounded-full bg-darkBorder"
          >
            <Text className="text-darkText text-xl">←</Text>
          </Pressable>
          <Text className="text-darkText text-lg font-semibold">1RM Test</Text>
          <View className="w-10" />
        </View>

        <Text className="text-darkMuted mb-1 text-sm">Program Cycle</Text>
        <Text className="text-darkText mb-6 text-2xl font-semibold">
          {cycle?.name ?? 'Program'}
        </Text>

        <Pressable
          className={`mb-6 rounded-xl bg-coral py-4 ${openingWorkout ? 'opacity-50' : ''}`}
          onPress={() => {
            void handleOpenWorkout();
          }}
          disabled={openingWorkout}
        >
          {openingWorkout ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-center text-base font-semibold text-white">
              {testWorkout?.completedAt
                ? 'Start Another 1RM Test Workout'
                : 'Open 1RM Test Workout'}
            </Text>
          )}
        </Pressable>

        <Text className="text-darkMuted mb-4 text-sm">
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
          <View
            key={field.key}
            className="mb-4 rounded-xl border border-darkBorder bg-darkCard p-4"
          >
            <Text className="text-darkText mb-1 font-medium">{field.label}</Text>
            <Text className="text-darkMuted mb-3 text-xs">
              Starting: {toDisplayWeight(field.start, weightUnit) || '0'} {weightUnit}
            </Text>
            <TextInput
              className="rounded-lg bg-darkBg px-4 py-3 text-2xl font-bold text-darkText"
              value={values[field.key as keyof typeof values]}
              onChangeText={(text) =>
                setValues((prev) => ({
                  ...prev,
                  [field.key]: text.replace(/[^0-9.]/g, ''),
                }))
              }
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#71717a"
            />
          </View>
        ))}

        <Pressable
          className={`rounded-xl bg-pine py-4 ${saving ? 'opacity-50' : ''}`}
          onPress={() => {
            void handleSave();
          }}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text className="text-center text-base font-semibold text-white">Save 1RMs</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}
