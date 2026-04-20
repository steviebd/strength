import React from 'react';
import { Pressable, Text, type PressableProps } from 'react-native';

type ButtonVariant = 'default' | 'outline' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: 'bg-coral',
  outline: 'border border-darkBorder bg-transparent',
  ghost: 'bg-transparent',
};

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-12 px-4',
  sm: 'h-10 px-3',
  lg: 'h-14 px-6',
};

export function Button({
  variant = 'default',
  size = 'default',
  className = '',
  disabled,
  onPress,
  children,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center justify-center rounded-xl ${variantStyles[variant]} ${sizeStyles[size]} ${disabled ? 'opacity-50' : ''} ${className}`}
      style={({ pressed }) => (pressed ? { transform: [{ scale: 0.95 }] } : undefined)}
    >
      {typeof children === 'string' ? (
        <Text className="text-darkText font-semibold">{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
