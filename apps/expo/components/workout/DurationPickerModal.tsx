import { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components/ui/Button';
import { colors, spacing, radius, typography } from '@/theme';
import { formatDuration } from '@/lib/units';

interface DurationPickerModalProps {
  visible: boolean;
  initialSeconds: number;
  onSave: (seconds: number) => void;
  onCancel: () => void;
}

export function DurationPickerModal({
  visible,
  initialSeconds,
  onSave,
  onCancel,
}: DurationPickerModalProps) {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const h = Math.floor(initialSeconds / 3600);
    const m = Math.floor((initialSeconds % 3600) / 60);
    const s = initialSeconds % 60;
    setHours(h);
    setMinutes(m);
    setSeconds(s);
  }, [initialSeconds, visible]);

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  const adjust = useCallback((field: 'hours' | 'minutes' | 'seconds', delta: number) => {
    if (field === 'hours') {
      setHours((v) => Math.max(0, v + delta));
    } else if (field === 'minutes') {
      setMinutes((v) => {
        const next = v + delta;
        if (next >= 60) {
          setHours((h) => h + 1);
          return next - 60;
        }
        if (next < 0) {
          setHours((h) => Math.max(0, h - 1));
          return next + 60;
        }
        return Math.max(0, next);
      });
    } else {
      setSeconds((v) => {
        const next = v + delta;
        if (next >= 60) {
          setMinutes((m) => {
            const mNext = m + 1;
            if (mNext >= 60) {
              setHours((h) => h + 1);
              return mNext - 60;
            }
            return mNext;
          });
          return next - 60;
        }
        if (next < 0) {
          setMinutes((m) => {
            const mNext = m - 1;
            if (mNext < 0) {
              setHours((h) => Math.max(0, h - 1));
              return mNext + 60;
            }
            return Math.max(0, mNext);
          });
          return next + 60;
        }
        return Math.max(0, next);
      });
    }
  }, []);

  const handleSave = useCallback(() => {
    onSave(totalSeconds);
  }, [onSave, totalSeconds]);

  const Field = ({
    label,
    value,
    field,
    max,
  }: {
    label: string;
    value: number;
    field: 'hours' | 'minutes' | 'seconds';
    max?: number;
  }) => (
    <View style={styles.fieldColumn}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={() => adjust(field, 1)}
        style={({ pressed }) => [styles.arrowButton, pressed && styles.arrowButtonPressed]}
      >
        <Ionicons name="chevron-up" size={20} color={colors.textMuted} />
      </Pressable>
      <TextInput
        style={styles.fieldInput}
        value={String(value)}
        onChangeText={(text) => {
          const cleaned = text.replace(/[^0-9.]/g, '');
          const num = parseFloat(cleaned);
          if (Number.isNaN(num)) {
            if (field === 'hours') setHours(0);
            if (field === 'minutes') setMinutes(0);
            if (field === 'seconds') setSeconds(0);
            return;
          }
          const clamped = max !== undefined ? Math.min(num, max) : num;
          if (field === 'hours') setHours(clamped);
          if (field === 'minutes') setMinutes(clamped);
          if (field === 'seconds') setSeconds(clamped);
        }}
        keyboardType="decimal-pad"
        selectTextOnFocus
        textAlign="center"
      />
      <Pressable
        onPress={() => adjust(field, -1)}
        style={({ pressed }) => [styles.arrowButton, pressed && styles.arrowButtonPressed]}
      >
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      transparent={false}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Duration</Text>
          <Text style={styles.preview}>{formatDuration(totalSeconds)}</Text>
        </View>

        <View style={styles.fieldsRow}>
          <Field label="Hours" value={hours} field="hours" />
          <Text style={styles.separator}>:</Text>
          <Field label="Minutes" value={minutes} field="minutes" max={59} />
          <Text style={styles.separator}>:</Text>
          <Field label="Seconds" value={seconds} field="seconds" max={59} />
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
  fieldsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  fieldColumn: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  fieldLabel: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    fontWeight: typography.fontWeights.medium,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  arrowButton: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  fieldInput: {
    width: 80,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    textAlign: 'center',
  },
  separator: {
    fontSize: typography.fontSizes.xxl,
    fontWeight: typography.fontWeights.bold,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
});
