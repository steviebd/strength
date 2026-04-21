import React from 'react';
import { View, Text } from 'react-native';

interface MacroProgressBarProps {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  color: string;
}

export function MacroProgressBar({ label, consumed, target, unit, color }: MacroProgressBarProps) {
  const percentage = target > 0 ? Math.min((consumed / target) * 100, 100) : 0;
  const isOver = consumed > target;

  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-darkText text-sm font-medium">{label}</Text>
        <Text className={`text-darkMuted text-xs ${isOver ? 'text-coral' : ''}`}>
          {consumed.toFixed(0)}
          {unit} / {target}
          {unit}
        </Text>
      </View>
      <View className="h-2 w-full overflow-hidden rounded-full bg-darkBorder">
        <View className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
      </View>
    </View>
  );
}
