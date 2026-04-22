import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  StyleSheet,
  View,
  Text,
  Pressable,
} from 'react-native';
import { CustomPageHeader } from '@/components/ui/CustomPageHeader';
import { Screen } from '@/components/ui/Screen';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { SaveMealDialog } from '@/components/nutrition/SaveMealDialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  analysis?: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function useChat({ date }: { date: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await apiFetch<globalThis.Response>('/api/nutrition/chat', {
        method: 'POST',
        body: JSON.stringify({
          messages: messages.concat(userMessage).map(({ role, content }) => ({ role, content })),
          date,
        }),
        __stream: true,
      });

      if (!response.ok) throw new Error('Failed to get response');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
      };
      setMessages((prev) => [...prev, assistantMessage]);

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += new TextDecoder().decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const data = line.startsWith('data: ') ? line.slice(6) : line;
          if (data === '[DONE]') break;
          try {
            const delta = JSON.parse(data);
            if (delta.type === 'text-delta' && delta.text) {
              assistantMessage.content += delta.text;
            }
          } catch {
            // Not valid JSON, skip
          }
        }

        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.id === assistantMessage.id) {
            return [...prev.slice(0, -1), { ...assistantMessage }];
          }
          return prev;
        });
      }

      const jsonMatch =
        assistantMessage.content.match(/```json\s*([\s\S]*?)```/) ??
        assistantMessage.content.match(/\{[\s\S]*"name"[\s\S]*"calories"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
          if (parsed.name && parsed.calories !== null) {
            assistantMessage.analysis = {
              name: parsed.name,
              calories: parsed.calories,
              proteinG: parsed.proteinG ?? 0,
              carbsG: parsed.carbsG ?? 0,
              fatG: parsed.fatG ?? 0,
            };
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.id === assistantMessage.id) {
                return [...prev.slice(0, -1), { ...assistantMessage }];
              }
              return prev;
            });
          }
        } catch {
          // No valid meal analysis found
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [input, messages, date, isLoading]);

  return { messages, input, setInput, handleSubmit, isLoading };
}

const quickActions = ['What should I eat?', 'Analyse my meal', 'Show remaining macros'];

export default function NutritionChat() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<{
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  } | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const date = getTodayStr();
  const { messages, input, setInput, handleSubmit, isLoading } = useChat({ date });

  const saveMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    }) => {
      const res = await apiFetch(`/api/nutrition/entries`, {
        method: 'POST',
        body: JSON.stringify({ ...data, date }),
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nutrition-daily-summary', date] });
      setShowSaveDialog(false);
      setPendingAnalysis(null);
    },
  });

  const handleSaveClick = (analysis: {
    name: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }) => {
    setPendingAnalysis(analysis);
    setShowSaveDialog(true);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timeout);
  }, [messages]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowRight : styles.messageRowLeft]}>
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.assistantMessageText,
            ]}
          >
            {item.content}
          </Text>
          {item.analysis && (
            <View style={styles.analysisCard}>
              <View style={styles.analysisHeader}>
                <View style={styles.analysisTitleRow}>
                  <Text style={styles.analysisEmoji}>🍽</Text>
                  <Text style={styles.analysisName} numberOfLines={1}>
                    {item.analysis.name}
                  </Text>
                </View>
                <Button size="sm" onPress={() => handleSaveClick(item.analysis!)}>
                  Save
                </Button>
              </View>
              <View style={styles.analysisMacros}>
                <Text style={styles.analysisMacroText}>{item.analysis.calories} kcal</Text>
                <Text style={styles.analysisMacroMuted}>
                  P: <Text style={styles.analysisMacroValue}>{item.analysis.proteinG}g</Text>
                </Text>
                <Text style={styles.analysisMacroMuted}>
                  C: <Text style={styles.analysisMacroValue}>{item.analysis.carbsG}g</Text>
                </Text>
                <Text style={styles.analysisMacroMuted}>
                  F: <Text style={styles.analysisMacroValue}>{item.analysis.fatG}g</Text>
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <CustomPageHeader title="Log Meal" />
      <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: insets.bottom + 132 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Ask me about your meals or get nutrition advice</Text>
              <View style={styles.quickActions}>
                {quickActions.map((action) => (
                  <Pressable
                    key={action}
                    onPress={() => setInput(action)}
                    style={styles.quickActionChip}
                  >
                    <Text style={styles.quickActionText}>{action}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListFooterComponent={
            isLoading ? (
              <View style={styles.loadingRow}>
                <View style={styles.loadingBubble}>
                  <ActivityIndicator size="small" color="#ef6f4f" />
                </View>
              </View>
            ) : null
          }
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
      >
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about nutrition..."
            placeholderTextColor="#6B7280"
            style={styles.textInput}
          />
          <Button onPress={handleSubmit} disabled={isLoading || !input.trim()}>
            {isLoading ? <ActivityIndicator size="small" color="#fff" /> : '↑'}
          </Button>
        </View>
      </KeyboardAvoidingView>

      <SaveMealDialog
        visible={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        analysis={pendingAnalysis}
        onSave={(data) =>
          saveMutation.mutate({
            name: data.name,
            mealType: data.mealType.toLowerCase() as 'breakfast' | 'lunch' | 'dinner' | 'snack',
            calories: data.calories,
            proteinG: data.protein,
            carbsG: data.carbs,
            fatG: data.fat,
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  userBubble: {
    backgroundColor: colors.accent,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: 15,
  },
  userMessageText: {
    color: '#ffffff',
  },
  assistantMessageText: {
    color: colors.text,
  },
  analysisCard: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239,111,79,0.2)',
    backgroundColor: 'rgba(239,111,79,0.1)',
    padding: spacing.md,
  },
  analysisHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  analysisTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  analysisEmoji: {
    fontSize: 17,
  },
  analysisName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  analysisMacros: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  analysisMacroText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  analysisMacroMuted: {
    fontSize: 14,
    color: colors.textMuted,
  },
  analysisMacroValue: {
    fontWeight: '500',
    color: colors.text,
  },
  emptyState: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  quickActionChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickActionText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  loadingRow: {
    justifyContent: 'flex-start',
    marginBottom: spacing.sm,
  },
  loadingBubble: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  sendButton: {
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  sendIcon: {
    fontSize: 18,
    color: colors.text,
  },
});
