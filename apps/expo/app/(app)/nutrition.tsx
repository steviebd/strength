import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { PageHeader, Surface } from '@/components/ui/app-primitives';
import { Screen, ScreenScrollView } from '@/components/ui/Screen';
import { colors, spacing, radius, typography } from '@/theme';
import { apiFetch } from '@/lib/api';
import { ChatMessage } from '@/components/nutrition/ChatMessage';
import { ChatInput } from '@/components/nutrition/ChatInput';
import { NutritionDashboard } from '@/components/nutrition/NutritionDashboard';
import { SaveMealDialog } from '@/components/nutrition/SaveMealDialog';
import { useWhoopData } from '@/hooks/useWhoopData';
import { Ionicons } from '@expo/vector-icons';

interface MealAnalysis {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;
  analysis?: MealAnalysis;
}

interface MealEntry {
  id: string;
  name: string | null;
  mealType: string | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  loggedAt: string | null;
}

interface DailySummary {
  entries: MealEntry[];
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  whoopRecovery: {
    score: number | null;
    status: 'green' | 'yellow' | 'red' | null;
    hrv: number | null;
  } | null;
  whoopCycle: { caloriesBurned: number | null; totalStrain: number | null } | null;
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export default function NutritionScreen() {
  const date = getTodayDate();
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [trainingType, setTrainingType] = useState<'rest_day' | 'cardio' | 'powerlifting' | null>(
    null,
  );
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<MealAnalysis | null>(null);
  const [editingEntry, setEditingEntry] = useState<MealEntry | null>(null);
  const [pendingImage, setPendingImage] = useState<{ base64: string; uri: string } | null>(null);

  const { data: whoopData } = useWhoopData(date);

  const { data: summary, refetch: refetchSummary } = useQuery<DailySummary>({
    queryKey: ['nutrition-daily-summary', date],
    queryFn: () => apiFetch(`/api/nutrition/daily-summary?date=${date}`),
  });

  const saveMealMutation = useMutation({
    mutationFn: (data: {
      name: string;
      mealType: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      id?: string;
    }) => {
      if (data.id) {
        return apiFetch(`/api/nutrition/entries/${data.id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
      }
      return apiFetch('/api/nutrition/entries', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      refetchSummary();
    },
  });

  const deleteMealMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/nutrition/entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      refetchSummary();
    },
  });

  const trainingContextMutation = useMutation({
    mutationFn: (type: 'rest_day' | 'cardio' | 'powerlifting') =>
      apiFetch('/api/nutrition/training-context', {
        method: 'POST',
        body: JSON.stringify({ type, date }),
      }),
    onSuccess: () => {
      refetchSummary();
    },
  });

  const handleTrainingTypeChange = useCallback(
    (type: 'rest_day' | 'cardio' | 'powerlifting') => {
      setTrainingType(type);
      trainingContextMutation.mutate(type);
    },
    [trainingContextMutation],
  );

  const handleMealEdit = useCallback((entry: MealEntry) => {
    setEditingEntry(entry);
    setPendingAnalysis(null);
    setShowSaveDialog(true);
  }, []);

  const handleMealDelete = useCallback(
    (entryId: string) => {
      deleteMealMutation.mutate(entryId);
    },
    [deleteMealMutation],
  );

  const handleImageCapture = useCallback((base64: string, uri: string) => {
    setPendingImage({ base64, uri });
  }, []);

  const handleQuickAction = useCallback((text: string) => {
    handleSend(text);
  }, []);

  const parseAnalysisFromContent = (content: string): MealAnalysis | null => {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.name && typeof parsed.calories === 'number') {
          return {
            name: parsed.name,
            calories: parsed.calories,
            proteinG: parsed.proteinG ?? 0,
            carbsG: parsed.carbsG ?? 0,
            fatG: parsed.fatG ?? 0,
          };
        }
      } catch {}
    }
    return null;
  };

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: ChatMessageData = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        imageUri: pendingImage?.uri,
      };
      setMessages((prev) => [...prev, userMsg]);
      setPendingImage(null);
      setIsLoading(true);

      const assistantMsgId = (Date.now() + 1).toString();
      let assistantContent = '';

      const assistantMsg: ChatMessageData = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
      };
      setMessages((prev) => [...prev, assistantMsg]);

      try {
        const requestBody: Record<string, unknown> = {
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          date,
        };

        if (pendingImage) {
          requestBody.hasImage = true;
          requestBody.imageBase64 = pendingImage.base64;
        }

        const response = await apiFetch<globalThis.Response>('/api/nutrition/chat', {
          method: 'POST',
          body: JSON.stringify(requestBody),
          __stream: true,
        } as any);

        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const delta = JSON.parse(data);
              if (delta.type === 'text-delta' && delta.text) {
                assistantContent += delta.text;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId ? { ...msg, content: assistantContent } : msg,
                  ),
                );
              }
            } catch {}
          }
        }
      } catch {
      } finally {
        setIsLoading(false);

        const analysis = parseAnalysisFromContent(assistantContent);
        if (analysis) {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, analysis } : msg)),
          );
        }
      }
    },
    [messages, date],
  );

  const handleSaveFromAnalysis = useCallback((analysis: MealAnalysis) => {
    setPendingAnalysis(analysis);
    setEditingEntry(null);
    setShowSaveDialog(true);
  }, []);

  const handleSaveMeal = useCallback(
    (data: {
      name: string;
      mealType: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }) => {
      saveMealMutation.mutate({
        ...data,
        id: editingEntry?.id,
      });
      setShowSaveDialog(false);
      setPendingAnalysis(null);
      setEditingEntry(null);
    },
    [saveMealMutation, editingEntry],
  );

  const handleDeleteMeal = useCallback(() => {
    if (editingEntry?.id) {
      deleteMealMutation.mutate(editingEntry.id);
    }
    setShowSaveDialog(false);
    setPendingAnalysis(null);
    setEditingEntry(null);
  }, [deleteMealMutation, editingEntry]);

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessageData }) => (
      <ChatMessage message={item} onSaveAnalysis={handleSaveFromAnalysis} />
    ),
    [handleSaveFromAnalysis],
  );

  const trainingTypeOptions = [
    { label: 'Rest Day', value: 'rest_day' as const },
    { label: 'Cardio', value: 'cardio' as const },
    { label: 'Powerlifting', value: 'powerlifting' as const },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <Screen>
        <ScreenScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <PageHeader
            title="Nutrition"
            eyebrow="Daily nutrition"
            description="Track calories, monitor macros, and keep recovery-supported fueling on pace."
          />

          <View style={styles.quickActions}>
            <Pressable
              style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
              onPress={() => handleQuickAction('What Should I Eat')}
              disabled={isLoading}
            >
              <Ionicons name="help-circle-outline" size={18} color={colors.text} />
              <Text style={styles.quickActionText}>What Should I Eat</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.quickAction, pressed && styles.quickActionPressed]}
              onPress={() => handleQuickAction('Training Day Nutrition')}
              disabled={isLoading}
            >
              <Ionicons name="fitness-outline" size={18} color={colors.text} />
              <Text style={styles.quickActionText}>Training Day Nutrition</Text>
            </Pressable>
          </View>

          <View style={styles.chatSection}>
            <FlatList
              data={messages}
              renderItem={renderMessage}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              contentContainerStyle={{ paddingBottom: spacing.lg }}
              ListEmptyComponent={
                <View style={styles.emptyChat}>
                  <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.emptyChatText}>
                    Ask about nutrition, meal recommendations, or capture a meal photo
                  </Text>
                </View>
              }
            />
          </View>

          {summary && (
            <View style={styles.dashboardSection}>
              <Surface style={styles.trainingTypeSection}>
                <Text style={styles.sectionTitle}>Training Context</Text>
                <View style={styles.segmentedTabs}>
                  <View style={styles.segmentedTabsInner}>
                    {trainingTypeOptions.map((option) => (
                      <Pressable
                        key={option.value}
                        onPress={() => handleTrainingTypeChange(option.value)}
                        style={[
                          styles.segmentTab,
                          trainingType === option.value && styles.segmentTabActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.segmentTabLabel,
                            trainingType === option.value && styles.segmentTabLabelActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </Surface>

              <NutritionDashboard
                entries={summary.entries}
                totals={summary.totals}
                targets={summary.targets}
                trainingType={trainingType}
                onTrainingTypeChange={handleTrainingTypeChange}
                whoopData={
                  whoopData?.recovery
                    ? {
                        recoveryScore: whoopData.recovery.score,
                        recoveryStatus: whoopData.recovery.status,
                        hrv: whoopData.recovery.hrv,
                        caloriesBurned: whoopData.cycle?.caloriesBurned ?? null,
                        totalStrain: whoopData.cycle?.totalStrain ?? null,
                      }
                    : null
                }
                onMealEdit={handleMealEdit}
                onMealDelete={handleMealDelete}
              />
            </View>
          )}
        </ScreenScrollView>

        <View style={styles.inputContainer}>
          <ChatInput
            onSend={handleSend}
            onImageCapture={handleImageCapture}
            isLoading={isLoading}
          />
        </View>
      </Screen>

      <SaveMealDialog
        visible={showSaveDialog}
        onClose={() => {
          setShowSaveDialog(false);
          setPendingAnalysis(null);
          setEditingEntry(null);
        }}
        analysis={pendingAnalysis}
        onSave={handleSaveMeal}
        onDelete={editingEntry?.id ? handleDeleteMeal : undefined}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: spacing.lg,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionPressed: {
    opacity: 0.7,
  },
  quickActionText: {
    color: colors.text,
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
  },
  chatSection: {
    marginBottom: spacing.lg,
  },
  emptyChat: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  emptyChatText: {
    color: colors.textMuted,
    fontSize: typography.fontSizes.sm,
    textAlign: 'center',
    maxWidth: 280,
  },
  dashboardSection: {
    gap: spacing.lg,
  },
  trainingTypeSection: {
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.md,
  },
  segmentedTabs: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 6,
  },
  segmentedTabsInner: {
    flexDirection: 'row',
    gap: 6,
  },
  segmentTab: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  segmentTabActive: {
    backgroundColor: colors.text,
  },
  segmentTabLabel: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textMuted,
  },
  segmentTabLabelActive: {
    color: colors.background,
  },
  inputContainer: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
