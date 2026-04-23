import React, { type RefObject } from 'react';
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
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  variant?: 'embedded' | 'footer';
  captureRequestKey?: number;
  onFocus?: () => void;
  inputRef?: RefObject<TextInput | null>;
}

export function ChatInput({
  onSend,
  onImageCapture,
  isLoading,
  value,
  onChangeText,
  placeholder = 'Describe a meal, ask a question, or request a meal idea...',
  variant = 'footer',
  captureRequestKey,
  onFocus,
  inputRef,
}: ChatInputProps) {
  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    onChangeText('');
  };

  const content = (
    <View style={[styles.container, variant === 'embedded' ? styles.containerEmbedded : undefined]}>
      <MealImageCapture
        onImageCapture={onImageCapture}
        disabled={isLoading}
        captureRequestKey={captureRequestKey}
      />
      <View style={styles.inputWrapper}>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          editable={!isLoading}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          multiline
          maxLength={2000}
          onFocus={onFocus}
        />
      </View>
      <Button
        onPress={handleSend}
        disabled={!value.trim() || isLoading}
        style={styles.sendButton}
        size="sm"
        variant="default"
      >
        {isLoading ? <ActivityIndicator size="small" color="#ffffff" /> : '↑'}
      </Button>
    </View>
  );

  if (variant === 'embedded') {
    return content;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {content}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    paddingBottom: 48,
  },
  containerEmbedded: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  inputWrapper: {
    flex: 1,
    minHeight: 80,
    maxHeight: 160,
  },
  input: {
    flex: 1,
    minHeight: 80,
    maxHeight: 160,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 48,
    minWidth: 48,
    alignSelf: 'flex-end',
  },
});
