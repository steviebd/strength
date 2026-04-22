import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type TextLayoutEventData } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';

interface MealAnalysis {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;
  analysis?: MealAnalysis;
  savedEntryId?: string | null;
}

interface ChatExchange {
  id: string;
  userMessage?: ChatEntry;
  assistantMessage?: ChatEntry;
}

interface ChatMessageProps {
  exchange: ChatExchange;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSaveAnalysis?: (
    messageId: string,
    analysis: MealAnalysis,
    savedEntryId?: string | null,
  ) => void;
  isSavingAnalysis?: boolean;
}

const COLLAPSED_USER_LINES = 1;
const COLLAPSED_ASSISTANT_LINES = 2;

function getLineCount(event: NativeSyntheticEvent<TextLayoutEventData>) {
  return event.nativeEvent.lines.length;
}

export function ChatMessage({
  exchange,
  expanded,
  onToggleExpanded,
  onSaveAnalysis,
  isSavingAnalysis = false,
}: ChatMessageProps) {
  const [userNeedsToggle, setUserNeedsToggle] = useState(false);
  const [assistantNeedsToggle, setAssistantNeedsToggle] = useState(false);
  const userMessage = exchange.userMessage;
  const assistantMessage = exchange.assistantMessage;
  const analysis = assistantMessage?.analysis;
  const isSaved = Boolean(assistantMessage?.savedEntryId);

  useEffect(() => {
    setUserNeedsToggle(false);
    setAssistantNeedsToggle(false);
  }, [exchange.id]);

  const showToggle = expanded || userNeedsToggle || assistantNeedsToggle;

  const summaryLabel = useMemo(() => {
    if (expanded) {
      return 'Show less';
    }

    return 'Show more';
  }, [expanded]);

  return (
    <Animated.View style={styles.container}>
      <Pressable onPress={onToggleExpanded} style={styles.card}>
        {userMessage ? (
          <View style={styles.userSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>You</Text>
            </View>
            <View style={styles.userBubble}>
              {userMessage.imageUri ? (
                <Image source={{ uri: userMessage.imageUri }} style={styles.thumbnail} />
              ) : null}
              <Text
                style={styles.userText}
                numberOfLines={expanded ? undefined : COLLAPSED_USER_LINES}
                onTextLayout={(event) => {
                  if (userNeedsToggle) return;
                  if (getLineCount(event) > COLLAPSED_USER_LINES) {
                    setUserNeedsToggle(true);
                  }
                }}
              >
                {userMessage.content}
              </Text>
            </View>
          </View>
        ) : null}

        {assistantMessage ? (
          <View style={styles.assistantSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Coach</Text>
            </View>
            <View style={styles.assistantBubble}>
              <Text
                style={styles.assistantText}
                numberOfLines={expanded ? undefined : COLLAPSED_ASSISTANT_LINES}
                onTextLayout={(event) => {
                  if (assistantNeedsToggle) return;
                  if (getLineCount(event) > COLLAPSED_ASSISTANT_LINES) {
                    setAssistantNeedsToggle(true);
                  }
                }}
              >
                {assistantMessage.content}
              </Text>

              {analysis ? (
                <View style={styles.analysisCard}>
                  <View style={styles.analysisHeader}>
                    <Text style={styles.analysisEmoji}>🍽️</Text>
                    <Text style={styles.mealName}>{analysis.name}</Text>
                    {expanded ? (
                      <Button
                        size="sm"
                        variant={isSaved ? 'default' : 'ghost'}
                        onPress={() =>
                          assistantMessage
                            ? onSaveAnalysis?.(
                                assistantMessage.id,
                                analysis,
                                assistantMessage.savedEntryId,
                              )
                            : undefined
                        }
                        disabled={isSavingAnalysis}
                      >
                        {isSavingAnalysis ? 'Saving...' : isSaved ? 'Saved' : 'Save'}
                      </Button>
                    ) : null}
                  </View>
                  <View style={styles.macroRow}>
                    <Text style={styles.calories}>{analysis.calories} kcal</Text>
                    <Text style={styles.macro}>P {analysis.proteinG}g</Text>
                    <Text style={styles.macro}>C {analysis.carbsG}g</Text>
                    <Text style={styles.macro}>F {analysis.fatG}g</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {showToggle ? (
          <View style={styles.toggleRow}>
            <Text style={styles.toggleText}>{summaryLabel}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  card: {
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  userSection: {
    gap: spacing.xs,
  },
  assistantSection: {
    gap: spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  userBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(239,111,79,0.12)',
    padding: spacing.md,
  },
  assistantBubble: {
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: spacing.md,
    gap: spacing.md,
  },
  userText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.fontSizes.base,
    lineHeight: 21,
  },
  assistantText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    lineHeight: 22,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
  },
  analysisCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,111,79,0.2)',
    backgroundColor: 'rgba(239,111,79,0.08)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  analysisEmoji: {
    fontSize: typography.fontSizes.base,
  },
  mealName: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  calories: {
    color: colors.accent,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.bold,
  },
  macro: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    lineHeight: 18,
  },
  toggleRow: {
    alignItems: 'flex-start',
  },
  toggleText: {
    color: colors.accentSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
});
