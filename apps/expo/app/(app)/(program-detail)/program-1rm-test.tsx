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

function toDisplayWeight(valueKg: number | null | undefined, unit: 'kg' | 'lbs') {
  if (valueKg === null || valueKg === undefined) return '';
  return unit === 'lbs' ? (valueKg * 2.20462).toFixed(1) : valueKg.toString();
}

function toStorageWeight(value: string, unit: 'kg' | 'lbs') {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return null;
  return unit === 'lbs' ? parsed * 0.453592 : parsed;
}

function formatDiff(testVal: number, startVal: number | null, unit: 'kg' | 'lbs'): string {
  if (startVal === null || startVal === undefined) return '';
  const diff = testVal - startVal;
  const sign = diff > 0 ? '+' : '';
  const displayDiff = unit === 'lbs' ? diff * 2.20462 : diff;
  return `${sign}${displayDiff.toFixed(1)} ${unit}`;
}

function formatPercentIncrease(testVal: number, startVal: number | null): string {
  if (!startVal || startVal === 0) return '';
  const pct = ((testVal - startVal) / startVal) * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

interface LiftField {
  key: 'squat' | 'bench' | 'deadlift' | 'ohp';
  label: string;
  startingKey: 'startingSquat1rm' | 'startingBench1rm' | 'startingDeadlift1rm' | 'startingOhp1rm';
}

const LIFT_FIELDS: LiftField[] = [
  { key: 'squat', label: 'Squat', startingKey: 'startingSquat1rm' },
  { key: 'bench', label: 'Bench Press', startingKey: 'startingBench1rm' },
  { key: 'deadlift', label: 'Deadlift', startingKey: 'startingDeadlift1rm' },
  { key: 'ohp', label: 'Overhead Press', startingKey: 'startingOhp1rm' },
];

export default function ProgramOneRMTestScreen() {
  const router = useRouter();
  const { cycleId, squatMax, benchMax, deadliftMax, ohpMax } = useLocalSearchParams<{
    cycleId?: string;
    squatMax?: string;
    benchMax?: string;
    deadliftMax?: string;
    ohpMax?: string;
  }>();
  const { weightUnit } = useUserPreferences();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cycle, setCycle] = useState<ProgramCycleResponse['cycle'] | null>(null);
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

      const urlMaxes: Record<string, string> = {
        squat: squatMax ?? '',
        bench: benchMax ?? '',
        deadlift: deadliftMax ?? '',
        ohp: ohpMax ?? '',
      };

      const nextValues = {
        squat: urlMaxes.squat ? toDisplayWeight(Number(urlMaxes.squat), weightUnit) : '',
        bench: urlMaxes.bench ? toDisplayWeight(Number(urlMaxes.bench), weightUnit) : '',
        deadlift: urlMaxes.deadlift ? toDisplayWeight(Number(urlMaxes.deadlift), weightUnit) : '',
        ohp: urlMaxes.ohp ? toDisplayWeight(Number(urlMaxes.ohp), weightUnit) : '',
      };

      setValues(nextValues);
      setInitialValues(nextValues);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load program cycle');
    } finally {
      setLoading(false);
    }
  }, [cycleId, weightUnit, squatMax, benchMax, deadliftMax, ohpMax]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (!cycleId || !cycle) return;

    const squat = toStorageWeight(values.squat, weightUnit);
    const bench = toStorageWeight(values.bench, weightUnit);
    const deadlift = toStorageWeight(values.deadlift, weightUnit);
    const ohp = toStorageWeight(values.ohp, weightUnit);

    const payload: Record<string, unknown> = {
      startingSquat1rm: cycle.startingSquat1rm ?? cycle.squat1rm,
      startingBench1rm: cycle.startingBench1rm ?? cycle.bench1rm,
      startingDeadlift1rm: cycle.startingDeadlift1rm ?? cycle.deadlift1rm,
      startingOhp1rm: cycle.startingOhp1rm ?? cycle.ohp1rm,
      isComplete: true,
    };
    if (squat !== null) payload.squat1rm = squat;
    if (bench !== null) payload.bench1rm = bench;
    if (deadlift !== null) payload.deadlift1rm = deadlift;
    if (ohp !== null) payload.ohp1rm = ohp;

    setSaving(true);
    try {
      await apiFetch(`/api/programs/cycles/${cycleId}`, {
        method: 'PUT',
        body: payload,
      });

      try {
        await apiFetch(`/api/programs/cycles/${cycleId}/1rm-test-workout`, {
          method: 'PUT',
          body: payload,
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

  const handleDiscard = useCallback(() => {
    const goToPrograms = () => router.replace('/(app)/programs');

    if (!hasUnsavedChanges) {
      goToPrograms();
      return;
    }

    Alert.alert('Discard changes?', 'Your updated 1RM values will be lost.', [
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
          title="1RM Results"
          onBack={handleDiscard}
          rightSlot={
            <Pressable onPress={handleDiscard} style={styles.headerAction}>
              <Text style={styles.headerActionText}>Discard</Text>
            </Pressable>
          }
        />
      }
    >
      <View>
        <Text style={styles.sectionLabel}>Program Cycle</Text>
        <Text style={styles.programTitle}>{cycle?.name ?? 'Program'}</Text>

        {LIFT_FIELDS.map((field) => {
          const startKg = (cycle?.[field.startingKey] as number | null | undefined) ?? null;
          const testValStr = values[field.key];
          const testValNum = Number.parseFloat(testValStr);
          const hasTestValue = Number.isFinite(testValNum) && testValStr !== '';
          const hasStartValue = startKg !== null && startKg !== undefined;

          return (
            <View key={`1rm-summary:${field.key}`} style={styles.card}>
              <Text style={styles.cardTitle}>{field.label}</Text>

              <View style={styles.row}>
                <View style={styles.cell}>
                  <Text style={styles.cellLabel}>Starting</Text>
                  <Text style={styles.cellValue}>
                    {hasStartValue ? `${toDisplayWeight(startKg, weightUnit)} ${weightUnit}` : '—'}
                  </Text>
                </View>
                <View style={styles.cell}>
                  <Text style={styles.cellLabel}>Tested</Text>
                  <TextInput
                    style={styles.cellInput}
                    value={testValStr}
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
              </View>

              {hasTestValue && hasStartValue && (
                <View style={styles.metricsRow}>
                  <View style={styles.metricBadge}>
                    <Text style={styles.metricLabel}>Difference</Text>
                    <Text style={styles.metricValue}>
                      {formatDiff(testValNum, startKg, weightUnit)}
                    </Text>
                  </View>
                  <View style={styles.metricBadge}>
                    <Text style={styles.metricLabel}>% Increase</Text>
                    <Text style={styles.metricValue}>
                      {formatPercentIncrease(testValNum, startKg)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <Pressable
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={() => {
            void handleSave();
          }}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.saveButtonText}>Save 1RMs</Text>
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
  card: {
    marginBottom: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  cardTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cell: {
    flex: 1,
  },
  cellLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cellValue: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
  },
  cellInput: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metricBadge: {
    flex: 1,
    borderRadius: radius.md,
    backgroundColor: `${colors.accent}15`,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    marginBottom: spacing.xs,
  },
  metricValue: {
    color: colors.accent,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
  },
  saveButton: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.success,
    paddingVertical: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    textAlign: 'center',
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
});
