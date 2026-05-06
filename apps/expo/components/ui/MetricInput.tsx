import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useScrollToInput } from '@/context/ScrollContext';
import { border, colors, layout, radius, surface, textRoles } from '@/theme';

interface MetricInputProps extends TextInputProps {}

export const MetricInput = forwardRef<TextInput, MetricInputProps>(function MetricInput(
  { style, onBlur, onFocus, ...props },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const wrapperRef = useRef<View>(null);
  const scrollToInput = useScrollToInput();

  useImperativeHandle(ref, () => inputRef.current as TextInput);

  return (
    <View ref={wrapperRef} collapsable={false}>
      <TextInput
        ref={inputRef}
        style={[styles.input, focused && styles.inputFocused, style]}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.placeholderText}
        selectTextOnFocus
        onFocus={(event) => {
          setFocused(true);
          scrollToInput(wrapperRef);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    minHeight: layout.controlHeight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: border.default,
    backgroundColor: surface.inset,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: colors.text,
    fontSize: textRoles.metricValue.fontSize,
    lineHeight: textRoles.metricValue.lineHeight,
    fontWeight: textRoles.metricValue.fontWeight,
  },
  inputFocused: {
    borderColor: border.focus,
  },
});
