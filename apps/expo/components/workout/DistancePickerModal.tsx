import { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TextInput, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/Button';
import { colors, spacing, radius, typography } from '@/theme';
import { formatDistance, parseDistanceInput, type DistanceUnit } from '@/lib/units';

interface DistancePickerModalProps {
  visible: boolean;
  initialMeters: number | null;
  unit: DistanceUnit;
  onSave: (meters: number) => void;
  onCancel: () => void;
}

export function DistancePickerModal({
  visible,
  initialMeters,
  unit,
  onSave,
  onCancel,
}: DistancePickerModalProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (initialMeters != null && initialMeters > 0) {
      if (unit === 'km') {
        setValue((initialMeters / 1000).toFixed(2));
      } else {
        setValue((initialMeters / 1609.344).toFixed(2));
      }
    } else {
      setValue('');
    }
  }, [initialMeters, unit, visible]);

  const handleSave = useCallback(() => {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num < 0) {
      onSave(0);
      return;
    }
    onSave(parseDistanceInput(num, unit));
  }, [value, unit, onSave]);

  const displayValue =
    initialMeters != null && initialMeters > 0 ? formatDistance(initialMeters, unit) : '—';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      transparent={false}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Distance</Text>
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
            placeholder="0.00"
            placeholderTextColor={colors.placeholderText}
          />
          <Text style={styles.unitLabel}>{unit === 'km' ? 'km' : 'mi'}</Text>
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
