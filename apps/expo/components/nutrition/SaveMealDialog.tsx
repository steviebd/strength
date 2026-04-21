import React, { useState, useEffect } from 'react';
import { Modal, Pressable, ScrollView, Text, View, TextInput } from 'react-native';
import { Button } from '@/components/ui/Button';

interface SaveMealDialogProps {
  visible: boolean;
  onClose: () => void;
  analysis: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
  onSave: (data: {
    name: string;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) => void;
}

function inferMealTypeFromTime(): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = new Date().getHours();
  if (hour < 10) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 19) return 'dinner';
  return 'snack';
}

const mealTypes = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
] as const;

export function SaveMealDialog({ visible, onClose, analysis, onSave }: SaveMealDialogProps) {
  const [name, setName] = useState('');
  const [mealType, setMealType] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('snack');
  const [calories, setCalories] = useState(0);
  const [proteinG, setProteinG] = useState(0);
  const [carbsG, setCarbsG] = useState(0);
  const [fatG, setFatG] = useState(0);

  useEffect(() => {
    if (analysis) {
      setName(analysis.name);
      setCalories(analysis.calories);
      setProteinG(analysis.proteinG);
      setCarbsG(analysis.carbsG);
      setFatG(analysis.fatG);
      setMealType(inferMealTypeFromTime());
    }
  }, [analysis]);

  const handleSave = () => {
    onSave({ name, mealType, calories, proteinG, carbsG, fatG });
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
    >
      <View className="flex-1 bg-darkBg">
        <View className="flex-row items-center justify-between border-b border-darkBorder p-4">
          <Text className="text-darkText text-lg font-semibold">Save Meal</Text>
          <Pressable onPress={onClose} className="p-2">
            <Text className="text-coral text-lg">✕</Text>
          </Pressable>
        </View>
        <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 40 }}>
          <View className="mb-4">
            <Text className="text-darkMuted text-sm mb-2">Meal Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g., Grilled Chicken Salad"
              placeholderTextColor="#6B7280"
              className="h-12 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText"
            />
          </View>

          <View className="mb-4">
            <Text className="text-darkMuted text-sm mb-2">Meal Type</Text>
            <View className="flex-row gap-2">
              {mealTypes.map((type) => (
                <Pressable
                  key={type.value}
                  onPress={() => setMealType(type.value)}
                  className={`flex-1 rounded-xl border py-2 px-3 ${mealType === type.value ? 'border-coral bg-coral/10' : 'border-darkBorder'}`}
                >
                  <Text
                    className={`text-center text-sm ${mealType === type.value ? 'text-coral' : 'text-darkMuted'}`}
                  >
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="mb-4">
            <Text className="text-darkMuted text-sm mb-2">Calories</Text>
            <TextInput
              value={calories.toString()}
              onChangeText={(v) => setCalories(Number(v) || 0)}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor="#6B7280"
              className="h-12 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText"
            />
          </View>

          <View className="grid grid-cols-3 gap-3">
            <View className="mb-4">
              <Text className="text-darkMuted text-sm mb-2">Protein (g)</Text>
              <TextInput
                value={proteinG.toString()}
                onChangeText={(v) => setProteinG(Number(v) || 0)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#6B7280"
                className="h-12 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText"
              />
            </View>
            <View className="mb-4">
              <Text className="text-darkMuted text-sm mb-2">Carbs (g)</Text>
              <TextInput
                value={carbsG.toString()}
                onChangeText={(v) => setCarbsG(Number(v) || 0)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#6B7280"
                className="h-12 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText"
              />
            </View>
            <View className="mb-4">
              <Text className="text-darkMuted text-sm mb-2">Fat (g)</Text>
              <TextInput
                value={fatG.toString()}
                onChangeText={(v) => setFatG(Number(v) || 0)}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#6B7280"
                className="h-12 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText"
              />
            </View>
          </View>

          <View className="mt-4 flex-row gap-3">
            <Button variant="outline" onPress={onClose} className="flex-1">
              Cancel
            </Button>
            <Button onPress={handleSave} className="flex-1">
              Save
            </Button>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
