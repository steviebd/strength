import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  captureRequestKey?: number;
}

export function MealImageCapture({
  onImageCapture,
  disabled,
  captureRequestKey,
}: MealImageCaptureProps) {
  const [isCapturing, setIsCapturing] = useState(false);
  const lastCaptureRequestKey = useRef<number | undefined>(captureRequestKey);

  const [_cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [_mediaLibraryPermission, requestMediaLibraryPermission] = useMediaLibraryPermissions();

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
      base64: true,
      compress: 0.6,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    if (!manipulated.base64) {
      throw new Error('Unable to prepare the photo for upload.');
    }

    onImageCapture(manipulated.base64, manipulated.uri);
  };

  const handlePress = () => {
    captureImage();
  };

  useEffect(() => {
    if (captureRequestKey == null || captureRequestKey === lastCaptureRequestKey.current) {
      return;
    }

    lastCaptureRequestKey.current = captureRequestKey;
    void captureImage();
  }, [captureRequestKey]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={pickImage}
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
