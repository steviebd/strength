import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  StyleSheet,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/ui/Button';
import { ScreenScrollView } from '@/components/ui/Screen';
import { colors, typography, spacing, radius } from '@/theme';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

function getMealTypeFromHour(hour: number): MealType {
  if (hour >= 6 && hour < 10) return 'Breakfast';
  if (hour >= 11 && hour < 14) return 'Lunch';
  if (hour >= 17 && hour < 20) return 'Dinner';
  return 'Snack';
}

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
  }) => Promise<void> | void;
  onDelete?: () => void;
  isSaving?: boolean;
}

const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export function SaveMealDialog({
  visible,
  onClose,
  analysis,
  onSave,
  onDelete,
  isSaving = false,
}: SaveMealDialogProps) {
  const [name, setName] = useState(analysis?.name ?? '');
  const [mealType, setMealType] = useState<MealType>('Breakfast');
  const [calories, setCalories] = useState(analysis ? String(analysis.calories) : '');
  const [protein, setProtein] = useState(analysis ? String(analysis.proteinG) : '');
  const [carbs, setCarbs] = useState(analysis ? String(analysis.carbsG) : '');
  const [fat, setFat] = useState(analysis ? String(analysis.fatG) : '');

  useEffect(() => {
    if (!analysis) {
      const hour = new Date().getHours();
      setMealType(getMealTypeFromHour(hour));
    }
  }, [visible, analysis]);

  useEffect(() => {
    if (analysis) {
      setName(analysis.name);
      setCalories(String(analysis.calories));
      setProtein(String(analysis.proteinG));
      setCarbs(String(analysis.carbsG));
      setFat(String(analysis.fatG));
    }
  }, [analysis]);

  const resetState = () => {
    setName('');
    setMealType(getMealTypeFromHour(new Date().getHours()));
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Meal name required', 'Enter a name before saving this meal.');
      return;
    }

    try {
      await onSave({
        name: name.trim(),
        mealType,
        calories: parseInt(calories, 10) || 0,
        protein: parseFloat(protein) || 0,
        carbs: parseFloat(carbs) || 0,
        fat: parseFloat(fat) || 0,
      });
      resetState();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save meal.';
      Alert.alert('Save failed', message);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDelete = () => {
    Alert.alert('Delete this meal?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDelete?.();
          handleClose();
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={spacing.lg}
        >
          <View style={styles.dialog}>
            <ScreenScrollView
              bottomInset={0}
              horizontalPadding={0}
              topPadding={0}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.header}>
                <Text style={styles.title}>Save Meal</Text>
                <View style={styles.headerButtons}>
                  {onDelete && (
                    <Pressable onPress={handleDelete} disabled={isSaving}>
                      <Ionicons name="trash-outline" size={20} color={colors.textMuted} />
                    </Pressable>
                  )}
                  <Pressable onPress={handleClose} disabled={isSaving}>
                    <Text style={styles.closeButton}>✕</Text>
                  </Pressable>
                </View>
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
                      key={`meal-type:${type}`}
                      onPress={() => setMealType(type)}
                      disabled={isSaving}
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
                <View style={[styles.field, styles.macroField]}>
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
                <View style={[styles.field, styles.macroField]}>
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
                <View style={[styles.field, styles.macroField]}>
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
                <Button
                  variant="ghost"
                  onPress={handleClose}
                  disabled={isSaving}
                  style={styles.actionButton}
                >
                  Cancel
                </Button>
                <Button
                  onPress={() => void handleSave()}
                  disabled={isSaving}
                  style={styles.actionButton}
                >
                  {isSaving ? 'Saving...' : 'Save Meal'}
                </Button>
              </View>
            </ScreenScrollView>
          </View>
        </KeyboardAvoidingView>
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
    flex: 1,
    paddingRight: spacing.md,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    minWidth: 0,
  },
  mealTypeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  mealTypeOption: {
    minWidth: '47%',
    flexGrow: 1,
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
    flexShrink: 1,
    textAlign: 'center',
  },
  mealTypeTextSelected: {
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  macroField: {
    minWidth: '30%',
    flexGrow: 1,
    flexBasis: 0,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  actionButton: {
    minWidth: 140,
    flexGrow: 1,
  },
});
