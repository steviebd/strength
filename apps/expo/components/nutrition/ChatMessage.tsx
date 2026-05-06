import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type TextLayoutEventData } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { CoachTypingIndicator } from './CoachTypingIndicator';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/theme';
import {
  resolveMealTypeForAnalysis,
  stripMachineJsonFromAssistantText,
  type MealAnalysis,
} from '@/lib/nutritionChat';

interface ChatEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;
  analysis?: MealAnalysis;
  savedEntryId?: string | null;
  isPlaceholder?: boolean;
  queueId?: string;
  status?: 'pending' | 'failed';
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
  onRetry?: () => void;
}

const COLLAPSED_USER_LINES = 1;
const COLLAPSED_ASSISTANT_LINES = 2;
const POWERLIFTING_STRATEGY_HEADING_PATTERN =
  /^\*{0,2}Power\s*lifting Fuel Strategy\*{0,2}:?$|^\*{0,2}Powerlifting Fuel Strategy\*{0,2}:?$/i;

function getLineCount(event: NativeSyntheticEvent<TextLayoutEventData>) {
  return event.nativeEvent.lines.length;
}

function cleanInlineFormatting(text: string): string {
  return text.replace(/\*\*/g, '').trim();
}

function isBulletLine(text: string): boolean {
  return /^[-*]\s+/.test(text.trim());
}

function getBulletText(text: string): string {
  return cleanInlineFormatting(text.trim().replace(/^[-*]\s+/, ''));
}

function hasStructuredAssistantContent(content: string): boolean {
  return content
    .split('\n')
    .some((line) => POWERLIFTING_STRATEGY_HEADING_PATTERN.test(line.trim()) || isBulletLine(line));
}

function renderStructuredAssistantContent(content: string) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      if (POWERLIFTING_STRATEGY_HEADING_PATTERN.test(line)) {
        return (
          <Text key={`assistant-heading:${index}`} style={styles.assistantHeading}>
            Powerlifting Fuel Strategy
          </Text>
        );
      }

      if (isBulletLine(line)) {
        return (
          <View key={`assistant-bullet:${index}`} style={styles.bulletRow}>
            <Text style={styles.bulletMarker}>•</Text>
            <Text style={styles.bulletText}>{getBulletText(line)}</Text>
          </View>
        );
      }

      return (
        <Text key={`assistant-line:${index}`} style={styles.assistantText}>
          {cleanInlineFormatting(line)}
        </Text>
      );
    });
}

export function ChatMessage({
  exchange,
  expanded,
  onToggleExpanded,
  onSaveAnalysis,
  isSavingAnalysis = false,
  onRetry,
}: ChatMessageProps) {
  const [userNeedsToggle, setUserNeedsToggle] = useState(false);
  const [assistantNeedsToggle, setAssistantNeedsToggle] = useState(false);
  const userMessage = exchange.userMessage;
  const assistantMessage = exchange.assistantMessage;
  const analysis = assistantMessage?.analysis;
  const resolvedMealType = analysis ? resolveMealTypeForAnalysis(analysis) : null;
  const assistantDisplayContent = assistantMessage
    ? stripMachineJsonFromAssistantText(assistantMessage.content)
    : '';
  const shouldRenderStructuredAssistantContent =
    assistantDisplayContent.trim().length > 0 &&
    hasStructuredAssistantContent(assistantDisplayContent);
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
              {analysis ? (
                <View style={styles.analysisCard}>
                  <View style={styles.mealTitleRow}>
                    <Text style={styles.analysisEmoji}>🍽️</Text>
                    <Text style={styles.mealName}>{analysis.name}</Text>
                  </View>
                  <View style={styles.analysisActionsRow}>
                    {resolvedMealType ? (
                      <View style={styles.mealTypeBadge}>
                        <Text style={styles.mealTypeBadgeText}>{resolvedMealType}</Text>
                      </View>
                    ) : null}
                    {expanded ? (
                      <Button
                        testID={isSaved ? 'nutrition-analysis-unsave' : 'nutrition-analysis-save'}
                        size="sm"
                        variant={isSaved ? 'default' : 'ghost'}
                        style={{ backgroundColor: isSaved ? undefined : '#1c1c1f' }}
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
                        attention={!isSaved && !isSavingAnalysis}
                      >
                        {isSavingAnalysis ? 'Saving...' : isSaved ? 'Saved' : 'Save'}
                      </Button>
                    ) : null}
                  </View>
                  <View style={styles.macroGrid}>
                    <View style={styles.macroPair}>
                      <View style={styles.macroMetric}>
                        <Text style={styles.metricValue}>{analysis.calories}</Text>
                        <Text style={styles.metricLabel}>kcal</Text>
                      </View>
                      <View style={styles.macroMetric}>
                        <Text style={styles.metricValue}>{analysis.proteinG}g</Text>
                        <Text style={styles.metricLabel}>Protein</Text>
                      </View>
                    </View>
                    <View style={styles.macroPair}>
                      <View style={styles.macroMetric}>
                        <Text style={styles.metricValue}>{analysis.carbsG}g</Text>
                        <Text style={styles.metricLabel}>Carbs</Text>
                      </View>
                      <View style={styles.macroMetric}>
                        <Text style={styles.metricValue}>{analysis.fatG}g</Text>
                        <Text style={styles.metricLabel}>Fat</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : null}
              {assistantDisplayContent ? (
                shouldRenderStructuredAssistantContent ? (
                  <View style={styles.structuredContent}>
                    {renderStructuredAssistantContent(assistantDisplayContent)}
                  </View>
                ) : (
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
                    {cleanInlineFormatting(assistantDisplayContent)}
                  </Text>
                )
              ) : assistantMessage?.status === 'failed' ? (
                <View style={styles.failedContainer}>
                  <Text style={styles.failedText}>Failed to send</Text>
                  <Button size="sm" variant="secondary" onPress={onRetry}>
                    Retry
                  </Button>
                </View>
              ) : assistantMessage?.status === 'pending' ? (
                <View style={styles.pendingContainer}>
                  <Text style={styles.pendingText}>Pending...</Text>
                </View>
              ) : (
                <CoachTypingIndicator />
              )}
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
  structuredContent: {
    gap: spacing.sm,
  },
  assistantHeading: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bulletMarker: {
    color: colors.accent,
    fontSize: typography.fontSizes.base,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    minWidth: 0,
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
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  analysisActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  mealTypeBadge: {
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  mealTypeBadgeText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
  },
  macroGrid: {
    gap: spacing.sm,
  },
  macroPair: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  macroMetric: {
    flex: 1,
    minWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  metricValue: {
    color: colors.accent,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
    lineHeight: 20,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.medium,
    lineHeight: 16,
    marginTop: 2,
  },
  toggleRow: {
    alignItems: 'flex-start',
  },
  toggleText: {
    color: colors.accentSecondary,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
  },
  pendingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  pendingText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    fontStyle: 'italic',
  },
  failedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  failedText: {
    color: colors.error,
    fontSize: typography.fontSizes.sm,
  },
});
