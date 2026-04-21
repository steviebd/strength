import React, { useState } from 'react';
import { View, Text, TextInput, Modal, StyleSheet, Pressable } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ScreenScrollView } from '@/components/ui/Screen';
import { colors, typography, spacing, radius } from '@/theme';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

interface SaveMealDialogProps {
  visible: boolean;
  onClose: () => void;
  analysis?: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null;
  onSave: (data: {
    name: string;
    mealType: MealType;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }) => void;
}

const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export function SaveMealDialog({ visible, onClose, analysis, onSave }: SaveMealDialogProps) {
  const [name, setName] = useState(analysis?.name ?? '');
  const [mealType, setMealType] = useState<MealType>('Breakfast');
  const [calories, setCalories] = useState(analysis ? String(analysis.calories) : '');
  const [protein, setProtein] = useState(analysis ? String(analysis.proteinG) : '');
  const [carbs, setCarbs] = useState(analysis ? String(analysis.carbsG) : '');
  const [fat, setFat] = useState(analysis ? String(analysis.fatG) : '');

  React.useEffect(() => {
    if (analysis) {
      setName(analysis.name);
      setCalories(String(analysis.calories));
      setProtein(String(analysis.proteinG));
      setCarbs(String(analysis.carbsG));
      setFat(String(analysis.fatG));
    }
  }, [analysis]);

  const handleSave = () => {
    onSave({
      name,
      mealType,
      calories: parseInt(calories, 10) || 0,
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
    });
    setName('');
    setMealType('Breakfast');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  };

  const handleClose = () => {
    setName('');
    setMealType('Breakfast');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <ScreenScrollView
            bottomInset={0}
            horizontalPadding={0}
            topPadding={0}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.header}>
              <Text style={styles.title}>Save Meal</Text>
              <Pressable onPress={handleClose}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Meal Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Grilled Chicken Salad"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Meal Type</Text>
              <View style={styles.mealTypeSelector}>
                {MEAL_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => setMealType(type)}
                    style={[
                      styles.mealTypeOption,
                      mealType === type && styles.mealTypeOptionSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.mealTypeText,
                        mealType === type && styles.mealTypeTextSelected,
                      ]}
                    >
                      {type}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Calories</Text>
              <TextInput
                style={styles.input}
                value={calories}
                onChangeText={setCalories}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Protein (g)</Text>
                <TextInput
                  style={styles.input}
                  value={protein}
                  onChangeText={setProtein}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  value={carbs}
                  onChangeText={setCarbs}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Fat (g)</Text>
                <TextInput
                  style={styles.input}
                  value={fat}
                  onChangeText={setFat}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.actions}>
              <Button variant="ghost" onPress={handleClose}>
                Cancel
              </Button>
              <Button onPress={handleSave}>Save Meal</Button>
            </View>
          </ScreenScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  dialog: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '85%',
  },
  scrollContent: {
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  closeButton: {
    fontSize: typography.fontSizes.xl,
    color: colors.textMuted,
    padding: spacing.xs,
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: typography.fontSizes.base,
    color: colors.text,
  },
  mealTypeSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  mealTypeOption: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  mealTypeOptionSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  mealTypeText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
  },
  mealTypeTextSelected: {
    color: '#ffffff',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
