import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Alert,
  AppState,
  Keyboard,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { PageLayout } from '@/components/ui/PageLayout';
import { ActionButton, PageHeader, SectionTitle, Surface } from '@/components/ui/app-primitives';
import { colors, overlay, radius, spacing, typography } from '@/theme';
import { apiFetch } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import {
  getNutritionChatDraft,
  getNutritionChatMessages,
  getNutritionPendingImage,
  removeNutritionPendingImage,
  setNutritionChatDraft,
  setNutritionChatMessages,
  setNutritionPendingImage,
} from '@/lib/storage';
import { getCachedDailySummary, cacheDailySummary } from '@/db/nutrition';
import { useOfflineQuery } from '@/hooks/useOfflineQuery';
import { usePullToRefresh, getPullToRefreshErrorMessage } from '@/hooks/usePullToRefresh';
import { ChatInput } from '@/components/nutrition/ChatInput';
import { ChatMessage } from '@/components/nutrition/ChatMessage';
import { NutritionDashboard } from '@/components/nutrition/NutritionDashboard';
import { KeyboardFormLayout } from '@/components/ui/KeyboardFormLayout';
import { useWhoopData } from '@/hooks/useWhoopData';
import { useUserPreferences } from '@/context/UserPreferencesContext';
import { getTodayLocalDate } from '@/lib/timezone';
import {
  parseMealAnalysisFromContent,
  resolveMealTypeForAnalysis,
  type MealAnalysis,
} from '@/lib/nutritionChat';
import { OfflineError, tryOnlineOrEnqueue } from '@/lib/offline-mutation';
import { useNutritionMutations } from '@/hooks/useNutritionMutations';
import { getLocalDb } from '@/db/client';
import { localChatMessageQueue } from '@/db/local-schema';
import { eq, and } from 'drizzle-orm';
import { generateId } from '@strength/db/client';
import { runTrainingSync } from '@/lib/workout-sync';
import { hasPendingTrainingWrites } from '@/db/training-read-model';

type TrainingType = 'rest_day' | 'cardio' | 'powerlifting';

interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string;
  analysis?: MealAnalysis;
  savedEntryId?: string | null;
  createdAt?: string | null;
  isPlaceholder?: boolean;
  queueId?: string;
  jobId?: string;
  status?: 'pending' | 'failed';
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

interface ChatCreateResponse {
  jobId: string;
  status: 'pending';
}

interface ChatJobResponse {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  content: string | null;
  error: string | null;
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
const NUTRITION_BOTTOM_INSET = 120;
const CHAT_JOB_TIMEOUT_MS = 3 * 60 * 1000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildNutritionDateUrl(
  path: string,
  date: string,
  timezone: string | null | undefined,
  params?: Record<string, string | number | null | undefined>,
) {
  const searchParams = new URLSearchParams({ date });
  if (timezone) {
    searchParams.set('timezone', timezone);
  }

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  return `${path}?${searchParams.toString()}`;
}

function getNutritionLocalStateKey(date: string, timezone: string | null | undefined) {
  return `${date}_${timezone ?? 'local'}`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

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

function mergeServerHistoryWithLocalState(
  serverMessages: ChatMessageData[],
  localMessages: ChatMessageData[],
): ChatMessageData[] {
  const merged = mergeSavedEntryIds(serverMessages, localMessages);
  const localInFlightMessages = localMessages.filter(
    (message) =>
      message.isPlaceholder || message.status === 'pending' || message.status === 'failed',
  );

  if (localInFlightMessages.length === 0) {
    return merged;
  }

  const serverFingerprints = new Set(merged.map(getMessageSavedKey));
  const mergedIds = new Set(merged.map((message) => message.id));
  const mergedQueueIds = new Set(
    merged.map((message) => message.queueId).filter((queueId): queueId is string => !!queueId),
  );
  const preserved = localInFlightMessages.filter((message) => {
    const localIndex = localMessages.findIndex((localMessage) => localMessage.id === message.id);
    const localUserMessage =
      localIndex > 0 && localMessages[localIndex - 1].role === 'user'
        ? localMessages[localIndex - 1]
        : null;
    const matchingServerUserIndex = localUserMessage
      ? merged.findIndex(
          (serverMessage) =>
            serverMessage.role === 'user' && serverMessage.content === localUserMessage.content,
        )
      : -1;
    const hasServerAssistantForLocalUser =
      matchingServerUserIndex !== -1 && merged[matchingServerUserIndex + 1]?.role === 'assistant';

    if (hasServerAssistantForLocalUser) {
      return false;
    }

    if (mergedIds.has(message.id)) {
      return false;
    }

    if (message.queueId && mergedQueueIds.has(message.queueId)) {
      return false;
    }

    if (!message.isPlaceholder && serverFingerprints.has(getMessageSavedKey(message))) {
      return false;
    }

    return true;
  });

  return [...merged, ...preserved];
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
  const params = useLocalSearchParams<{ focusChat?: string }>();
  const session = authClient.useSession();
  const userId = session.data?.user?.id ?? null;
  const { activeTimezone } = useUserPreferences();
  const { isRefreshing, handleRefresh } = usePullToRefresh(userId);
  const date = getTodayLocalDate(activeTimezone);
  const localStateKey = useMemo(
    () => getNutritionLocalStateKey(date, activeTimezone),
    [activeTimezone, date],
  );
  const dailySummaryQueryKey = useMemo(
    () => ['nutrition-daily-summary', date, activeTimezone],
    [activeTimezone, date],
  );
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
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const hasAppliedServerHistory = useRef(false);
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const chatInputRef = useRef<TextInput | null>(null);
  const hasFocusedChatRoute = useRef(false);
  const activeChatPolls = useRef(new Set<string>());
  const savingAnalysisMessageIds = useRef(new Set<string>());

  const { data: whoopData } = useWhoopData(date, activeTimezone ?? 'UTC');

  const { data: summary, refetch: refetchSummary } = useOfflineQuery<DailySummary>({
    queryKey: dailySummaryQueryKey,
    enabled: !!userId,
    apiFn: () =>
      apiFetch<DailySummary>(
        buildNutritionDateUrl('/api/nutrition/daily-summary', date, activeTimezone),
      ),
    cacheFn: () =>
      getCachedDailySummary(userId!, date, activeTimezone ?? 'UTC') as Promise<DailySummary | null>,
    writeCacheFn: (data) => cacheDailySummary(userId!, date, activeTimezone ?? 'UTC', data),
    isDirtyFn: () => hasPendingTrainingWrites(userId!, ['nutrition']),
    fallbackToCacheOnError: true,
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
        getNutritionChatMessages<ChatMessageData>(localStateKey),
        getNutritionChatDraft(localStateKey),
        getNutritionPendingImage(localStateKey),
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
  }, [localStateKey]);

  useEffect(() => {
    if (!hasRestoredLocalState) return;
    void setNutritionChatMessages(localStateKey, messages.slice(-CHAT_HISTORY_PAGE_SIZE));
  }, [hasRestoredLocalState, localStateKey, messages]);

  useEffect(() => {
    if (!hasRestoredLocalState) return;
    void setNutritionChatDraft(localStateKey, draftText);
  }, [draftText, hasRestoredLocalState, localStateKey]);

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
    queryKey: ['nutrition-chat-history-initial', date, activeTimezone],
    enabled: hasRestoredLocalState,
    queryFn: () =>
      apiFetch(
        buildNutritionDateUrl('/api/nutrition/chat/history', date, activeTimezone, {
          limit: CHAT_HISTORY_PAGE_SIZE,
        }),
      ),
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!historyQuery.data) {
      return;
    }

    const isInitialHistoryLoad = hasAppliedServerHistory.current !== true;
    const serverMessages = historyQuery.data.messages.map((message) =>
      normalizeMessage({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt ?? null,
      }),
    );

    setMessages((current) => mergeServerHistoryWithLocalState(serverMessages, current));
    setHistoryCursor(historyQuery.data.nextCursor);
    setHasMoreHistory(historyQuery.data.hasMore);
    if (isInitialHistoryLoad) {
      setExchangeExpansion({});
    }
    hasAppliedServerHistory.current = true;
  }, [historyQuery.data]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void historyQuery.refetch();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [historyQuery.refetch]);

  const { saveMealMutation, deleteMealMutation, trainingContextMutation } = useNutritionMutations({
    date,
    activeTimezone,
    dailySummaryQueryKey,
    refetchSummary,
    clearSavedEntryFromMessages,
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
          if (error instanceof OfflineError || (error as Error)?.name === 'OfflineError') {
            setOfflineMessage("Saved locally. Will sync when you're back online.");
            return;
          }
          const message = error instanceof Error ? error.message : 'Unable to delete meal.';
          Alert.alert('Delete failed', message);
        },
      });
    },
    [deleteMealMutation],
  );

  const pollChatJob = useCallback(async (jobId: string, assistantMsgId: string) => {
    if (activeChatPolls.current.has(jobId)) {
      return;
    }

    activeChatPolls.current.add(jobId);

    try {
      const jobStartedAt = Date.now();
      let pollInterval = 1000;
      let assistantContent = '';

      while (Date.now() - jobStartedAt < CHAT_JOB_TIMEOUT_MS) {
        const job = await apiFetch<ChatJobResponse>(`/api/nutrition/chat/jobs/${jobId}`);

        if (job.status === 'completed') {
          assistantContent = job.content ?? '';
          break;
        }

        if (job.status === 'failed') {
          throw new Error(job.error ?? 'The assistant could not complete that request.');
        }

        await delay(pollInterval);
        pollInterval = Math.min(pollInterval * 2, 16000);
      }

      if (!assistantContent.trim()) {
        throw new Error('The assistant took too long to respond.');
      }

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMsgId
            ? {
                ...message,
                content: assistantContent,
                isPlaceholder: false,
                queueId: undefined,
                jobId: undefined,
                status: undefined,
                analysis: parseMealAnalysisFromContent(assistantContent) ?? message.analysis,
              }
            : message,
        ),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to reach the nutrition assistant.';
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === assistantMsgId && entry.isPlaceholder
            ? {
                ...entry,
                content: `I couldn't complete that request. ${message}`,
                isPlaceholder: false,
                queueId: undefined,
                jobId: undefined,
                status: undefined,
              }
            : entry,
        ),
      );
    } finally {
      activeChatPolls.current.delete(jobId);
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const pendingMessages = messages.filter(
        (message) => message.role === 'assistant' && message.isPlaceholder && message.jobId,
      );

      for (const message of pendingMessages) {
        void pollChatJob(message.jobId!, message.id);
      }
    }, [messages, pollChatJob]),
  );

  const sendMessage = useCallback(
    async (text: string, imageOverride?: { base64: string; uri: string } | null) => {
      if (!userId) return;
      const attachedImage = imageOverride ?? pendingImage;
      const userMsg: ChatMessageData = {
        id: Date.now().toString(),
        role: 'user',
        content: text,
        imageUri: attachedImage?.uri,
      };

      setMessages((prev) => [...prev, userMsg]);
      setPendingImage(null);
      void removeNutritionPendingImage(localStateKey);
      setIsLoading(true);

      const assistantMsgId = (Date.now() + 1).toString();

      const messagesToSend = [...messages, userMsg].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const queueId = generateId();

      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: 'assistant', content: '', isPlaceholder: true, queueId },
      ]);

      try {
        const response = await tryOnlineOrEnqueue({
          apiCall: () =>
            apiFetch<ChatCreateResponse>('/api/nutrition/chat', {
              method: 'POST',
              body: {
                messages: messagesToSend,
                date,
                timezone: activeTimezone,
                hasImage: !!attachedImage,
                imageBase64: attachedImage?.base64,
                syncOperationId: queueId,
              },
            }),
          userId,
          entityType: 'chat_message',
          operation: 'send_chat_message',
          entityId: queueId,
          payload: {
            messages: messagesToSend,
            date,
            timezone: activeTimezone,
            hasImage: !!attachedImage,
            imageBase64: attachedImage?.base64,
          },
          onEnqueue: async () => {
            const db = getLocalDb();
            if (!db) return;
            db.insert(localChatMessageQueue)
              .values({
                id: queueId,
                userId,
                date,
                timezone: activeTimezone ?? 'UTC',
                content: text,
                hasImage: !!attachedImage,
                imageBase64: attachedImage?.base64 ?? null,
                messagesJson: JSON.stringify(messagesToSend),
                status: 'pending',
                attemptCount: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              })
              .run();
          },
        });

        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMsgId
              ? { ...message, jobId: response.jobId, status: undefined }
              : message,
          ),
        );
        await pollChatJob(response.jobId, assistantMsgId);
      } catch (error) {
        if (error instanceof OfflineError || (error as Error)?.name === 'OfflineError') {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsgId
                ? { ...message, isPlaceholder: true, status: 'pending', queueId }
                : message,
            ),
          );
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Unable to reach the nutrition assistant.';
        setMessages((prev) =>
          prev.map((entry) =>
            entry.id === assistantMsgId
              ? {
                  ...entry,
                  content: `I couldn't complete that request. ${message}`,
                  isPlaceholder: false,
                  queueId: undefined,
                }
              : entry,
          ),
        );
      } finally {
        if (!activeChatPolls.current.size) {
          setIsLoading(false);
        }
      }
    },
    [activeTimezone, date, localStateKey, messages, pendingImage, pollChatJob, userId],
  );

  const handleRetryChatMessage = useCallback(
    async (queueId: string) => {
      if (!userId) return;
      const db = getLocalDb();
      if (!db) return;
      db.update(localChatMessageQueue)
        .set({ status: 'pending', attemptCount: 0, updatedAt: new Date() })
        .where(eq(localChatMessageQueue.id, queueId))
        .run();
      await runTrainingSync(userId);
    },
    [userId],
  );

  const onRefresh = useCallback(async () => {
    setOfflineMessage(null);
    try {
      await handleRefresh();
    } catch (err) {
      setOfflineMessage(getPullToRefreshErrorMessage(err));
    }
  }, [handleRefresh]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      const pollStartedAt = Date.now();
      const interval = setInterval(() => {
        if (Date.now() - pollStartedAt > CHAT_JOB_TIMEOUT_MS) {
          clearInterval(interval);
          return;
        }
        const db = getLocalDb();
        if (!db) return;

        const completed = db
          .select()
          .from(localChatMessageQueue)
          .where(
            and(
              eq(localChatMessageQueue.userId, userId),
              eq(localChatMessageQueue.date, date),
              eq(localChatMessageQueue.timezone, activeTimezone ?? 'UTC'),
              eq(localChatMessageQueue.status, 'sent'),
            ),
          )
          .all();

        if (completed.length > 0) {
          setMessages((prev) => {
            const updated = [...prev];
            for (const item of completed) {
              const idx = updated.findIndex(
                (m) => m.role === 'assistant' && m.queueId === item.id && m.isPlaceholder,
              );
              if (idx !== -1 && item.assistantContent) {
                updated[idx] = {
                  ...updated[idx],
                  content: item.assistantContent,
                  isPlaceholder: false,
                  status: undefined,
                  queueId: undefined,
                };
              }
            }
            return updated;
          });

          for (const item of completed) {
            db.delete(localChatMessageQueue).where(eq(localChatMessageQueue.id, item.id)).run();
          }
        }

        const failed = db
          .select()
          .from(localChatMessageQueue)
          .where(
            and(
              eq(localChatMessageQueue.userId, userId),
              eq(localChatMessageQueue.date, date),
              eq(localChatMessageQueue.timezone, activeTimezone ?? 'UTC'),
              eq(localChatMessageQueue.status, 'failed'),
            ),
          )
          .all();

        if (failed.length > 0) {
          setMessages((prev) => {
            const updated = [...prev];
            for (const item of failed) {
              const idx = updated.findIndex(
                (m) => m.role === 'assistant' && m.queueId === item.id && m.isPlaceholder,
              );
              if (idx !== -1 && updated[idx].status !== 'failed') {
                updated[idx] = {
                  ...updated[idx],
                  isPlaceholder: true,
                  status: 'failed',
                };
              }
            }
            return updated;
          });
        }
      }, 2000);
      return () => clearInterval(interval);
    }, [userId, date, activeTimezone]),
  );

  const loadOlderHistory = useCallback(async () => {
    if (!historyCursor || isLoadingMoreHistory) {
      return;
    }

    setIsLoadingMoreHistory(true);

    try {
      const response = await apiFetch<ChatHistoryResponse>(
        buildNutritionDateUrl('/api/nutrition/chat/history', date, activeTimezone, {
          limit: CHAT_HISTORY_PAGE_SIZE,
          before: historyCursor,
        }),
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
  }, [activeTimezone, date, historyCursor, isLoadingMoreHistory]);

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
        if (error instanceof OfflineError || (error as Error)?.name === 'OfflineError') {
          setOfflineMessage("Saved locally. Will sync when you're back online.");
        } else {
          const message = error instanceof Error ? error.message : 'Unable to save meal.';
          Alert.alert('Save failed', message);
        }
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

  const scrollToChatInput = useCallback((focusInput = false, delayMs = 80) => {
    setTimeout(() => {
      messagesScrollRef.current?.scrollToEnd({ animated: true });

      if (focusInput) {
        setTimeout(() => {
          chatInputRef.current?.focus();
        }, 250);
      }
    }, delayMs);
  }, []);

  const handleInputFocus = useCallback(() => {
    scrollToChatInput(false);
  }, [scrollToChatInput]);

  const handleImageCapture = useCallback(
    (base64: string, uri: string) => {
      const image = { base64, uri };
      setPendingImage(image);
      void setNutritionPendingImage(localStateKey, image);
      scrollToChatInput(true, 0);
    },
    [localStateKey, scrollToChatInput],
  );

  useEffect(() => {
    if (params.focusChat !== '1' || hasFocusedChatRoute.current) {
      return;
    }

    hasFocusedChatRoute.current = true;
    scrollToChatInput(true);
  }, [params.focusChat, scrollToChatInput]);

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
      <KeyboardFormLayout style={styles.keyboardAvoidingView}>
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
            refreshControl: (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={colors.accentSecondary}
              />
            ),
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

          <View>
            <Surface style={styles.assistantSection}>
              <SectionTitle title="Nutrition Assistant" />
              <Text style={styles.assistantDescription}>
                Use a photo or a quick prompt to estimate meals, ask for meal ideas, or get macro
                guidance.
              </Text>

              {offlineMessage ? (
                <View style={styles.offlineBanner}>
                  <Text style={styles.offlineBannerText}>{offlineMessage}</Text>
                </View>
              ) : null}

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
                          onRetry={() => {
                            if (exchange.assistantMessage?.queueId) {
                              void handleRetryChatMessage(exchange.assistantMessage.queueId);
                            }
                          }}
                        />
                      );
                    })}
                  </>
                )}
              </View>

              <View>
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
                    void removeNutritionPendingImage(localStateKey);
                  }}
                />
              </View>
            </Surface>
          </View>
        </PageLayout>
      </KeyboardFormLayout>
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
    borderColor: overlay.muted,
    backgroundColor: overlay.inverseSubtle,
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
  offlineBanner: {
    backgroundColor: overlay.muted,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  offlineBannerText: {
    fontSize: typography.fontSizes.base,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
