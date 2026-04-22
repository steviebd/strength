import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { colors, radius, spacing } from '@/theme';
import { Button } from '@/components/ui/Button';
import { MealImageCapture } from './MealImageCapture';

interface ChatInputProps {
  onSend: (text: string) => void;
  onImageCapture: (base64: string, uri: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, onImageCapture, isLoading }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.container}>
        <MealImageCapture onImageCapture={onImageCapture} disabled={isLoading} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Ask about nutrition..."
          placeholderTextColor={colors.textMuted}
          editable={!isLoading}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <Button
          onPress={handleSend}
          disabled={!text.trim() || isLoading}
          style={styles.sendButton}
          size="sm"
          variant="default"
        >
          {isLoading ? <ActivityIndicator size="small" color="#ffffff" /> : '↑'}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  sendButton: {
    width: 48,
    minWidth: 48,
  },
});
