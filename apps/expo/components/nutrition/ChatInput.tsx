import React, { type RefObject } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  Pressable,
  Text,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing } from '@/theme';
import { KeyboardFormLayout } from '@/components/ui/KeyboardFormLayout';
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
  pendingImageUri?: string | null;
  onClearImage?: () => void;
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
  pendingImageUri,
  onClearImage,
}: ChatInputProps) {
  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed && !pendingImageUri) return;
    onSend(trimmed || 'Estimate this meal from the photo.');
    onChangeText('');
  };

  const content = (
    <View
      style={[
        styles.container,
        variant === 'embedded' ? styles.containerEmbedded : undefined,
        pendingImageUri ? styles.containerWithPreview : undefined,
      ]}
    >
      {pendingImageUri ? (
        <View style={styles.previewCard}>
          <Image source={{ uri: pendingImageUri }} style={styles.previewImage} />
          <View style={styles.previewCopy}>
            <Text style={styles.previewTitle}>Photo attached</Text>
            <Text style={styles.previewText}>
              Add a note, then send it to the nutrition assistant.
            </Text>
          </View>
          <Pressable
            onPress={onClearImage}
            disabled={isLoading}
            style={({ pressed }) => [styles.previewClear, pressed && styles.previewClearPressed]}
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.inputRow}>
        <MealImageCapture
          onImageCapture={onImageCapture}
          disabled={isLoading}
          captureRequestKey={captureRequestKey}
        />
        <View style={styles.inputWrapper}>
          <TextInput
            testID="nutrition-chat-input"
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
        <Pressable
          testID="nutrition-chat-send"
          onPress={handleSend}
          disabled={(!value.trim() && !pendingImageUri) || isLoading}
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.sendButtonPressed,
            ((!value.trim() && !pendingImageUri) || isLoading) && styles.sendButtonDisabled,
          ]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="paper-plane" size={18} color="#ffffff" />
          )}
        </Pressable>
      </View>
    </View>
  );

  if (variant === 'embedded') {
    return content;
  }

  return <KeyboardFormLayout>{content}</KeyboardFormLayout>;
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    paddingBottom: 48,
  },
  containerWithPreview: {
    gap: spacing.md,
  },
  containerEmbedded: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  previewImage: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
  },
  previewCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  previewTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  previewText: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  previewClear: {
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  previewClearPressed: {
    opacity: 0.7,
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
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
