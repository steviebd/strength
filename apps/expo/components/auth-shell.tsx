import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

const BG = "#0a0a0a";
const CARD = "#1a1a1a";
const BORDER = "#2a2a2a";
const TEXT = "#f5f5f5";
const MUTED = "#a0a0a0";
const PINE = "#1f4d3c";

export function AuthShell(props: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: "padding", default: undefined })}
      style={{ flex: 1, backgroundColor: BG }}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20, paddingVertical: 48 }}>
          <View style={{ alignItems: "center", marginBottom: 40 }}>
            <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: PINE, alignItems: "center", justifyContent: "center", marginBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }}>
              <Text style={{ fontSize: 28, fontWeight: "700", color: "#fff" }}>S</Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 3, color: MUTED, textTransform: "uppercase" }}>{props.eyebrow}</Text>
          </View>

          <View style={{ borderRadius: 24, borderWidth: 1, borderColor: BORDER, backgroundColor: CARD, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 }}>
            <View style={{ marginBottom: 32 }}>
              <Text style={{ fontSize: 28, fontWeight: "700", color: TEXT }}>{props.title}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: MUTED, marginTop: 8 }}>{props.subtitle}</Text>
            </View>
            {props.children}
          </View>

          <Text style={{ marginTop: 32, textAlign: "center", fontSize: 12, color: MUTED, opacity: 0.5 }}>Powered by Better Auth + Cloudflare</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
