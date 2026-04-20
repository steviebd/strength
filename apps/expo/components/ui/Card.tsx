import React from 'react';
import { View, type ViewProps } from 'react-native';

interface CardProps extends ViewProps {
  className?: string;
  children: React.ReactNode;
  interactive?: boolean;
}

export function Card({ className = '', children, interactive = false, ...props }: CardProps) {
  return (
    <View
      className={`rounded-2xl border border-darkBorder bg-darkCard p-4 ${interactive ? 'active:opacity-80' : ''} ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}
