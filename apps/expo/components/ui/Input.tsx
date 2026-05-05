import React, { forwardRef, useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  Pressable,
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

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  {
    label,
    helperText,
    errorText,
    leftIcon,
    rightSlot,
    containerStyle,
    multiline = false,
    secureTextEntry,
    style,
    ...props
  },
  ref,
) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const isPassword = secureTextEntry === true;
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
          ref={ref}
          style={[
            styles.input,
            multiline && styles.multilineInput,
            leftIcon && styles.inputWithLeftIcon,
            style,
          ]}
          placeholderTextColor={colors.placeholderText}
          multiline={multiline}
          secureTextEntry={isPassword ? !isPasswordVisible : secureTextEntry}
          {...props}
        />
        {isPassword && !rightSlot ? (
          <Pressable
            onPress={() => setIsPasswordVisible((v) => !v)}
            style={styles.passwordToggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : (
          rightSlot && <View style={styles.rightSlot}>{rightSlot}</View>
        )}
      </View>
      {errorText && <Text style={styles.errorText}>{errorText}</Text>}
      {helperText && !errorText && <Text style={styles.helperText}>{helperText}</Text>}
    </View>
  );
});

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
  passwordToggle: {
    marginLeft: 8,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
