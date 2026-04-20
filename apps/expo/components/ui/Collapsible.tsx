import React, { useState } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';

interface CollapsibleProps extends ViewProps {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export function Collapsible({ label, children, defaultOpen = false, ...props }: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <View {...props}>
      <Pressable
        onPress={() => setIsOpen(!isOpen)}
        className="flex-row items-center justify-between py-2"
      >
        <Text className="text-darkText font-semibold">{label}</Text>
        <Text className="text-darkMuted text-sm">{isOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {isOpen && <View className="mt-2">{children}</View>}
    </View>
  );
}
