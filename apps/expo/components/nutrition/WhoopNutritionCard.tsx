import React from 'react';
import { View, Text } from 'react-native';
import { Card } from '@/components/ui/Card';

interface WhoopNutritionCardProps {
  recovery: {
    score: number | null;
    status: 'red' | 'yellow' | 'green' | null;
    hrv: number | null;
  } | null;
  cycle: {
    caloriesBurned: number | null;
    totalStrain: number | null;
  } | null;
}

const statusLabels = {
  green: 'Optimal',
  yellow: 'Fair',
  red: 'Low',
};

const statusColors = {
  green: 'text-pine',
  yellow: 'text-yellow-500',
  red: 'text-coral',
};

export function WhoopNutritionCard({ recovery, cycle }: WhoopNutritionCardProps) {
  if (!recovery && !cycle) {
    return null;
  }

  return (
    <Card className="mb-4">
      <View className="p-4">
        <View className="flex-row items-center gap-2 mb-3">
          <Text className="text-coral text-lg">♥</Text>
          <Text className="text-darkText font-medium">Whoop Recovery</Text>
        </View>
        <View className="flex-row gap-4">
          {recovery !== null && (
            <>
              <View className="flex-1">
                <Text className="text-darkMuted text-xs mb-1">Recovery</Text>
                <View className="flex-row items-center gap-2">
                  <Text
                    className={`text-2xl font-bold ${statusColors[recovery.status ?? 'green']}`}
                  >
                    {recovery.score ?? '--'}
                  </Text>
                  {recovery.status !== null && (
                    <View
                      className={`rounded-full px-2 py-0.5 ${recovery.status === 'green' ? 'bg-pine/20' : recovery.status === 'yellow' ? 'bg-yellow-500/20' : 'bg-coral/20'}`}
                    >
                      <Text className={`text-xs ${statusColors[recovery.status]}`}>
                        {statusLabels[recovery.status]}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
              <View className="flex-1">
                <Text className="text-darkMuted text-xs mb-1">HRV</Text>
                <View className="flex-row items-center gap-1">
                  <Text className="text-lg font-semibold text-darkText">
                    {recovery.hrv ?? '--'}
                  </Text>
                  <Text className="text-darkMuted text-xs">ms</Text>
                </View>
              </View>
            </>
          )}
          {cycle !== null && (
            <>
              <View className="flex-1">
                <Text className="text-darkMuted text-xs mb-1">Calories</Text>
                <View className="flex-row items-center gap-1">
                  <Text className="text-lg font-semibold text-darkText">
                    {cycle.caloriesBurned ?? '--'}
                  </Text>
                </View>
              </View>
              <View className="flex-1">
                <Text className="text-darkMuted text-xs mb-1">Strain</Text>
                <View className="flex-row items-center gap-1">
                  <Text className="text-lg font-semibold text-darkText">
                    {cycle.totalStrain?.toFixed(1) ?? '--'}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </Card>
  );
}
