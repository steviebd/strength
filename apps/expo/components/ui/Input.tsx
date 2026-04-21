import React from 'react';
import { TextInput, View, StyleSheet, type TextInputProps } from 'react-native';
import { colors, radius, typography } from '@/theme';

interface InputProps extends TextInputProps {}

export function Input({ placeholder, value, onChangeText, style, ...props }: InputProps) {
  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, style]}
        placeholder={placeholder}
        placeholderTextColor="#6B7280"
        value={value}
        onChangeText={onChangeText}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.normal,
  },
});
