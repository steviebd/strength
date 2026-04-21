import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { apiFetch } from '@/lib/api';
import { transformWhoopData, WhoopData, WhoopRecovery, WhoopSleep } from '@/lib/whoop';

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
  if (score == null) return 'text-darkMuted';
  if (score < 40) return 'text-red-400';
  if (score < 70) return 'text-yellow-400';
  return 'text-green-400';
}

function getRecoveryBg(score: number | null): string {
  if (score == null) return 'bg-darkBorder';
  if (score < 40) return 'bg-red-500/20';
  if (score < 70) return 'bg-yellow-500/20';
  return 'bg-green-500/20';
}

function MiniBar({
  value,
  max,
  color,
  label,
}: {
  value: number | null;
  max: number;
  color: string;
  label: string;
}) {
  const pct = value != null ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View className="flex-1">
      <Text className="text-darkMuted text-xs mb-1">{label}</Text>
      <View className="h-2 rounded-full bg-darkBorder overflow-hidden">
        <View className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
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
    <View className="flex-row items-center py-2 border-b border-darkBorder last:border-0">
      <Text className="text-darkMuted text-xs w-14">{formatDate(recovery.date)}</Text>
      <View className="flex-1 flex-row gap-2 pr-3">
        <View className="flex-1">
          <MiniBar value={recovery.hrvRmssdMilli} max={hrvMax} color="bg-green-500" label="HRV" />
        </View>
        <View className="flex-1">
          <MiniBar value={recovery.restingHeartRate} max={rhrMax} color="bg-blue-500" label="RHR" />
        </View>
      </View>
      <View className="items-center w-10">
        <Text className={`text-sm font-bold ${scoreColor}`}>{score ?? '--'}</Text>
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
    <View className="flex-1 items-center">
      <Text className="text-darkMuted text-xs mb-1">{formatDate(sleep.start).split(',')[0]}</Text>
      <View className="w-full h-12 rounded-full flex-row overflow-hidden bg-darkBorder">
        {deepPct > 0 && <View className="bg-purple-600 h-full" style={{ width: `${deepPct}%` }} />}
        {remPct > 0 && <View className="bg-blue-500 h-full" style={{ width: `${remPct}%` }} />}
        {lightPct > 0 && <View className="bg-gray-500 h-full" style={{ width: `${lightPct}%` }} />}
      </View>
      <Text className="text-darkText text-xs mt-1 font-medium">
        {formatDuration(sleep.totalSleepTimeMilli)}
      </Text>
    </View>
  );
}

export default function WhoopDataPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <View className="flex-1 bg-darkBg">
      <View
        className="flex-row items-center justify-between px-6 pt-3 pb-4"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable onPress={() => router.back()} className="mr-4">
          <Text className="text-2xl text-darkText">&larr;</Text>
        </Pressable>
        <Text className="text-xl font-semibold text-darkText flex-1">WHOOP Data</Text>
      </View>

      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingBottom: 100 }}>
        {isLoading && (
          <View className="items-center py-20">
            <ActivityIndicator color="#F97066" size="large" />
          </View>
        )}

        {error && (
          <Card className="mb-4">
            <Text className="text-red-400 text-sm">Failed to load WHOOP data</Text>
          </Card>
        )}

        {!isLoading && !error && !data && (
          <Card className="mb-4">
            <Text className="text-darkMuted text-sm">No data available</Text>
          </Card>
        )}

        {!isLoading && data && (
          <>
            <Card className="mb-4">
              <Text className="text-darkText mb-3 text-base font-semibold">Recovery</Text>
              {latestRecovery ? (
                <View>
                  <View
                    className={`rounded-xl p-4 mb-3 ${getRecoveryBg(latestRecovery.recoveryScore)}`}
                  >
                    <Text className="text-darkMuted text-xs mb-1">Recovery Score</Text>
                    <Text
                      className={`text-4xl font-bold ${getRecoveryColor(latestRecovery.recoveryScore)}`}
                    >
                      {latestRecovery.recoveryScore ?? '--'}
                    </Text>
                  </View>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-darkMuted text-xs">HRV</Text>
                      <Text className="text-darkText font-medium">
                        {latestRecovery.hrvRmssdMilli != null
                          ? `${latestRecovery.hrvRmssdMilli} ms`
                          : '--'}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-darkMuted text-xs">RHR</Text>
                      <Text className="text-darkText font-medium">
                        {latestRecovery.restingHeartRate != null
                          ? `${latestRecovery.restingHeartRate} bpm`
                          : '--'}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-darkMuted text-xs">Resp Rate</Text>
                      <Text className="text-darkText font-medium">
                        {latestRecovery.respiratoryRate != null
                          ? `${latestRecovery.respiratoryRate} br/min`
                          : '--'}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <Text className="text-darkMuted text-sm">No recovery data</Text>
              )}
            </Card>

            {last7Recovery.length > 1 && (
              <Card className="mb-4">
                <Text className="text-darkText mb-3 text-base font-semibold">
                  Recovery (7 days)
                </Text>
                <View>
                  {last7Recovery.map((r) => (
                    <RecoveryDayRow key={r.id} recovery={r} />
                  ))}
                </View>
                <View className="flex-row mt-3 pt-2 border-t border-darkBorder gap-3">
                  <View className="flex-row items-center gap-1">
                    <View className="w-2 h-2 rounded-full bg-green-500" />
                    <Text className="text-darkMuted text-xs">HRV</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <View className="w-2 h-2 rounded-full bg-blue-500" />
                    <Text className="text-darkMuted text-xs">RHR</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-darkMuted text-xs">Score: </Text>
                    <View className="w-2 h-2 rounded-full bg-green-400" />
                    <Text className="text-darkMuted text-xs">&ge;70</Text>
                    <View className="w-2 h-2 rounded-full bg-yellow-400" />
                    <Text className="text-darkMuted text-xs">40-69</Text>
                    <View className="w-2 h-2 rounded-full bg-red-400" />
                    <Text className="text-darkMuted text-xs">&lt;40</Text>
                  </View>
                </View>
              </Card>
            )}

            <Card className="mb-4">
              <Text className="text-darkText mb-3 text-base font-semibold">Sleep</Text>
              {latestSleep ? (
                <View>
                  <View className="flex-row items-end gap-3 mb-3">
                    <View className="flex-1">
                      <Text className="text-darkMuted text-xs">Sleep Performance</Text>
                      <Text className="text-darkText text-2xl font-bold">
                        {latestSleep.sleepPerformancePercentage ?? '--'}%
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-darkMuted text-xs">Total Sleep</Text>
                      <Text className="text-darkText text-2xl font-bold">
                        {formatDuration(latestSleep.totalSleepTimeMilli)}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Text className="text-darkMuted text-xs">Deep</Text>
                      <Text className="text-darkText font-medium">
                        {formatDuration(latestSleep.slowWaveSleepTimeMilli)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-darkMuted text-xs">REM</Text>
                      <Text className="text-darkText font-medium">
                        {formatDuration(latestSleep.remSleepTimeMilli)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-darkMuted text-xs">Light</Text>
                      <Text className="text-darkText font-medium">
                        {formatDuration(latestSleep.lightSleepTimeMilli)}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-darkMuted text-xs">Efficiency</Text>
                      <Text className="text-darkText font-medium">
                        {latestSleep.sleepEfficiencyPercentage != null
                          ? `${latestSleep.sleepEfficiencyPercentage}%`
                          : '--'}
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <Text className="text-darkMuted text-sm">No sleep data</Text>
              )}
            </Card>

            {last7Sleep.length > 1 && (
              <Card className="mb-4">
                <Text className="text-darkText mb-3 text-base font-semibold">Sleep (7 days)</Text>
                <View className="flex-row gap-1">
                  {last7Sleep.map((s) => (
                    <SleepDayBar key={s.id} sleep={s} />
                  ))}
                </View>
                <View className="flex-row justify-center mt-3 pt-2 border-t border-darkBorder gap-4">
                  <View className="flex-row items-center gap-1">
                    <View className="w-3 h-3 rounded-sm bg-purple-600" />
                    <Text className="text-darkMuted text-xs">Deep</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <View className="w-3 h-3 rounded-sm bg-blue-500" />
                    <Text className="text-darkMuted text-xs">REM</Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <View className="w-3 h-3 rounded-sm bg-gray-500" />
                    <Text className="text-darkMuted text-xs">Light</Text>
                  </View>
                </View>
              </Card>
            )}

            {data.cycles.length > 0 && (
              <Card className="mb-4">
                <Text className="text-darkText mb-3 text-base font-semibold">Daily Cycles</Text>
                <View className="gap-2">
                  {data.cycles.slice(0, 14).map((cycle) => (
                    <View
                      key={cycle.id}
                      className="flex-row items-center justify-between py-2 border-b border-darkBorder last:border-0"
                    >
                      <Text className="text-darkMuted text-sm w-24">{formatDate(cycle.start)}</Text>
                      <View className="flex-row gap-4 flex-1 justify-end">
                        <View className="items-center">
                          <Text className="text-darkMuted text-xs">Strain</Text>
                          <Text className="text-darkText font-medium">
                            {cycle.dayStrain != null ? cycle.dayStrain.toFixed(1) : '--'}
                          </Text>
                        </View>
                        <View className="items-center">
                          <Text className="text-darkMuted text-xs">Avg HR</Text>
                          <Text className="text-darkText font-medium">
                            {cycle.averageHeartRate ?? '--'}
                          </Text>
                        </View>
                        <View className="items-center">
                          <Text className="text-darkMuted text-xs">kJ</Text>
                          <Text className="text-darkText font-medium">
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
              <Card className="mb-4">
                <Text className="text-darkText mb-3 text-base font-semibold">Workouts</Text>
                <View className="gap-2">
                  {data.workouts.map((workout) => (
                    <View
                      key={workout.id}
                      className="py-3 border-b border-darkBorder last:border-0"
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <View>
                          <Text className="text-darkText font-medium">
                            {workout.sportName ?? 'Workout'}
                          </Text>
                          <Text className="text-darkMuted text-xs">
                            {formatDate(workout.start)}
                          </Text>
                        </View>
                        <Text className="text-darkMuted text-sm">
                          {formatWorkoutDuration(workout.start, workout.end)}
                        </Text>
                      </View>
                      <View className="flex-row gap-4">
                        <View>
                          <Text className="text-darkMuted text-xs">Strain</Text>
                          <Text className="text-darkText font-medium">
                            {workout.strain != null ? workout.strain.toFixed(1) : '--'}
                          </Text>
                        </View>
                        <View>
                          <Text className="text-darkMuted text-xs">Avg HR</Text>
                          <Text className="text-darkText font-medium">
                            {workout.averageHeartRate != null
                              ? `${workout.averageHeartRate} bpm`
                              : '--'}
                          </Text>
                        </View>
                        <View>
                          <Text className="text-darkMuted text-xs">Max HR</Text>
                          <Text className="text-darkText font-medium">
                            {workout.maxHeartRate != null ? `${workout.maxHeartRate} bpm` : '--'}
                          </Text>
                        </View>
                        <View>
                          <Text className="text-darkMuted text-xs">kcal</Text>
                          <Text className="text-darkText font-medium">
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
                  <Text className="text-darkMuted text-sm text-center">
                    No WHOOP data in the last 30 days. Sync your WHOOP to see data here.
                  </Text>
                </Card>
              )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
