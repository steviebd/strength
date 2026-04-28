import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useState } from 'react';
import { colors, radius, spacing, typography } from '@/theme';
import { convertToStorageWeight } from '@strength/db/client';

interface WeightPickerModalProps {
  visible: boolean;
  weightUnit: 'kg' | 'lbs';
  onSave: (bodyweightKg: number) => Promise<void> | void;
  onSkip: () => Promise<void> | void;
  isSaving?: boolean;
}

export function WeightPickerModal({
  visible,
  weightUnit,
  onSave,
  onSkip,
  isSaving = false,
}: WeightPickerModalProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    const value = parseFloat(inputValue);
    if (isNaN(value) || value <= 0) {
      return;
    }
    setIsSubmitting(true);
    const kg = convertToStorageWeight(value, weightUnit);
    await onSave(kg);
    setIsSubmitting(false);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onSkip}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Enter your weight</Text>
          <Text style={styles.description}>
            This helps us calculate your macronutrient targets and track progress accurately.
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.inputCard}>
            <TextInput
              testID="onboarding-weight-input"
              style={styles.input}
              placeholder="0.0"
              placeholderTextColor={colors.placeholderText}
              keyboardType="decimal-pad"
              returnKeyType="done"
              value={inputValue}
              onChangeText={setInputValue}
            />
            <Text style={styles.unitLabel}>{weightUnit}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            testID="onboarding-weight-save"
            accessibilityLabel="onboarding-weight-save"
            onPress={handleSave}
            disabled={isSubmitting || isSaving}
            style={[
              styles.confirmButton,
              (isSubmitting || isSaving) && styles.confirmButtonDisabled,
            ]}
          >
            {isSubmitting || isSaving ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={styles.confirmButtonText}>Save</Text>
            )}
          </Pressable>

          <Pressable
            testID="onboarding-weight-skip"
            accessibilityLabel="onboarding-weight-skip"
            onPress={onSkip}
            disabled={isSubmitting || isSaving}
            style={styles.skipButton}
          >
            <Text style={styles.skipButtonText}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
  },
  description: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
    lineHeight: 21,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  input: {
    fontSize: 48,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    minWidth: 150,
    textAlign: 'center',
  },
  unitLabel: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  confirmButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: radius.xl,
    backgroundColor: colors.accent,
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmButtonText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: radius.xl,
  },
  skipButtonText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
  },
});
