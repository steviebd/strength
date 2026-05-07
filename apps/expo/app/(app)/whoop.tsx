import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { CustomPageHeader } from '@/components/ui/CustomPageHeader';
import { PageLayout } from '@/components/ui/PageLayout';
import { apiFetch } from '@/lib/api';
import { transformWhoopData, WhoopData, WhoopRecovery, WhoopSleep } from '@/lib/whoop';
import { colors, radius, textRoles, typography } from '@/theme';

async function fetchWhoopData(): Promise<WhoopData> {
  const raw = await apiFetch<WhoopData>('/api/whoop/data?days=30');
  return transformWhoopData(raw as unknown as Parameters<typeof transformWhoopData>[0]);
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '--';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function formatWorkoutDuration(start: number, end: number): string {
  const durationMs = end - start;
  const minutes = Math.floor(durationMs / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function getRecoveryColor(score: number | null): string {
  if (score == null) return colors.textMuted;
  if (score < 40) return colors.error;
  if (score < 70) return colors.warning;
  return colors.success;
}

function getRecoveryBg(score: number | null): string {
  if (score == null) return colors.border;
  if (score < 40) return `${colors.error}20`;
  if (score < 70) return `${colors.warning}20`;
  return `${colors.success}20`;
}

function MiniBar({
  value,
  max,
  barColor,
  label,
}: {
  value: number | null;
  max: number;
  barColor: string;
  label: string;
}) {
  const pct = value != null ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={styles.miniBarContainer}>
      <Text style={styles.miniBarLabel}>{label}</Text>
      <View style={styles.miniBarTrack}>
        <View style={[styles.miniBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

function RecoveryDayRow({ recovery }: { recovery: WhoopRecovery }) {
  const hrvMax = 100;
  const rhrMax = 100;

  const score = recovery.recoveryScore;
  const scoreColor = getRecoveryColor(score);

  return (
    <View style={styles.dayRow}>
      <Text style={styles.dayRowDate}>{formatDate(recovery.date)}</Text>
      <View style={styles.dayRowBars}>
        <View style={styles.miniBarFlex}>
          <MiniBar
            value={recovery.hrvRmssdMilli}
            max={hrvMax}
            barColor={colors.success}
            label="HRV"
          />
        </View>
        <View style={styles.miniBarFlex}>
          <MiniBar value={recovery.restingHeartRate} max={rhrMax} barColor="#3b82f6" label="RHR" />
        </View>
      </View>
      <View style={styles.dayRowScore}>
        <Text style={[styles.dayRowScoreText, { color: scoreColor }]}>{score ?? '--'}</Text>
      </View>
    </View>
  );
}

function SleepDayBar({ sleep }: { sleep: WhoopSleep }) {
  const total =
    (sleep.slowWaveSleepTimeMilli ?? 0) +
    (sleep.remSleepTimeMilli ?? 0) +
    (sleep.lightSleepTimeMilli ?? 0);

  const deepPct = total > 0 ? ((sleep.slowWaveSleepTimeMilli ?? 0) / total) * 100 : 0;
  const remPct = total > 0 ? ((sleep.remSleepTimeMilli ?? 0) / total) * 100 : 0;
  const lightPct = total > 0 ? ((sleep.lightSleepTimeMilli ?? 0) / total) * 100 : 0;

  return (
    <View style={styles.sleepBarContainer}>
      <Text style={styles.sleepBarDate}>{formatDate(sleep.start).split(',')[0]}</Text>
      <View style={styles.sleepBarStack}>
        {deepPct > 0 && (
          <View
            style={[styles.sleepBarSegment, { width: `${deepPct}%`, backgroundColor: '#9333ea' }]}
          />
        )}
        {remPct > 0 && (
          <View
            style={[styles.sleepBarSegment, { width: `${remPct}%`, backgroundColor: '#3b82f6' }]}
          />
        )}
        {lightPct > 0 && (
          <View
            style={[styles.sleepBarSegment, { width: `${lightPct}%`, backgroundColor: '#6b7280' }]}
          />
        )}
      </View>
      <Text style={styles.sleepBarDuration}>{formatDuration(sleep.totalSleepTimeMilli)}</Text>
    </View>
  );
}

export default function WhoopDataPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['whoopData'],
    queryFn: fetchWhoopData,
    refetchOnWindowFocus: true,
  });

  const latestRecovery = data?.recovery[0];
  const latestSleep = data?.sleep[0];
  const last7Recovery = data?.recovery.slice(0, 7) ?? [];
  const last7Sleep = data?.sleep.slice(0, 7) ?? [];

  return (
    <PageLayout
      headerType="custom"
      header={<CustomPageHeader title="WHOOP Data" />}
      screenScrollViewProps={{ horizontalPadding: 24, bottomInset: 140 }}
    >
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      )}

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>Failed to load WHOOP data</Text>
        </Card>
      )}

      {!isLoading && !error && !data && (
        <Card style={styles.errorCard}>
          <Text style={styles.mutedText}>No data available</Text>
        </Card>
      )}

      {!isLoading && data && (
        <>
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Recovery</Text>
            {latestRecovery ? (
              <View>
                <View
                  style={[
                    styles.recoveryScoreBox,
                    { backgroundColor: getRecoveryBg(latestRecovery.recoveryScore) },
                  ]}
                >
                  <Text style={styles.metricLabel}>Recovery Score</Text>
                  <Text
                    style={[
                      styles.recoveryScoreValue,
                      { color: getRecoveryColor(latestRecovery.recoveryScore) },
                    ]}
                  >
                    {latestRecovery.recoveryScore ?? '--'}
                  </Text>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>HRV</Text>
                    <Text style={styles.metricValue}>
                      {latestRecovery.hrvRmssdMilli != null
                        ? `${latestRecovery.hrvRmssdMilli} ms`
                        : '--'}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>RHR</Text>
                    <Text style={styles.metricValue}>
                      {latestRecovery.restingHeartRate != null
                        ? `${latestRecovery.restingHeartRate} bpm`
                        : '--'}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Resp Rate</Text>
                    <Text style={styles.metricValue}>
                      {latestRecovery.respiratoryRate != null
                        ? `${latestRecovery.respiratoryRate} br/min`
                        : '--'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.mutedText}>No recovery data</Text>
            )}
          </Card>

          {last7Recovery.length > 1 && (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Recovery (7 days)</Text>
              <View>
                {last7Recovery.map((r, idx) => (
                  <RecoveryDayRow key={`recovery:${r.id ?? idx}`} recovery={r} />
                ))}
              </View>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.legendText}>HRV</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
                  <Text style={styles.legendText}>RHR</Text>
                </View>
                <View style={styles.legendItem}>
                  <Text style={styles.legendText}>Score: </Text>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.legendText}>&ge;70</Text>
                  <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                  <Text style={styles.legendText}>40-69</Text>
                  <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
                  <Text style={styles.legendText}>&lt;40</Text>
                </View>
              </View>
            </Card>
          )}

          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Sleep</Text>
            {latestSleep ? (
              <View>
                <View style={styles.sleepHeaderRow}>
                  <View style={styles.sleepStat}>
                    <Text style={styles.metricLabel}>Sleep Performance</Text>
                    <Text style={styles.sleepStatValue}>
                      {latestSleep.sleepPerformancePercentage ?? '--'}%
                    </Text>
                  </View>
                  <View style={styles.sleepStat}>
                    <Text style={styles.metricLabel}>Total Sleep</Text>
                    <Text style={styles.sleepStatValue}>
                      {formatDuration(latestSleep.totalSleepTimeMilli)}
                    </Text>
                  </View>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Deep</Text>
                    <Text style={styles.metricValue}>
                      {formatDuration(latestSleep.slowWaveSleepTimeMilli)}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>REM</Text>
                    <Text style={styles.metricValue}>
                      {formatDuration(latestSleep.remSleepTimeMilli)}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Light</Text>
                    <Text style={styles.metricValue}>
                      {formatDuration(latestSleep.lightSleepTimeMilli)}
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Efficiency</Text>
                    <Text style={styles.metricValue}>
                      {latestSleep.sleepEfficiencyPercentage != null
                        ? `${latestSleep.sleepEfficiencyPercentage}%`
                        : '--'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.mutedText}>No sleep data</Text>
            )}
          </Card>

          {last7Sleep.length > 1 && (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Sleep (7 days)</Text>
              <View style={styles.sleepChartRow}>
                {last7Sleep.map((s, idx) => (
                  <SleepDayBar key={`sleep:${s.id ?? idx}`} sleep={s} />
                ))}
              </View>
              <View style={styles.sleepLegendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendBox, { backgroundColor: '#9333ea' }]} />
                  <Text style={styles.legendText}>Deep</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendBox, { backgroundColor: '#3b82f6' }]} />
                  <Text style={styles.legendText}>REM</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendBox, { backgroundColor: '#6b7280' }]} />
                  <Text style={styles.legendText}>Light</Text>
                </View>
              </View>
            </Card>
          )}

          {data.cycles.length > 0 && (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Daily Cycles</Text>
              <View style={styles.cyclesList}>
                {data.cycles.slice(0, 14).map((cycle, idx) => (
                  <View key={`cycle:${cycle.id ?? idx}`} style={styles.cycleRow}>
                    <Text style={styles.cycleDate}>{formatDate(cycle.start)}</Text>
                    <View style={styles.cycleStats}>
                      <View style={styles.cycleStat}>
                        <Text style={styles.metricLabel}>Strain</Text>
                        <Text style={styles.cycleStatValue}>
                          {cycle.dayStrain != null ? cycle.dayStrain.toFixed(1) : '--'}
                        </Text>
                      </View>
                      <View style={styles.cycleStat}>
                        <Text style={styles.metricLabel}>Avg HR</Text>
                        <Text style={styles.cycleStatValue}>{cycle.averageHeartRate ?? '--'}</Text>
                      </View>
                      <View style={styles.cycleStat}>
                        <Text style={styles.metricLabel}>kJ</Text>
                        <Text style={styles.cycleStatValue}>
                          {cycle.kilojoule != null ? Math.round(cycle.kilojoule) : '--'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {data.workouts.length > 0 && (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Workouts</Text>
              <View style={styles.workoutsList}>
                {data.workouts.map((workout) => (
                  <View key={`whoop-workout:${workout.id}`} style={styles.workoutRow}>
                    <View style={styles.workoutHeader}>
                      <View>
                        <Text style={styles.workoutName}>{workout.sportName ?? 'Workout'}</Text>
                        <Text style={styles.workoutDate}>{formatDate(workout.start)}</Text>
                      </View>
                      <Text style={styles.workoutDuration}>
                        {formatWorkoutDuration(workout.start, workout.end)}
                      </Text>
                    </View>
                    <View style={styles.workoutStats}>
                      <View>
                        <Text style={styles.metricLabel}>Strain</Text>
                        <Text style={styles.metricValue}>
                          {workout.strain != null ? workout.strain.toFixed(1) : '--'}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.metricLabel}>Avg HR</Text>
                        <Text style={styles.metricValue}>
                          {workout.averageHeartRate != null
                            ? `${workout.averageHeartRate} bpm`
                            : '--'}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.metricLabel}>Max HR</Text>
                        <Text style={styles.metricValue}>
                          {workout.maxHeartRate != null ? `${workout.maxHeartRate} bpm` : '--'}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.metricLabel}>kcal</Text>
                        <Text style={styles.metricValue}>
                          {workout.caloriesKcal != null ? workout.caloriesKcal : '--'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {data.recovery.length === 0 &&
            data.sleep.length === 0 &&
            data.cycles.length === 0 &&
            data.workouts.length === 0 && (
              <Card>
                <Text style={[styles.mutedText, styles.centeredText]}>
                  No WHOOP data in the last 30 days. Sync your WHOOP to see data here.
                </Text>
              </Card>
            )}
        </>
      )}
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  errorCard: {
    marginBottom: 16,
  },
  errorText: {
    fontSize: typography.fontSizes.sm,
    color: colors.error,
    lineHeight: textRoles.bodySmall.lineHeight,
  },
  mutedText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    lineHeight: textRoles.bodySmall.lineHeight,
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: 12,
    lineHeight: textRoles.cardTitle.lineHeight,
  },
  recoveryScoreBox: {
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 12,
  },
  recoveryScoreValue: {
    fontSize: 48,
    fontWeight: typography.fontWeights.bold,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricItem: {
    flex: 1,
  },
  metricLabel: {
    fontSize: textRoles.metricLabel.fontSize,
    fontWeight: typography.fontWeights.medium,
    letterSpacing: textRoles.metricLabel.letterSpacing,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    lineHeight: 20,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dayRowDate: {
    width: 56,
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    lineHeight: textRoles.caption.lineHeight,
  },
  dayRowBars: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    paddingRight: 12,
  },
  miniBarFlex: {
    flex: 1,
  },
  miniBarContainer: {
    flex: 1,
  },
  miniBarLabel: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginBottom: 4,
    lineHeight: textRoles.caption.lineHeight,
  },
  miniBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  dayRowScore: {
    width: 40,
    alignItems: 'center',
  },
  dayRowScoreText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    lineHeight: textRoles.caption.lineHeight,
  },
  sleepHeaderRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  sleepStat: {
    flex: 1,
  },
  sleepStatValue: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    lineHeight: 34,
  },
  sleepChartRow: {
    flexDirection: 'row',
    gap: 4,
  },
  sleepBarContainer: {
    flex: 1,
    alignItems: 'center',
  },
  sleepBarDate: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginBottom: 4,
    lineHeight: textRoles.caption.lineHeight,
  },
  sleepBarStack: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.border,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  sleepBarSegment: {
    height: '100%',
  },
  sleepBarDuration: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    marginTop: 4,
    lineHeight: textRoles.caption.lineHeight,
  },
  sleepLegendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendBox: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  cyclesList: {
    gap: 0,
  },
  cycleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cycleDate: {
    width: 96,
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    lineHeight: textRoles.bodySmall.lineHeight,
  },
  cycleStats: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'flex-end',
  },
  cycleStat: {
    alignItems: 'center',
  },
  cycleStatValue: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    lineHeight: textRoles.buttonSmall.lineHeight,
  },
  workoutsList: {
    gap: 0,
  },
  workoutRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  workoutName: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
    color: colors.text,
    lineHeight: textRoles.body.lineHeight,
  },
  workoutDate: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
    marginTop: 2,
    lineHeight: textRoles.caption.lineHeight,
  },
  workoutDuration: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    lineHeight: textRoles.bodySmall.lineHeight,
  },
  workoutStats: {
    flexDirection: 'row',
    gap: 16,
  },
  centeredText: {
    textAlign: 'center',
  },
});
