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

export default function SignUpScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to create account.");
        return;
      }

      router.replace("/");
    } catch (error) {
      setError(
        error instanceof Error && error.message === "Network request failed"
          ? "Unable to reach the auth server. Confirm the Worker is running and EXPO_PUBLIC_API_URL points at a reachable host."
          : error instanceof Error
            ? error.message
            : "Unable to create account.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Strength"
      title="Create account"
      subtitle="Start your journey with us today."
    >
      <View style={{ gap: 20 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: MUTED }}>Name</Text>
          <View style={{ position: "relative" }}>
            <Text style={{ position: "absolute", left: 16, top: 16, fontSize: 16, color: MUTED }}>👤</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: BORDER, backgroundColor: BG, borderRadius: 12, paddingVertical: 16, paddingLeft: 48, paddingRight: 16, fontSize: 16, color: TEXT }}
              placeholder="Your name"
              placeholderTextColor="#6b7280"
              value={name}
              onChangeText={setName}
            />
          </View>
        </View>

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
              placeholder="At least 8 characters"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </View>

        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: MUTED }}>Confirm Password</Text>
          <View style={{ position: "relative" }}>
            <Text style={{ position: "absolute", left: 16, top: 16, fontSize: 16, color: MUTED }}>🔐</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: BORDER, backgroundColor: BG, borderRadius: 12, paddingVertical: 16, paddingLeft: 48, paddingRight: 16, fontSize: 16, color: TEXT }}
              secureTextEntry
              placeholder="Confirm your password"
              placeholderTextColor="#6b7280"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>
        </View>

        {error ? (
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(239, 68, 68, 0.2)", backgroundColor: "rgba(239, 68, 68, 0.1)", paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ fontSize: 14, color: "#ef4444" }}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: CORAL, borderRadius: 12, paddingVertical: 16, marginTop: 8, opacity: isSubmitting ? 0.6 : 1 }}
          disabled={isSubmitting}
          onPress={handleSubmit}
        >
          {isSubmitting && <ActivityIndicator size="small" color="#ffffff" />}
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#fff" }}>
            {isSubmitting ? "Creating account..." : "Create account"}
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", justifyContent: "center", paddingTop: 8 }}>
          <Text style={{ fontSize: 14, color: MUTED }}>Already have an account? </Text>
          <Link href="/auth/sign-in">
            <Text style={{ fontSize: 14, fontWeight: "600", color: PINE }}>Sign in</Text>
          </Link>
        </View>
      </View>
    </AuthShell>
  );
}
