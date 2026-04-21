import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { Button } from '@/components/ui/Button';
import { SaveMealDialog } from '@/components/nutrition/SaveMealDialog';

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
      const response = await fetch(`${env.apiUrl}/api/nutrition/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.concat(userMessage).map(({ role, content }) => ({ role, content })),
          date,
        }),
        credentials: 'include',
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
  const router = useRouter();
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
      const res = await fetch(`${env.apiUrl}/api/nutrition/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, date }),
      });
      if (!res.ok) throw new Error('Failed to save entry');
      return res.json();
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
      <View className={`flex-row mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
        <View
          className={`max-w-[80%] rounded-2xl px-4 py-3 ${isUser ? 'bg-coral' : 'bg-darkCard border border-darkBorder'}`}
        >
          <Text className={`text-base ${isUser ? 'text-white' : 'text-darkText'}`}>
            {item.content}
          </Text>
          {item.analysis && (
            <View className="mt-3 rounded-xl border border-coral/20 bg-coral/10 p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center gap-2 mb-2">
                    <Text className="text-coral text-base">🍽</Text>
                    <Text className="text-darkText font-semibold truncate" numberOfLines={1}>
                      {item.analysis.name}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-4 text-sm">
                    <Text className="text-darkText font-medium">{item.analysis.calories} kcal</Text>
                    <Text className="text-darkMuted">
                      P:{' '}
                      <Text className="text-darkText font-medium">{item.analysis.proteinG}g</Text>
                    </Text>
                    <Text className="text-darkMuted">
                      C: <Text className="text-darkText font-medium">{item.analysis.carbsG}g</Text>
                    </Text>
                    <Text className="text-darkMuted">
                      F: <Text className="text-darkText font-medium">{item.analysis.fatG}g</Text>
                    </Text>
                  </View>
                </View>
                <Button size="sm" onPress={() => handleSaveClick(item.analysis!)}>
                  Save
                </Button>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-darkBg">
      <View className="flex-row items-center justify-between border-b border-darkBorder px-4 py-4">
        <Pressable onPress={() => router.back()} className="p-2">
          <Text className="text-darkMuted text-lg">←</Text>
        </Pressable>
        <Text className="text-darkText text-lg font-semibold">Log Meal</Text>
        <View className="w-10" />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        ListEmptyComponent={
          <View className="py-8 items-center">
            <Text className="text-darkMuted text-center mb-4">
              Ask me about your meals or get nutrition advice
            </Text>
            <View className="flex-row flex-wrap justify-center gap-2">
              {quickActions.map((action) => (
                <Pressable
                  key={action}
                  onPress={() => setInput(action)}
                  className="rounded-full border border-darkBorder px-4 py-2"
                >
                  <Text className="text-darkMuted text-sm">{action}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListFooterComponent={
          isLoading ? (
            <View className="justify-start mb-3">
              <View className="rounded-2xl bg-darkCard border border-darkBorder px-4 py-3">
                <ActivityIndicator size="small" color="#ef6f4f" />
              </View>
            </View>
          ) : null
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="border-t border-darkBorder p-4 bg-darkBg"
      >
        <View className="flex-row gap-2">
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about nutrition..."
            placeholderTextColor="#6B7280"
            className="flex-1 h-12 rounded-xl border border-darkBorder bg-darkCard px-4 text-darkText"
          />
          <Button
            onPress={handleSubmit}
            disabled={isLoading || !input.trim()}
            className="h-12 w-12 items-center justify-center rounded-xl"
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text className="text-darkText text-lg">↑</Text>
            )}
          </Button>
        </View>
      </KeyboardAvoidingView>

      <SaveMealDialog
        visible={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        analysis={pendingAnalysis}
        onSave={(data) => saveMutation.mutate(data)}
      />
    </View>
  );
}
