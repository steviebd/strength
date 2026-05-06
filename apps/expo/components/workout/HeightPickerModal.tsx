import { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TextInput, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, spacing, radius, typography } from '@/theme';
import { formatHeight, parseHeightInput, type DistanceUnit } from '@/lib/units';

interface HeightPickerModalProps {
  visible: boolean;
  initialCm: number | null;
  unit: DistanceUnit;
  onSave: (cm: number) => void;
  onCancel: () => void;
}

export function HeightPickerModal({
  visible,
  initialCm,
  unit,
  onSave,
  onCancel,
}: HeightPickerModalProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (initialCm != null && initialCm > 0) {
      if (unit === 'km') {
        setValue(String(Math.round(initialCm)));
      } else {
        setValue(String(Math.round(initialCm / 2.54)));
      }
    } else {
      setValue('');
    }
  }, [initialCm, unit, visible]);

  const handleSave = useCallback(() => {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num < 0) {
      onSave(0);
      return;
    }
    onSave(parseHeightInput(num, unit));
  }, [value, unit, onSave]);

  const displayValue = initialCm != null && initialCm > 0 ? formatHeight(initialCm, unit) : '—';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      transparent={false}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Height</Text>
          <Text style={styles.preview}>{displayValue}</Text>
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            placeholder="0"
            placeholderTextColor={colors.placeholderText}
          />
          <Text style={styles.unitLabel}>{unit === 'km' ? 'cm' : 'in'}</Text>
        </View>

        <View style={styles.footer}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} fullWidth />
          <Button label="Save" variant="primary" onPress={handleSave} fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  preview: {
    fontSize: typography.fontSizes.xxxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.accent,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  input: {
    width: 160,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
  },
  unitLabel: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textMuted,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
