import React from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { MacroProgressBar } from '@/components/nutrition/MacroProgressBar';
import { MealCard } from '@/components/nutrition/MealCard';
import { WhoopNutritionCard } from '@/components/nutrition/WhoopNutritionCard';

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

function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const percentage = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  const remaining = Math.max(target - consumed, 0);
  const isOver = consumed > target;

  return (
    <Card className="mb-4">
      <View className="items-center p-4">
        <View className="h-40 w-40 items-center justify-center">
          <View className="absolute inset-0 rounded-full border-[12] border-darkBorder" />
          <View
            className="absolute inset-0 rounded-full"
            style={{
              borderTopColor: percentage > 0 ? '#ef6f4f' : 'transparent',
              borderRightColor: percentage > 25 ? '#ef6f4f' : 'transparent',
              borderBottomColor: percentage > 50 ? '#ef6f4f' : 'transparent',
              borderLeftColor: percentage > 75 ? '#ef6f4f' : 'transparent',
              transform: [{ rotate: '-90deg' }],
            }}
          />
          <View className="items-center justify-center">
            <Text className={`text-3xl font-bold ${isOver ? 'text-coral' : 'text-darkText'}`}>
              {consumed}
            </Text>
            <Text className="text-darkMuted text-xs">{isOver ? 'over' : 'remaining'}</Text>
          </View>
        </View>
        <View className="mt-2 text-center">
          <Text className="text-sm text-darkMuted">
            {remaining > 0 ? `${remaining} left` : `${Math.abs(remaining)} over`}
          </Text>
          <Text className="text-xs text-darkMuted">of {target} kcal</Text>
        </View>
      </View>
    </Card>
  );
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
    queryFn: async () => {
      return apiFetch<DailySummary>(`/api/nutrition/daily-summary?date=${today}`);
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg">
        <ActivityIndicator size="large" color="#ef6f4f" />
      </View>
    );
  }

  if (error || !summary) {
    return (
      <View className="flex-1 items-center justify-center bg-darkBg">
        <Text className="text-darkMuted">Failed to load nutrition data</Text>
      </View>
    );
  }

  const { entries, totals, targets, whoopRecovery, whoopCycle } = summary;

  return (
    <View className="flex-1 bg-darkBg">
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="px-6 pt-16">
          <Text className="text-darkText text-2xl font-semibold mb-6">Nutrition</Text>

          <CalorieRing consumed={totals.calories} target={targets.calories} />

          <Card className="mb-4">
            <View className="p-4">
              <MacroProgressBar
                label="Protein"
                consumed={totals.proteinG}
                target={targets.proteinG}
                unit="g"
                color="bg-blue-500"
              />
              <MacroProgressBar
                label="Carbs"
                consumed={totals.carbsG}
                target={targets.carbsG}
                unit="g"
                color="bg-orange-500"
              />
              <MacroProgressBar
                label="Fat"
                consumed={totals.fatG}
                target={targets.fatG}
                unit="g"
                color="bg-red-500"
              />
            </View>
          </Card>

          {(whoopRecovery !== null || whoopCycle !== null) && (
            <WhoopNutritionCard recovery={whoopRecovery} cycle={whoopCycle} />
          )}

          <View className="mb-4">
            <Text className="text-darkText text-lg font-semibold mb-3">Today&apos;s Meals</Text>
            {entries.length === 0 ? (
              <Card>
                <View className="p-6 text-center">
                  <Text className="text-darkMuted">No meals logged yet</Text>
                  <Text className="text-darkMuted text-sm mt-1">Tap + to log your first meal</Text>
                </View>
              </Card>
            ) : (
              entries.map((entry) => <MealCard key={entry.id} entry={entry} />)
            )}
          </View>
        </View>
      </ScrollView>

      <View className="absolute bottom-24 right-6">
        <Pressable
          className="h-14 w-14 items-center justify-center rounded-full bg-coral shadow-lg shadow-coral/30"
          onPress={() => router.push('/nutrition/chat')}
        >
          <Text className="text-2xl text-white">+</Text>
        </Pressable>
      </View>
    </View>
  );
}
