import React from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

interface InputProps extends TextInputProps {
  className?: string;
}

export function Input({ className = '', placeholder, value, onChangeText, ...props }: InputProps) {
  return (
    <View className={`h-12 rounded-xl border border-darkBorder bg-darkCard px-4 ${className}`}>
      <TextInput
        className="flex-1 text-darkText"
        placeholder={placeholder}
        placeholderTextColor="#6B7280"
        value={value}
        onChangeText={onChangeText}
        {...props}
      />
    </View>
  );
}
