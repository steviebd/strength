import { useState } from "react";
import { Link, router } from "expo-router";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";

const BG = "#0a0a0a";
const BORDER = "#2a2a2a";
const TEXT = "#f5f5f5";
const MUTED = "#a0a0a0";
const PINE = "#1f4d3c";
const CORAL = "#ef6f4f";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to sign in.");
        return;
      }

      router.replace("/");
    } catch (error) {
      setError(
        error instanceof Error && error.message === "Network request failed"
          ? "Unable to reach the auth server. Confirm the Worker is running and EXPO_PUBLIC_API_URL points at a reachable host."
          : error instanceof Error
            ? error.message
            : "Unable to sign in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Strength"
      title="Welcome back"
      subtitle="Sign in to continue your journey."
    >
      <View style={{ gap: 20 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: MUTED }}>Email</Text>
          <View style={{ position: "relative" }}>
            <Text style={{ position: "absolute", left: 16, top: 16, fontSize: 16, color: MUTED }}>✉️</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: BORDER, backgroundColor: BG, borderRadius: 12, paddingVertical: 16, paddingLeft: 48, paddingRight: 16, fontSize: 16, color: TEXT }}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#6b7280"
              value={email}
              onChangeText={setEmail}
            />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: MUTED }}>Password</Text>
          <View style={{ position: "relative" }}>
            <Text style={{ position: "absolute", left: 16, top: 16, fontSize: 16, color: MUTED }}>🔒</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: BORDER, backgroundColor: BG, borderRadius: 12, paddingVertical: 16, paddingLeft: 48, paddingRight: 16, fontSize: 16, color: TEXT }}
              secureTextEntry
              placeholder="Enter your password"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </View>

        {error ? (
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.2)", backgroundColor: "rgba(239, 68, 68, 0.1)", paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 14, color: "#ef4444" }}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: PINE, borderRadius: 12, paddingVertical: 16, marginTop: 8, opacity: isSubmitting ? 0.6 : 1 }}
          disabled={isSubmitting}
          onPress={handleSubmit}
        >
          {isSubmitting && <ActivityIndicator size="small" color="#ffffff" />}
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "center", paddingTop: 8 }}>
          <Text style={{ fontSize: 14, color: MUTED }}>Don't have an account? </Text>
          <Link href="/auth/sign-up">
            <Text style={{ fontSize: 14, fontWeight: "600", color: CORAL }}>Create one</Text>
          </Link>
        </View>
      </View>
    </AuthShell>
  );
}
