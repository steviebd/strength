import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '@/theme';
import { Button } from '@/components/ui/Button';

interface MealAnalysis {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface ChatMessageProps {
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    imageUri?: string;
    analysis?: MealAnalysis;
  };
  onSaveAnalysis?: (analysis: MealAnalysis) => void;
}

export function ChatMessage({ message, onSaveAnalysis }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <Animated.View
      style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}
    >
      {isUser ? (
        <View style={styles.userBubble}>
          {message.imageUri && (
            <Image source={{ uri: message.imageUri }} style={styles.thumbnail} />
          )}
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      ) : (
        <View style={styles.assistantBubble}>
          <Text style={styles.assistantText}>{message.content}</Text>
          {message.analysis && (
            <View style={styles.analysisCard}>
              <View style={styles.analysisHeader}>
                <Text style={styles.analysisEmoji}>🍽️</Text>
                <Text style={styles.mealName}>{message.analysis.name}</Text>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => onSaveAnalysis?.(message.analysis!)}
                >
                  Save
                </Button>
              </View>
              <View style={styles.macroRow}>
                <Text style={styles.calories}>{message.analysis.calories}</Text>
                <Text style={styles.macro}>P: {message.analysis.proteinG}g</Text>
                <Text style={styles.macro}>C: {message.analysis.carbsG}g</Text>
                <Text style={styles.macro}>F: {message.analysis.fatG}g</Text>
              </View>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  assistantContainer: {
    justifyContent: 'flex-start',
  },
  userBubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.accent,
  },
  assistantBubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
  },
  assistantText: {
    color: colors.text,
    fontSize: typography.fontSizes.base,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    marginRight: spacing.sm,
  },
  analysisCard: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(239,111,79,0.1)',
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(239,111,79,0.2)',
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  analysisEmoji: {
    fontSize: typography.fontSizes.base,
    marginRight: spacing.xs,
  },
  mealName: {
    flex: 1,
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
  },
  macroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  calories: {
    color: colors.accent,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.bold,
  },
  macro: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
  },
});
