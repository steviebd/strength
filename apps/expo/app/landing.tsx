import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography, textRoles, radius, border } from '@/theme';

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardIcon}>
        <Ionicons name={icon} size={24} color={colors.accent} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardDescription}>{description}</Text>
    </View>
  );
}

export default function LandingPage() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarBrand}>strength</Text>
        <View style={styles.topBarActions}>
          <Pressable onPress={() => router.push('/auth/sign-in')}>
            <Text style={styles.signInText}>Sign In</Text>
          </Pressable>
          <Button
            label="Get Started"
            variant="primary"
            size="sm"
            onPress={() => router.push('/auth/sign-up')}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Text style={styles.brand}>strength</Text>
          <Text style={styles.tagline}>
            Track workouts, build programs, monitor nutrition, and sync with WHOOP — all in one
            place.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>What you can do</Text>
          <View style={styles.featuresGrid}>
            <FeatureCard
              icon="barbell-outline"
              title="Workout Tracking"
              description="Log exercises, sets, reps, and RPE ratings with a focused, distraction-free interface."
            />
            <FeatureCard
              icon="list-outline"
              title="Program Builder"
              description="Create structured training programs and follow progressive cycles to reach your goals."
            />
            <FeatureCard
              icon="nutrition-outline"
              title="Nutrition & AI"
              description="Log meals, track macros, and get AI-powered nutrition insights and meal suggestions."
            />
            <FeatureCard
              icon="pulse-outline"
              title="WHOOP Integration"
              description="Sync recovery, sleep, and strain data from your WHOOP strap for a complete picture."
            />
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLinks}>
            <Text style={styles.footerLink} onPress={() => router.push('/privacy')}>
              Privacy Policy
            </Text>
            <Text style={styles.footerDivider}>·</Text>
            <Text style={styles.footerLink} onPress={() => router.push('/terms')}>
              Terms of Service
            </Text>
          </View>
          <Text style={styles.footerCopy}>
            © {new Date().getFullYear()} Strength Pty Ltd · stevenbduong@gmail.com
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: border.subtle,
    backgroundColor: colors.background,
  },
  topBarBrand: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.bold,
    color: colors.text,
    letterSpacing: -0.5,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  signInText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.textMuted,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xxl,
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  hero: {
    gap: spacing.lg,
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  brand: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
    textAlign: 'center',
  },
  tagline: {
    fontSize: typography.fontSizes.lg,
    lineHeight: 26,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 480,
  },
  featuresSection: {
    gap: spacing.lg,
  },
  sectionTitle: {
    ...textRoles.sectionTitle,
    textAlign: 'center',
    color: colors.text,
  },
  featuresGrid: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: border.default,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: 'rgba(239,111,79,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
  },
  cardDescription: {
    fontSize: typography.fontSizes.sm,
    lineHeight: 20,
    color: colors.textMuted,
  },
  footer: {
    gap: spacing.sm,
    alignItems: 'center',
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: border.subtle,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  footerLink: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  footerDivider: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  footerCopy: {
    fontSize: typography.fontSizes.sm,
    color: colors.placeholderText,
    textAlign: 'center',
  },
});
