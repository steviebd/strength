import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      animationType="slide"
    >
      <View className="flex-1 bg-darkBg">
        <View className="flex-row items-center justify-between border-b border-darkBorder p-4">
          <Text className="text-darkText text-lg font-semibold">{title}</Text>
          <Pressable onPress={onClose} className="p-2">
            <Text className="text-coral text-lg">✕</Text>
          </Pressable>
        </View>
        <ScrollView className="flex-1 p-4" contentContainerStyle={{ paddingBottom: 40 }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}
