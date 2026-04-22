import React, { useState } from 'react';
import { Pressable, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  useCameraPermissions,
  useMediaLibraryPermissions,
  launchCameraAsync,
  launchImageLibraryAsync,
} from 'expo-image-picker';
import { colors, radius } from '@/theme';

interface MealImageCaptureProps {
  onImageCapture: (base64: string, uri: string) => void;
  disabled?: boolean;
}

export function MealImageCapture({ onImageCapture, disabled }: MealImageCaptureProps) {
  const [isCapturing, setIsCapturing] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mediaLibraryPermission, requestMediaLibraryPermission] = useMediaLibraryPermissions();

  const showPermissionDeniedAlert = () => {
    Alert.alert(
      'Camera Access Required',
      'This app needs camera access to capture meal photos. Please enable it in your device settings.',
      [{ text: 'OK' }],
    );
  };

  const captureImage = async () => {
    if (isCapturing || disabled) return;

    setIsCapturing(true);

    try {
      const cameraStatus = await requestCameraPermission();
      if (!cameraStatus.granted) {
        showPermissionDeniedAlert();
        return;
      }

      const result = await launchCameraAsync({
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const uri = result.assets[0].uri;
      await processImage(uri);
    } finally {
      setIsCapturing(false);
    }
  };

  const pickImage = async () => {
    if (isCapturing || disabled) return;

    setIsCapturing(true);

    try {
      const mediaLibraryStatus = await requestMediaLibraryPermission();
      if (!mediaLibraryStatus.granted) {
        showPermissionDeniedAlert();
        return;
      }

      const result = await launchImageLibraryAsync({
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const uri = result.assets[0].uri;
      await processImage(uri);
    } finally {
      setIsCapturing(false);
    }
  };

  const processImage = async (uri: string) => {
    const manipulated = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1200 } }], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    const response = await fetch(manipulated.uri);
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let base64 = '';
    for (let i = 0; i < bytes.length; i++) {
      base64 += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(base64);

    onImageCapture(base64, uri);
  };

  const handlePress = () => {
    if (cameraPermission?.granted || mediaLibraryPermission?.granted) {
      captureImage();
    } else {
      pickImage();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || isCapturing}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Ionicons name="camera-outline" size={22} color={disabled ? colors.textMuted : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
