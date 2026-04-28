import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { PageLayout } from '@/components/ui/PageLayout';
import { ActionButton, PageHeader, SectionTitle, Surface } from '@/components/ui/app-primitives';
import { colors, radius, spacing, typography } from '@/theme';
import { apiFetch } from '@/lib/api';
import {
  getNutritionChatDraft,
  getNutritionChatMessages,
  getNutritionPendingImage,
  setNutritionChatDraft,
  setNutritionChatMessages,
  setNutritionPendingImage,
} from '@/lib/storage';
import { ChatInput } from '@/components/nutrition/ChatInput';
import { ChatMessage } from '@/components/nutrition/ChatMessage';
import { NutritionDashboard } from '@/components/nutrition/NutritionDashboard';
import { useWhoopData } from '@/hooks/useWhoopData';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { getTodayLocalDate } from '@/lib/timezone';
import {
  parseMealAnalysisFromContent,
  resolveMealTypeForAnalysis,
  type MealAnalysis,
} from '@/lib/nutritionChat';

type TrainingType = 'rest_day' | 'cardio' | 'powerlifting';

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
const CHAT_FOCUS_HISTORY_OFFSET = 260;
const NUTRITION_BOTTOM_INSET = 420;

function normalizeMessage(message: ChatMessageData): ChatMessageData {
  const analysis = message.analysis ?? parseMealAnalysisFromContent(message.content) ?? undefined;

  return {
    ...message,
    analysis,
  };
}

function getMessageSavedKey(message: ChatMessageData): string {
  return `${message.role}:${message.content}`;
}

function mergeSavedEntryIds(
  serverMessages: ChatMessageData[],
  localMessages: ChatMessageData[],
): ChatMessageData[] {
  const savedById = new Map<string, string>();
  const savedByContent = new Map<string, string[]>();

  for (const message of localMessages) {
    if (!message.savedEntryId) continue;

    savedById.set(message.id, message.savedEntryId);

    const contentKey = getMessageSavedKey(message);
    const existing = savedByContent.get(contentKey) ?? [];
    existing.push(message.savedEntryId);
    savedByContent.set(contentKey, existing);
  }

  return serverMessages.map((message) => {
    const savedByExactId = savedById.get(message.id);
    if (savedByExactId) {
      return { ...message, savedEntryId: savedByExactId };
    }

    const contentMatches = savedByContent.get(getMessageSavedKey(message));
    const savedByMatchingContent = contentMatches?.shift();
    if (savedByMatchingContent) {
      return { ...message, savedEntryId: savedByMatchingContent };
    }

    return message;
  });
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

function removeEntryFromSummary(summary: DailySummary | undefined, entryId: string) {
  if (!summary) return summary;

  const removedEntry = summary.entries.find((entry) => entry.id === entryId);
  if (!removedEntry) return summary;

  return {
    ...summary,
    entries: summary.entries.filter((entry) => entry.id !== entryId),
    totals: {
      calories: summary.totals.calories - (removedEntry.calories ?? 0),
      proteinG: summary.totals.proteinG - (removedEntry.proteinG ?? 0),
      carbsG: summary.totals.carbsG - (removedEntry.carbsG ?? 0),
      fatG: summary.totals.fatG - (removedEntry.fatG ?? 0),
    },
  };
}

export default function NutritionScreen() {
  const params = useLocalSearchParams<{ focusChat?: string }>();
  const queryClient = useQueryClient();
  const { activeTimezone } = useUserPreferences();
  const date = getTodayLocalDate(activeTimezone);
  const dailySummaryQueryKey = useMemo(() => ['nutrition-daily-summary', date], [date]);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [trainingType, setTrainingType] = useState<TrainingType>('rest_day');
  const [pendingImage, setPendingImage] = useState<{ base64: string; uri: string } | null>(null);
  const [captureRequestKey, setCaptureRequestKey] = useState(0);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [hasRestoredLocalState, setHasRestoredLocalState] = useState(false);
  const [exchangeExpansion, setExchangeExpansion] = useState<Record<string, boolean>>({});
  const [savingAnalysisMessageId, setSavingAnalysisMessageId] = useState<string | null>(null);
  const hasAppliedServerHistory = useRef(false);
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const chatInputRef = useRef<TextInput | null>(null);
  const hasFocusedChatRoute = useRef(false);
  const [assistantSectionY, setAssistantSectionY] = useState<number | null>(null);
  const [chatInputY, setChatInputY] = useState<number | null>(null);
  const savingAnalysisMessageIds = useRef(new Set<string>());

  const { data: whoopData } = useWhoopData(date);

  const { data: summary, refetch: refetchSummary } = useQuery<DailySummary>({
    queryKey: dailySummaryQueryKey,
    queryFn: () => apiFetch(`/api/nutrition/daily-summary?date=${date}`),
  });

  useEffect(() => {
    if (summary?.trainingContext?.type) {
      setTrainingType(summary.trainingContext.type);
    }
  }, [summary?.trainingContext?.type]);

  useEffect(() => {
    let isCancelled = false;

    async function restoreLocalState() {
      const [cachedMessages, cachedDraft, cachedPendingImage] = await Promise.all([
        getNutritionChatMessages<ChatMessageData>(date),
        getNutritionChatDraft(date),
        getNutritionPendingImage(date),
      ]);

      if (isCancelled) return;

      setMessages(cachedMessages.map(normalizeMessage));
      setDraftText(cachedDraft);
      setPendingImage(cachedPendingImage);
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
  }, [date]);

  useEffect(() => {
    if (!hasRestoredLocalState) return;
    void setNutritionChatMessages(date, messages.slice(-CHAT_HISTORY_PAGE_SIZE));
  }, [date, hasRestoredLocalState, messages]);

  useEffect(() => {
    if (!hasRestoredLocalState) return;
    void setNutritionChatDraft(date, draftText);
  }, [date, draftText, hasRestoredLocalState]);

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

  const clearSavedEntryFromMessages = useCallback((entryId: string) => {
    setMessages((current) => {
      let hasChanges = false;

      const next = current.map((message) => {
        if (message.savedEntryId !== entryId) {
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
  }, []);

  const exchanges = useMemo(() => buildChatExchanges(messages), [messages]);

  const historyQuery = useQuery<ChatHistoryResponse>({
    queryKey: ['nutrition-chat-history-initial', date],
    enabled: hasRestoredLocalState,
    queryFn: () =>
      apiFetch(`/api/nutrition/chat/history?date=${date}&limit=${CHAT_HISTORY_PAGE_SIZE}`),
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

    setMessages((current) => mergeSavedEntryIds(serverMessages, current));
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
    }) => {
      const payload = {
        name: data.name,
        mealType: data.mealType,
        calories: data.calories,
        proteinG: data.protein,
        carbsG: data.carbs,
        fatG: data.fat,
      };

      return apiFetch('/api/nutrition/entries', {
        method: 'POST',
        body: payload,
      });
    },
    onSuccess: () => {
      refetchSummary();
    },
  });

  const deleteMealMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/nutrition/entries/${id}`, { method: 'DELETE' }),
    onMutate: async (entryId) => {
      await queryClient.cancelQueries({ queryKey: dailySummaryQueryKey });
      const previousSummary = queryClient.getQueryData<DailySummary>(dailySummaryQueryKey);

      queryClient.setQueryData<DailySummary | undefined>(dailySummaryQueryKey, (current) =>
        removeEntryFromSummary(current, entryId),
      );

      return { previousSummary };
    },
    onError: (_error, _entryId, context) => {
      if (context?.previousSummary) {
        queryClient.setQueryData(dailySummaryQueryKey, context.previousSummary);
      }
    },
    onSuccess: (_data, entryId) => {
      clearSavedEntryFromMessages(entryId);
      void queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey });
    },
  });

  const trainingContextMutation = useMutation({
    mutationFn: (type: TrainingType) =>
      apiFetch('/api/nutrition/training-context', {
        method: 'POST',
        body: { trainingType: type, date },
      }),
    onSuccess: () => {
      refetchSummary();
    },
  });

  const handleTrainingTypeChange = useCallback(
    (type: TrainingType) => {
      setTrainingType(type);
      trainingContextMutation.mutate(type);
    },
    [trainingContextMutation],
  );

  const handleMealDelete = useCallback(
    (entryId: string) => {
      deleteMealMutation.mutate(entryId, {
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Unable to delete meal.';
          Alert.alert('Delete failed', message);
        },
      });
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
      void setNutritionPendingImage(date, null);
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
        };

        if (attachedImage) {
          requestBody.hasImage = true;
          requestBody.imageBase64 = attachedImage.base64;
        }

        const response = await apiFetch<globalThis.Response>('/api/nutrition/chat', {
          method: 'POST',
          body: requestBody,
          __stream: true,
        } as never);

        const applySseChunk = (chunk: string) => {
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            let delta: unknown;
            try {
              delta = JSON.parse(data);
            } catch {
              continue;
            }

            if (!delta || typeof delta !== 'object') {
              continue;
            }

            if ('type' in delta && delta.type === 'error') {
              const error = 'error' in delta ? delta.error : null;
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : typeof error === 'string'
                    ? error
                    : 'The assistant stream returned an error.';
              throw new Error(errorMessage);
            }

            const textDelta =
              'type' in delta && delta.type === 'text-delta' && 'text' in delta
                ? typeof delta.text === 'string'
                  ? delta.text
                  : ''
                : 'textDelta' in delta && typeof delta.textDelta === 'string'
                  ? delta.textDelta
                  : 'delta' in delta && typeof delta.delta === 'string'
                    ? delta.delta
                    : '';

            if (textDelta) {
              assistantContent += textDelta;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantMsgId
                    ? { ...message, content: assistantContent }
                    : message,
                ),
              );
            }
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

        const analysis = parseMealAnalysisFromContent(assistantContent);
        if (analysis) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsgId ? { ...message, analysis } : message,
            ),
          );
        }
      }
    },
    [date, messages, pendingImage],
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

      setMessages((prev) => dedupeMessages([...mergeSavedEntryIds(olderMessages, prev), ...prev]));
      setHistoryCursor(response.nextCursor);
      setHasMoreHistory(response.hasMore);
    } catch {
      // silently ignore — chat history load failure is non-critical
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }, [date, historyCursor, isLoadingMoreHistory]);

  const handleSaveFromAnalysis = useCallback(
    async (messageId: string, analysis: MealAnalysis, savedEntryId?: string | null) => {
      if (savingAnalysisMessageIds.current.has(messageId)) {
        return;
      }

      savingAnalysisMessageIds.current.add(messageId);
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
          mealType: resolveMealTypeForAnalysis(analysis),
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
        savingAnalysisMessageIds.current.delete(messageId);
        setSavingAnalysisMessageId((current) => (current === messageId ? null : current));
      }
    },
    [deleteMealMutation, saveMealMutation],
  );

  const handleSend = useCallback(
    async (text: string) => {
      await sendMessage(text);
    },
    [sendMessage],
  );

  const handleQuickPrompt = useCallback(
    (prompt: string) => {
      if (prompt === 'Estimate this meal from a photo' && !pendingImage) {
        setCaptureRequestKey((current) => current + 1);
        return;
      }

      void sendMessage(prompt);
    },
    [pendingImage, sendMessage],
  );

  const quickPrompts = getSuggestedPrompts(trainingType);

  const scrollToChatInput = useCallback(
    (focusInput = false, delayMs = 80) => {
      if (assistantSectionY === null || chatInputY === null) {
        return;
      }

      const targetY = Math.max(assistantSectionY + chatInputY - CHAT_FOCUS_HISTORY_OFFSET, 0);

      setTimeout(() => {
        messagesScrollRef.current?.scrollTo({ y: targetY, animated: true });

        if (focusInput) {
          setTimeout(() => {
            chatInputRef.current?.focus();
          }, 250);
        }
      }, delayMs);
    },
    [assistantSectionY, chatInputY],
  );

  const handleInputFocus = useCallback(() => {
    scrollToChatInput(false);
  }, [scrollToChatInput]);

  const handleImageCapture = useCallback(
    (base64: string, uri: string) => {
      const image = { base64, uri };
      setPendingImage(image);
      void setNutritionPendingImage(date, image);
      scrollToChatInput(true, 0);
    },
    [date, scrollToChatInput],
  );

  useEffect(() => {
    if (
      params.focusChat !== '1' ||
      hasFocusedChatRoute.current ||
      assistantSectionY === null ||
      chatInputY === null
    ) {
      return;
    }

    hasFocusedChatRoute.current = true;
    scrollToChatInput(true);
  }, [assistantSectionY, chatInputY, params.focusChat, scrollToChatInput]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      scrollToChatInput(false, 0);
    });

    return () => {
      showSubscription.remove();
    };
  }, [scrollToChatInput]);

  return (
    <>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <PageLayout
          header={
            <PageHeader
              eyebrow={formatTodayEyebrow(date)}
              title="Nutrition"
              description="Log meals, track macros, and adjust intake around training and recovery."
            />
          }
          screenScrollViewProps={{
            bottomInset: NUTRITION_BOTTOM_INSET,
            keyboardDismissMode: 'interactive',
            keyboardShouldPersistTaps: 'handled',
          }}
          scrollViewRef={messagesScrollRef}
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
              onMealDelete={handleMealDelete}
            />
          ) : null}

          <View
            onLayout={(event) => {
              setAssistantSectionY(event.nativeEvent.layout.y);
            }}
          >
            <Surface style={styles.assistantSection}>
              <SectionTitle title="Nutrition Assistant" />
              <Text style={styles.assistantDescription}>
                Use a photo or a quick prompt to estimate meals, ask for meal ideas, or get macro
                guidance.
              </Text>

              <View style={styles.quickActions}>
                {quickPrompts.map((prompt) => (
                  <View key={`quick-prompt:${prompt}`} style={styles.quickActionSlot}>
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
                          key={`chat-exchange:${exchange.id}`}
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

              <View
                onLayout={(event) => {
                  setChatInputY(event.nativeEvent.layout.y);
                }}
              >
                <ChatInput
                  onSend={handleSend}
                  onImageCapture={handleImageCapture}
                  isLoading={isLoading}
                  value={draftText}
                  onChangeText={setDraftText}
                  variant="embedded"
                  captureRequestKey={captureRequestKey}
                  onFocus={handleInputFocus}
                  inputRef={chatInputRef}
                  pendingImageUri={pendingImage?.uri ?? null}
                  onClearImage={() => {
                    setPendingImage(null);
                    void setNutritionPendingImage(date, null);
                  }}
                />
              </View>
            </Surface>
          </View>
        </PageLayout>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
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
