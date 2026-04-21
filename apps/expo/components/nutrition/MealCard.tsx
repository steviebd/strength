import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '@/components/ui/Card';

interface MealCardProps {
  entry: {
    id: string;
    name: string | null;
    mealType: string | null;
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    loggedAt: string | null | undefined;
  };
  onDelete?: () => void;
}

const mealTypeColors: Record<string, 'bg-coral' | 'bg-pine' | 'bg-darkBorder' | 'bg-darkMuted'> = {
  breakfast: 'bg-coral',
  lunch: 'bg-pine',
  dinner: 'bg-pine',
  snack: 'bg-darkMuted',
};

const mealTypeLabels: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export function MealCard({ entry }: MealCardProps) {
  const mealType = entry.mealType ?? 'snack';
  const mealTypeLabel = mealTypeLabels[mealType] ?? 'Snack';

  const loggedAt = entry.loggedAt ? new Date(entry.loggedAt) : null;
  const timeString = loggedAt
    ? loggedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';

  return (
    <Card className="mb-3">
      <View className="p-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-2 mb-1">
              <View
                className={`rounded-full px-2 py-0.5 ${mealTypeColors[mealType] ?? 'bg-darkMuted'}`}
              >
                <Text className="text-darkText text-xs font-medium">{mealTypeLabel}</Text>
              </View>
              {timeString.length > 0 && (
                <Text className="text-darkMuted text-xs">{timeString}</Text>
              )}
            </View>
            <Text className="text-darkText text-base font-medium mt-1" numberOfLines={1}>
              {entry.name ?? 'Unnamed meal'}
            </Text>
          </View>
          <View className="flex-shrink-0 text-right">
            <Text className="text-darkText text-lg font-semibold">{entry.calories ?? 0}</Text>
            <Text className="text-darkMuted text-xs">kcal</Text>
          </View>
        </View>
        <View className="flex-row gap-4 mt-3">
          <View>
            <Text className="text-darkMuted text-sm">
              P: <Text className="text-darkText font-medium">{entry.proteinG ?? 0}g</Text>
            </Text>
          </View>
          <View>
            <Text className="text-darkMuted text-sm">
              C: <Text className="text-darkText font-medium">{entry.carbsG ?? 0}g</Text>
            </Text>
          </View>
          <View>
            <Text className="text-darkMuted text-sm">
              F: <Text className="text-darkText font-medium">{entry.fatG ?? 0}g</Text>
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}
