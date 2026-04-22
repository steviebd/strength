import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { PageLayout } from '@/components/ui/PageLayout';
import { ActionButton, PageHeader, SectionTitle, Surface } from '@/components/ui/app-primitives';
import { colors, radius, spacing, typography } from '@/theme';
import { apiFetch } from '@/lib/api';
import {
  getNutritionChatDraft,
  getNutritionChatMessages,
  setNutritionChatDraft,
  setNutritionChatMessages,
} from '@/lib/storage';
import { ChatInput } from '@/components/nutrition/ChatInput';
import { ChatMessage } from '@/components/nutrition/ChatMessage';
import { NutritionDashboard } from '@/components/nutrition/NutritionDashboard';
import { SaveMealDialog } from '@/components/nutrition/SaveMealDialog';
import { useWhoopData } from '@/hooks/useWhoopData';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { getTodayLocalDate } from '@/lib/timezone';

type TrainingType = 'rest_day' | 'cardio' | 'powerlifting';

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
  savedEntryId?: string | null;
  createdAt?: string | null;
}

interface ChatExchangeData {
  id: string;
  userMessage?: ChatMessageData;
  assistantMessage?: ChatMessageData;
  createdAt?: string | null;
}

interface ChatHistoryResponse {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    hasImage?: boolean;
    createdAt?: string | null;
  }>;
  nextCursor: number | null;
  hasMore: boolean;
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
  targetMeta: {
    strategy: 'manual' | 'bodyweight' | 'default';
    explanation: string;
    calorieMultiplier: number;
  };
  bodyweightKg: number | null;
  trainingContext: { type: TrainingType; customLabel?: string } | null;
  whoopRecovery: {
    score: number | null;
    status: 'green' | 'yellow' | 'red' | null;
    hrv: number | null;
  } | null;
  whoopCycle: { caloriesBurned: number | null; totalStrain: number | null } | null;
}

function getDefaultMealTypeForNow(): 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' {
  const hour = new Date().getHours();

  if (hour >= 6 && hour < 10) return 'Breakfast';
  if (hour >= 11 && hour < 14) return 'Lunch';
  if (hour >= 17 && hour < 20) return 'Dinner';
  return 'Snack';
}

function formatTodayEyebrow(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getSuggestedPrompts(trainingType: TrainingType) {
  if (trainingType === 'powerlifting') {
    return [
      'Give me a pre-lift meal idea',
      'How should I split carbs around training?',
      'Estimate this meal from a photo',
    ];
  }

  if (trainingType === 'cardio') {
    return [
      'Give me a cardio day meal idea',
      'What should I eat after conditioning?',
      'Estimate this meal from a photo',
    ];
  }

  return [
    'Give me a rest day meal idea',
    'How should I keep protein high today?',
    'Estimate this meal from a photo',
  ];
}

const CHAT_HISTORY_PAGE_SIZE = 5;

function normalizeMessage(message: ChatMessageData): ChatMessageData {
  const analysis =
    message.analysis ??
    (() => {
      const jsonMatch = message.content.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch?.[1]) return undefined;
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
      return undefined;
    })();

  return {
    ...message,
    analysis,
  };
}

function dedupeMessages(messages: ChatMessageData[]): ChatMessageData[] {
  const seen = new Set<string>();

  return messages.filter((message) => {
    const fingerprint = message.createdAt
      ? `${message.role}:${message.content}:${message.createdAt}`
      : message.id;

    if (seen.has(fingerprint)) {
      return false;
    }

    seen.add(fingerprint);
    return true;
  });
}

function buildChatExchanges(messages: ChatMessageData[]): ChatExchangeData[] {
  const exchanges: ChatExchangeData[] = [];
  let pendingUser: ChatMessageData | undefined;

  for (const message of messages) {
    if (message.role === 'user') {
      if (pendingUser) {
        exchanges.push({
          id: pendingUser.id,
          userMessage: pendingUser,
          createdAt: pendingUser.createdAt ?? null,
        });
      }

      pendingUser = message;
      continue;
    }

    if (pendingUser) {
      exchanges.push({
        id: `${pendingUser.id}:${message.id}`,
        userMessage: pendingUser,
        assistantMessage: message,
        createdAt: message.createdAt ?? pendingUser.createdAt ?? null,
      });
      pendingUser = undefined;
      continue;
    }

    exchanges.push({
      id: message.id,
      assistantMessage: message,
      createdAt: message.createdAt ?? null,
    });
  }

  if (pendingUser) {
    exchanges.push({
      id: pendingUser.id,
      userMessage: pendingUser,
      createdAt: pendingUser.createdAt ?? null,
    });
  }

  return exchanges;
}

export default function NutritionScreen() {
  const { activeTimezone } = useUserPreferences();
  const timezone = activeTimezone ?? 'UTC';
  const date = getTodayLocalDate(timezone);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [trainingType, setTrainingType] = useState<TrainingType>('rest_day');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<MealAnalysis | null>(null);
  const [editingEntry, setEditingEntry] = useState<MealEntry | null>(null);
  const [pendingImage, setPendingImage] = useState<{ base64: string; uri: string } | null>(null);
  const [captureRequestKey, setCaptureRequestKey] = useState(0);
  const [queuedPromptAfterCapture, setQueuedPromptAfterCapture] = useState<string | null>(null);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [hasRestoredLocalState, setHasRestoredLocalState] = useState(false);
  const [exchangeExpansion, setExchangeExpansion] = useState<Record<string, boolean>>({});
  const [savingAnalysisMessageId, setSavingAnalysisMessageId] = useState<string | null>(null);
  const hasAppliedServerHistory = useRef(false);

  const { data: whoopData } = useWhoopData(date, timezone);

  const { data: summary, refetch: refetchSummary } = useQuery<DailySummary>({
    queryKey: ['nutrition-daily-summary', date, timezone],
    queryFn: () =>
      apiFetch(
        `/api/nutrition/daily-summary?date=${date}&timezone=${encodeURIComponent(timezone)}`,
      ),
  });

  useEffect(() => {
    if (summary?.trainingContext?.type) {
      setTrainingType(summary.trainingContext.type);
    }
  }, [summary?.trainingContext?.type]);

  useEffect(() => {
    let isCancelled = false;

    async function restoreLocalState() {
      const [cachedMessages, cachedDraft] = await Promise.all([
        getNutritionChatMessages<ChatMessageData>(date, timezone),
        getNutritionChatDraft(date, timezone),
      ]);

      if (isCancelled) return;

      setMessages(cachedMessages.map(normalizeMessage));
      setDraftText(cachedDraft);
      setPendingImage(null);
      setHistoryCursor(null);
      setHasMoreHistory(false);
      setExchangeExpansion({});
      hasAppliedServerHistory.current = false;
      setHasRestoredLocalState(true);
    }

    setHasRestoredLocalState(false);
    void restoreLocalState();

    return () => {
      isCancelled = true;
    };
  }, [date, timezone]);

  useEffect(() => {
    if (!hasRestoredLocalState) return;
    void setNutritionChatMessages(date, timezone, messages.slice(-CHAT_HISTORY_PAGE_SIZE));
  }, [date, hasRestoredLocalState, messages, timezone]);

  useEffect(() => {
    if (!hasRestoredLocalState) return;
    void setNutritionChatDraft(date, timezone, draftText);
  }, [date, draftText, hasRestoredLocalState, timezone]);

  useEffect(() => {
    if (!summary) return;

    const activeEntryIds = new Set(summary.entries.map((entry) => entry.id));

    setMessages((current) => {
      let hasChanges = false;

      const next = current.map((message) => {
        if (!message.savedEntryId || activeEntryIds.has(message.savedEntryId)) {
          return message;
        }

        hasChanges = true;
        return {
          ...message,
          savedEntryId: null,
        };
      });

      return hasChanges ? next : current;
    });
  }, [summary]);

  const exchanges = useMemo(() => buildChatExchanges(messages), [messages]);

  const historyQuery = useQuery<ChatHistoryResponse>({
    queryKey: ['nutrition-chat-history-initial', date, timezone],
    enabled: hasRestoredLocalState,
    queryFn: () =>
      apiFetch(
        `/api/nutrition/chat/history?date=${date}&timezone=${encodeURIComponent(timezone)}&limit=${CHAT_HISTORY_PAGE_SIZE}`,
      ),
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!historyQuery.data || hasAppliedServerHistory.current === true) {
      return;
    }

    const serverMessages = historyQuery.data.messages.map((message) =>
      normalizeMessage({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt ?? null,
      }),
    );

    setMessages(serverMessages);
    setHistoryCursor(historyQuery.data.nextCursor);
    setHasMoreHistory(historyQuery.data.hasMore);
    setExchangeExpansion({});
    hasAppliedServerHistory.current = true;
  }, [historyQuery.data]);

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
      const payload = {
        name: data.name,
        mealType: data.mealType,
        calories: data.calories,
        proteinG: data.protein,
        carbsG: data.carbs,
        fatG: data.fat,
        timezone,
      };

      if (data.id) {
        return apiFetch(`/api/nutrition/entries/${data.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }

      return apiFetch('/api/nutrition/entries', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
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
    mutationFn: (type: TrainingType) =>
      apiFetch('/api/nutrition/training-context', {
        method: 'POST',
        body: JSON.stringify({ trainingType: type, date, timezone }),
      }),
    onSuccess: () => {
      refetchSummary();
    },
  });

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

  const handleTrainingTypeChange = useCallback(
    (type: TrainingType) => {
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

  const sendMessage = useCallback(
    async (text: string, imageOverride?: { base64: string; uri: string } | null) => {
      const attachedImage = imageOverride ?? pendingImage;
      const userMsg: ChatMessageData = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        imageUri: attachedImage?.uri,
      };

      setMessages((prev) => [...prev, userMsg]);
      setPendingImage(null);
      setIsLoading(true);

      const assistantMsgId = (Date.now() + 1).toString();
      let assistantContent = '';

      setMessages((prev) => [...prev, { id: assistantMsgId, role: 'assistant', content: '' }]);

      try {
        const requestBody: Record<string, unknown> = {
          messages: [...messages, userMsg].map((message) => ({
            role: message.role,
            content: message.content,
          })),
          date,
          timezone,
        };

        if (attachedImage) {
          requestBody.hasImage = true;
          requestBody.imageBase64 = attachedImage.base64;
        }

        const response = await apiFetch<globalThis.Response>('/api/nutrition/chat', {
          method: 'POST',
          body: JSON.stringify(requestBody),
          __stream: true,
        } as never);

        const applySseChunk = (chunk: string) => {
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const delta = JSON.parse(data);
              if (delta.type === 'text-delta' && delta.text) {
                assistantContent += delta.text;
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === assistantMsgId
                      ? { ...message, content: assistantContent }
                      : message,
                  ),
                );
              }
            } catch {}
          }
        };

        const reader = response.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            applySseChunk(lines.join('\n'));
          }

          if (buffer.trim()) {
            applySseChunk(buffer);
          }
        } else {
          const rawText = await response.text();
          if (!rawText.trim()) {
            throw new Error('No response body');
          }
          applySseChunk(rawText);
        }

        if (!assistantContent.trim()) {
          throw new Error('The assistant returned an empty response.');
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to reach the nutrition assistant.';
        setMessages((prev) =>
          prev.map((entry) =>
            entry.id === assistantMsgId
              ? {
                  ...entry,
                  content: `I couldn't complete that request. ${message}`,
                }
              : entry,
          ),
        );
      } finally {
        setIsLoading(false);

        const analysis = parseAnalysisFromContent(assistantContent);
        if (analysis) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsgId ? { ...message, analysis } : message,
            ),
          );
        }
      }
    },
    [date, messages, pendingImage, timezone],
  );

  const loadOlderHistory = useCallback(async () => {
    if (!historyCursor || isLoadingMoreHistory) {
      return;
    }

    setIsLoadingMoreHistory(true);

    try {
      const response = await apiFetch<ChatHistoryResponse>(
        `/api/nutrition/chat/history?date=${date}&limit=${CHAT_HISTORY_PAGE_SIZE}&before=${historyCursor}`,
      );

      const olderMessages = response.messages.map((message) =>
        normalizeMessage({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt ?? null,
        }),
      );

      setMessages((prev) => dedupeMessages([...olderMessages, ...prev]));
      setHistoryCursor(response.nextCursor);
      setHasMoreHistory(response.hasMore);
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }, [date, historyCursor, isLoadingMoreHistory]);

  const handleImageCapture = useCallback(
    (base64: string, uri: string) => {
      const image = { base64, uri };
      setPendingImage(image);

      if (queuedPromptAfterCapture) {
        const prompt = queuedPromptAfterCapture;
        setQueuedPromptAfterCapture(null);
        void sendMessage(prompt, image);
      }
    },
    [queuedPromptAfterCapture, sendMessage],
  );

  const handleSaveFromAnalysis = useCallback(
    async (messageId: string, analysis: MealAnalysis, savedEntryId?: string | null) => {
      setSavingAnalysisMessageId(messageId);

      try {
        if (savedEntryId) {
          await deleteMealMutation.mutateAsync(savedEntryId);

          setMessages((current) =>
            current.map((message) =>
              message.id === messageId ? { ...message, savedEntryId: null } : message,
            ),
          );
          return;
        }

        const entry = await saveMealMutation.mutateAsync({
          name: analysis.name,
          mealType: getDefaultMealTypeForNow(),
          calories: analysis.calories,
          protein: analysis.proteinG,
          carbs: analysis.carbsG,
          fat: analysis.fatG,
        });

        const entryId =
          entry && typeof entry === 'object' && 'id' in entry && typeof entry.id === 'string'
            ? entry.id
            : null;

        if (!entryId) {
          throw new Error('Meal was created without an entry id.');
        }

        setMessages((current) =>
          current.map((message) =>
            message.id === messageId ? { ...message, savedEntryId: entryId } : message,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to save meal.';
        Alert.alert('Save failed', message);
      } finally {
        setSavingAnalysisMessageId((current) => (current === messageId ? null : current));
      }
    },
    [deleteMealMutation, saveMealMutation],
  );

  const handleSaveMeal = useCallback(
    async (data: {
      name: string;
      mealType: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    }) => {
      await saveMealMutation.mutateAsync({
        ...data,
        id: editingEntry?.id,
      });
      setShowSaveDialog(false);
      setPendingAnalysis(null);
      setEditingEntry(null);
    },
    [editingEntry?.id, saveMealMutation],
  );

  const handleDeleteMeal = useCallback(() => {
    if (editingEntry?.id) {
      deleteMealMutation.mutate(editingEntry.id);
    }
    setShowSaveDialog(false);
    setPendingAnalysis(null);
    setEditingEntry(null);
  }, [deleteMealMutation, editingEntry?.id]);

  const handleSend = useCallback(
    async (text: string) => {
      await sendMessage(text);
    },
    [sendMessage],
  );

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      if (prompt === 'Estimate this meal from a photo' && !pendingImage) {
        setQueuedPromptAfterCapture(prompt);
        setCaptureRequestKey((current) => current + 1);
        return;
      }

      void sendMessage(prompt);
    },
    [pendingImage, sendMessage],
  );

  const quickPrompts = getSuggestedPrompts(trainingType);

  return (
    <>
      <PageLayout
        header={
          <PageHeader
            eyebrow={formatTodayEyebrow(date)}
            title="Nutrition"
            description="Log meals, track macros, and adjust intake around training and recovery."
          />
        }
        screenScrollViewProps={{ keyboardShouldPersistTaps: 'handled' }}
      >
        {summary ? (
          <NutritionDashboard
            entries={summary.entries}
            totals={summary.totals}
            targets={summary.targets}
            targetMeta={summary.targetMeta}
            bodyweightKg={summary.bodyweightKg}
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
                : summary.whoopRecovery
                  ? {
                      recoveryScore: summary.whoopRecovery.score,
                      recoveryStatus: summary.whoopRecovery.status,
                      hrv: summary.whoopRecovery.hrv,
                      caloriesBurned: summary.whoopCycle?.caloriesBurned ?? null,
                      totalStrain: summary.whoopCycle?.totalStrain ?? null,
                    }
                  : null
            }
            onMealEdit={handleMealEdit}
            onMealDelete={handleMealDelete}
          />
        ) : null}

        <Surface style={styles.assistantSection}>
          <SectionTitle title="Nutrition Assistant" />
          <Text style={styles.assistantDescription}>
            Use a photo or a quick prompt to estimate meals, ask for meal ideas, or get macro
            guidance.
          </Text>

          <View style={styles.quickActions}>
            {quickPrompts.map((prompt) => (
              <View key={prompt} style={styles.quickActionSlot}>
                <ActionButton
                  label={prompt}
                  icon="sparkles-outline"
                  variant="secondary"
                  onPress={() => handleQuickPrompt(prompt)}
                  disabled={isLoading}
                />
              </View>
            ))}
          </View>

          {pendingImage ? (
            <View style={styles.pendingImageCard}>
              <Image source={{ uri: pendingImage.uri }} style={styles.pendingImage} />
              <View style={styles.pendingImageCopy}>
                <Text style={styles.pendingImageTitle}>Photo ready</Text>
                <Text style={styles.pendingImageText}>
                  Add a short message to estimate this meal and log it.
                </Text>
              </View>
              <Pressable onPress={() => setPendingImage(null)} style={styles.pendingImageClear}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.messageList}>
            {messages.length === 0 ? (
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubbles-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyChatTitle}>No assistant messages yet</Text>
                <Text style={styles.emptyChatText}>
                  Try a quick prompt, describe what you ate, or attach a meal photo.
                </Text>
              </View>
            ) : (
              <>
                {hasMoreHistory ? (
                  <ActionButton
                    label={
                      isLoadingMoreHistory ? 'Loading older messages...' : 'Load older messages'
                    }
                    icon="time-outline"
                    variant="ghost"
                    onPress={() => void loadOlderHistory()}
                    disabled={isLoadingMoreHistory}
                  />
                ) : null}
                {exchanges.map((exchange, index) => {
                  const isLatestExchange = index === exchanges.length - 1;
                  const isExpanded = exchangeExpansion[exchange.id] ?? isLatestExchange;

                  return (
                    <ChatMessage
                      key={exchange.id}
                      exchange={exchange}
                      expanded={isExpanded}
                      onToggleExpanded={() =>
                        setExchangeExpansion((current) => ({
                          ...current,
                          [exchange.id]: !isExpanded,
                        }))
                      }
                      onSaveAnalysis={handleSaveFromAnalysis}
                      isSavingAnalysis={
                        savingAnalysisMessageId === exchange.assistantMessage?.id &&
                        (saveMealMutation.isPending || deleteMealMutation.isPending)
                      }
                    />
                  );
                })}
              </>
            )}
          </View>

          <ChatInput
            onSend={handleSend}
            onImageCapture={handleImageCapture}
            isLoading={isLoading}
            value={draftText}
            onChangeText={setDraftText}
            variant="embedded"
            captureRequestKey={captureRequestKey}
          />
        </Surface>
      </PageLayout>

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
        isSaving={saveMealMutation.isPending}
      />
    </>
  );
}

const styles = StyleSheet.create({
  assistantSection: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  assistantDescription: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    lineHeight: 22,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickActionSlot: {
    minWidth: '48%',
    flex: 1,
  },
  pendingImageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: spacing.md,
  },
  pendingImage: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
  },
  pendingImageCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  pendingImageTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  pendingImageText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 18,
  },
  pendingImageClear: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  messageList: {
    gap: spacing.sm,
  },
  emptyChat: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: spacing.xl,
    gap: spacing.xs,
  },
  emptyChatTitle: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  emptyChatText: {
    maxWidth: 280,
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    lineHeight: 22,
    textAlign: 'center',
  },
});
