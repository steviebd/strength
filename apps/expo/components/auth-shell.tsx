import type { ReactNode } from 'react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

const BG = '#0a0a0a';
const CARD = '#1a1a1a';
const BORDER = '#2a2a2a';
const TEXT = '#f5f5f5';
const MUTED = '#a0a0a0';
const PINE = '#1f4d3c';

export interface AuthShellHandle {
  scrollToInput: (y: number) => void;
}

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  scrollPadding?: number;
}

export const AuthShell = forwardRef<AuthShellHandle, AuthShellProps>(
  ({ eyebrow, title, subtitle, children, scrollPadding = 180 }, ref) => {
    const { height: windowHeight } = useWindowDimensions();
    const scrollViewRef = useRef<ScrollView>(null);

    useImperativeHandle(ref, () => ({
      scrollToInput: (y: number) => {
        scrollViewRef.current?.scrollTo({
          y: y - scrollPadding,
          animated: true,
        });
      },
    }));

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        style={{ flex: 1, backgroundColor: BG }}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={{
            flexGrow: 1,
            minHeight: windowHeight,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              flex: 1,
              paddingHorizontal: 20,
              paddingVertical: 48,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 40 }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  backgroundColor: PINE,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 24,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff' }}>S</Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  letterSpacing: 3,
                  color: MUTED,
                  textTransform: 'uppercase',
                }}
              >
                {eyebrow}
              </Text>
            </View>

            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: BORDER,
                backgroundColor: CARD,
                padding: 24,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.25,
                shadowRadius: 16,
                elevation: 12,
              }}
            >
              <View style={{ marginBottom: 32 }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT }}>{title}</Text>
                <Text style={{ fontSize: 14, lineHeight: 20, color: MUTED, marginTop: 8 }}>
                  {subtitle}
                </Text>
              </View>
              {children}
            </View>

            <Text
              style={{
                marginTop: 32,
                textAlign: 'center',
                fontSize: 12,
                color: MUTED,
                opacity: 0.5,
              }}
            >
              Powered by Better Auth + Cloudflare
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  },
);
