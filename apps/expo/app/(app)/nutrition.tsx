import { useRouter } from 'expo-router';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { PageLayout } from '@/components/ui/PageLayout';
import {
  ActionButton,
  Badge,
  MetricTile,
  PageHeader,
  SectionTitle,
  Surface,
} from '@/components/ui/app-primitives';
import { MealCard } from '@/components/nutrition/MealCard';
import { colors, radius, spacing } from '@/theme';

interface DailySummary {
  entries: Array<{
    id: string;
    name: string | null;
    mealType: string | null;
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    loggedAt: string | null;
  }>;
  totals: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  targets: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
  whoopRecovery: {
    score: number | null;
    status: 'red' | 'yellow' | 'green' | null;
    hrv: number | null;
  } | null;
  whoopCycle: {
    caloriesBurned: number | null;
    totalStrain: number | null;
  } | null;
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function clampPercent(consumed: number, target: number) {
  if (target <= 0) return 0;
  return Math.min((consumed / target) * 100, 100);
}

export default function NutritionScreen() {
  const router = useRouter();
  const today = getTodayStr();

  const {
    data: summary,
    isLoading,
    error,
  } = useQuery<DailySummary>({
    queryKey: ['nutrition-daily-summary', today],
    queryFn: async () => apiFetch<DailySummary>(`/api/nutrition/daily-summary?date=${today}`),
  });

  if (isLoading) {
    return (
      <PageLayout>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#fb923c" />
        </View>
      </PageLayout>
    );
  }

  if (error || !summary) {
    return (
      <PageLayout>
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load nutrition data.</Text>
        </View>
      </PageLayout>
    );
  }

  const { entries, totals, targets, whoopRecovery, whoopCycle } = summary;
  const remainingCalories = Math.max(targets.calories - totals.calories, 0);
  const caloriePercent = clampPercent(totals.calories, targets.calories);

  return (
    <PageLayout
      header={
        <PageHeader
          eyebrow="Daily nutrition"
          title="Eat for performance"
          description="Track calories, monitor macros, and keep recovery-supported fueling on pace."
        />
      }
    >
      <Surface style={styles.calorieCard}>
        <View style={styles.calorieContent}>
          <View style={styles.calorieMain}>
            <Badge label={`${remainingCalories} kcal left`} tone="orange" />
            <Text style={styles.calorieValue}>{totals.calories}</Text>
            <Text style={styles.calorieTarget}>of {targets.calories} kcal target today</Text>
          </View>
          {whoopRecovery?.score ? (
            <View style={styles.recoveryScore}>
              <Text style={styles.recoveryLabel}>Recovery</Text>
              <Text style={styles.recoveryValue}>{whoopRecovery.score}%</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${caloriePercent}%` }]} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressLabel}>{totals.calories} consumed</Text>
            <Text style={styles.progressLabel}>{targets.calories} target</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <ActionButton
            label="Log Meal"
            icon="add"
            onPress={() => router.push('/nutrition/chat')}
          />
          <ActionButton
            label="Meal Chat"
            icon="sparkles-outline"
            variant="secondary"
            onPress={() => router.push('/nutrition/chat')}
          />
        </View>
      </Surface>

      <SectionTitle title="Macros" />
      <View style={styles.macroRow}>
        <MetricTile
          label="Protein"
          value={`${totals.proteinG.toFixed(0)}g`}
          hint={`Target ${targets.proteinG}g`}
          tone="emerald"
        />
        <MetricTile
          label="Carbs"
          value={`${totals.carbsG.toFixed(0)}g`}
          hint={`Target ${targets.carbsG}g`}
          tone="sky"
        />
        <MetricTile
          label="Fat"
          value={`${totals.fatG.toFixed(0)}g`}
          hint={`Target ${targets.fatG}g`}
          tone="orange"
        />
      </View>

      {(whoopRecovery || whoopCycle) && (
        <>
          <SectionTitle title="Recovery context" />
          <Surface style={styles.recoveryCard}>
            <View style={styles.recoveryContent}>
              <View style={styles.badgeRow}>
                {whoopRecovery?.status ? (
                  <Badge
                    label={`Recovery ${whoopRecovery.status}`}
                    tone={
                      whoopRecovery.status === 'green'
                        ? 'emerald'
                        : whoopRecovery.status === 'yellow'
                          ? 'orange'
                          : 'rose'
                    }
                  />
                ) : null}
                {whoopCycle?.totalStrain != null ? (
                  <Badge label={`Strain ${whoopCycle.totalStrain.toFixed(1)}`} tone="sky" />
                ) : null}
              </View>
              <View style={styles.metricRow}>
                <MetricTile
                  label="HRV"
                  value={whoopRecovery?.hrv != null ? `${whoopRecovery.hrv}` : '--'}
                  hint="ms"
                />
                <MetricTile
                  label="Burned"
                  value={whoopCycle?.caloriesBurned != null ? `${whoopCycle.caloriesBurned}` : '--'}
                  hint="kcal"
                />
              </View>
            </View>
          </Surface>
        </>
      )}

      <SectionTitle
        title="Meals"
        actionLabel="Log another"
        onActionPress={() => router.push('/nutrition/chat')}
      />
      {entries.length === 0 ? (
        <Surface style={styles.emptyState}>
          <View style={styles.emptyContent}>
            <Text style={styles.emptyTitle}>No meals logged yet</Text>
            <Text style={styles.emptyDescription}>
              Start with a quick message and the meal chat can turn it into a tracked entry.
            </Text>
            <ActionButton
              label="Start logging"
              icon="chatbubble-ellipses-outline"
              onPress={() => router.push('/nutrition/chat')}
            />
          </View>
        </Surface>
      ) : (
        <View style={styles.mealList}>
          {entries.map((entry) => {
            const time = entry.loggedAt
              ? new Date(entry.loggedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';
            return (
              <MealCard
                key={entry.id}
                mealType={entry.mealType ?? 'snack'}
                time={time}
                name={entry.name ?? 'Unnamed meal'}
                calories={entry.calories ?? 0}
                protein={entry.proteinG ?? 0}
                carbs={entry.carbsG ?? 0}
                fat={entry.fatG ?? 0}
              />
            );
          })}
        </View>
      )}
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  calorieCard: {
    marginBottom: spacing.lg,
    backgroundColor: '#18181b',
  },
  calorieContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  calorieMain: {
    flex: 1,
    gap: spacing.sm,
  },
  calorieValue: {
    fontSize: 34,
    fontWeight: '600',
    color: colors.text,
  },
  calorieTarget: {
    fontSize: 15,
    color: '#64748b',
  },
  recoveryScore: {
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  recoveryLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.8,
    color: '#64748b',
    textTransform: 'uppercase',
  },
  recoveryValue: {
    fontSize: 28,
    fontWeight: '600',
    color: '#6ee7b7',
  },
  progressSection: {
    marginBottom: spacing.lg,
  },
  progressBar: {
    height: 12,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: '#fb923c',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  progressLabel: {
    fontSize: 13,
    color: '#64748b',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  macroRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  recoveryCard: {
    marginBottom: spacing.lg,
    backgroundColor: 'rgba(24,24,27,0.7)',
  },
  recoveryContent: {
    gap: spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  emptyState: {
    backgroundColor: 'rgba(24,24,27,0.7)',
  },
  emptyContent: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  mealList: {
    gap: spacing.md,
  },
});
