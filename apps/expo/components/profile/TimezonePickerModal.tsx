import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  formatTimeZoneLabel,
  IANA_TIME_ZONES,
  normalizeTimeZoneSearchValue,
} from '@strength/db/client';
import { colors, radius, spacing, typography } from '@/theme';

interface TimezonePickerModalProps {
  visible: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  selectedTimezone: string | null;
  onClose: () => void;
  onConfirm: (timezone: string) => Promise<void> | void;
  isSaving?: boolean;
  dismissLocked?: boolean;
  acceptFirst?: boolean;
  alternateActionLabel?: string;
}

function getSearchScore(timeZone: string, query: string) {
  if (!query) {
    return 0;
  }

  const normalizedZone = normalizeTimeZoneSearchValue(timeZone);
  const cityName = normalizedZone.split(' ').at(-1) ?? normalizedZone;

  if (normalizedZone === query) {
    return 4;
  }

  if (cityName === query) {
    return 3;
  }

  if (normalizedZone.startsWith(query) || cityName.startsWith(query)) {
    return 2;
  }

  if (normalizedZone.includes(query)) {
    return 1;
  }

  return -1;
}

export function TimezonePickerModal({
  visible,
  title = 'Select Timezone',
  description = 'Choose the timezone you want the app to use.',
  confirmLabel = 'Save timezone',
  selectedTimezone,
  onClose,
  onConfirm,
  isSaving = false,
  dismissLocked = false,
  acceptFirst = false,
  alternateActionLabel = 'Choose different timezone',
}: TimezonePickerModalProps) {
  const [query, setQuery] = useState('');
  const [draftTimezone, setDraftTimezone] = useState<string | null>(selectedTimezone);
  const [showSearch, setShowSearch] = useState(!acceptFirst || !selectedTimezone);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setDraftTimezone(selectedTimezone);
    setQuery('');
    setShowSearch(!acceptFirst || !selectedTimezone);
  }, [acceptFirst, selectedTimezone, visible]);

  const normalizedQuery = normalizeTimeZoneSearchValue(query.trim());

  const filteredTimeZones = useMemo(() => {
    const matches = IANA_TIME_ZONES.map((timeZone) => ({
      timeZone,
      score: getSearchScore(timeZone, normalizedQuery),
    })).filter((item) => item.score >= 0);

    matches.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.timeZone.localeCompare(right.timeZone);
    });

    return matches.map((item) => item.timeZone);
  }, [normalizedQuery]);

  const handleClose = () => {
    if (dismissLocked || isSaving) {
      return;
    }

    onClose();
  };

  const handleConfirm = async () => {
    if (!draftTimezone || isSaving) {
      return;
    }

    await onConfirm(draftTimezone);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.description}>{description}</Text>
            </View>
            {!dismissLocked && (
              <Pressable onPress={handleClose} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            )}
          </View>

          {showSearch ? (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search timezones"
                placeholderTextColor={colors.placeholderText}
                autoCapitalize="none"
                autoCorrect={false}
                value={query}
                onChangeText={setQuery}
              />
            </View>
          ) : null}
        </View>

        {showSearch ? (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          >
            {filteredTimeZones.map((timeZone) => {
              const isSelected = draftTimezone === timeZone;

              return (
                <Pressable
                  key={`timezone:${timeZone}`}
                  onPress={() => setDraftTimezone(timeZone)}
                  style={[styles.option, isSelected && styles.optionSelected]}
                >
                  <View style={styles.optionContent}>
                    <Text style={styles.optionTitle}>{timeZone}</Text>
                    <Text style={styles.optionSubtitle}>{formatTimeZoneLabel(timeZone)}</Text>
                  </View>
                  <View style={[styles.radio, isSelected && styles.radioSelected]}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                </Pressable>
              );
            })}

            {filteredTimeZones.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No matching timezones found.</Text>
              </View>
            )}
          </ScrollView>
        ) : (
          <View style={styles.acceptContainer}>
            <View style={styles.acceptCard}>
              <Text style={styles.acceptEyebrow}>Detected timezone</Text>
              <Text style={styles.acceptTitle}>{draftTimezone}</Text>
              <Text style={styles.acceptSubtitle}>
                This timezone will be used for workouts, nutrition days, and reporting.
              </Text>
            </View>

            <Pressable
              onPress={() => setShowSearch(true)}
              disabled={isSaving}
              style={styles.secondaryActionButton}
            >
              <Text style={styles.secondaryActionText}>{alternateActionLabel}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.footer}>
          <Pressable
            testID="onboarding-timezone-confirm"
            accessibilityLabel="onboarding-timezone-confirm"
            onPress={handleConfirm}
            disabled={!draftTimezone || isSaving}
            style={[
              styles.confirmButton,
              (!draftTimezone || isSaving) && styles.confirmButtonDisabled,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
            )}
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
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTextBlock: {
    flex: 1,
    gap: spacing.xs,
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
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeButtonText: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 24,
  },
  searchContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    height: 48,
    color: colors.text,
    fontSize: typography.fontSizes.base,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  acceptContainer: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  acceptCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  acceptEyebrow: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    textTransform: 'uppercase',
  },
  acceptTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.semibold,
  },
  acceptSubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
    lineHeight: 21,
  },
  secondaryActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.medium,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceAlt,
  },
  optionContent: {
    flex: 1,
    gap: spacing.xs,
  },
  optionTitle: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
  },
  optionSubtitle: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  emptyState: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyStateText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.base,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
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
});
