import React from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { border, colors, radius, textRoles, layout, text } from '@/theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  helperText?: string;
  errorText?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightSlot?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({
  label,
  helperText,
  errorText,
  leftIcon,
  rightSlot,
  containerStyle,
  multiline = false,
  style,
  ...props
}: TextFieldProps) {
  const hasError = Boolean(errorText);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputContainer, hasError && styles.inputError]}>
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={18}
            color={hasError ? colors.error : colors.textMuted}
            style={styles.leftIcon}
          />
        )}
        <TextInput
          style={[
            styles.input,
            multiline && styles.multilineInput,
            leftIcon && styles.inputWithLeftIcon,
            style,
          ]}
          placeholderTextColor={colors.placeholderText}
          multiline={multiline}
          {...props}
        />
        {rightSlot && <View style={styles.rightSlot}>{rightSlot}</View>}
      </View>
      {errorText && <Text style={styles.errorText}>{errorText}</Text>}
      {helperText && !errorText && <Text style={styles.helperText}>{helperText}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: textRoles.bodySmall.fontSize,
    fontWeight: textRoles.bodySmall.fontWeight,
    color: text.secondary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: layout.controlHeight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: border.default,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: border.danger,
  },
  leftIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: textRoles.input.fontSize,
    fontWeight: textRoles.input.fontWeight,
    minWidth: 0,
  },
  inputWithLeftIcon: {
    paddingLeft: 0,
  },
  multilineInput: {
    height: 'auto',
    minHeight: 80,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  rightSlot: {
    marginLeft: 8,
  },
  errorText: {
    fontSize: textRoles.caption.fontSize,
    color: text.danger,
  },
  helperText: {
    fontSize: textRoles.caption.fontSize,
    color: text.tertiary,
  },
});

export { TextField as Input };
