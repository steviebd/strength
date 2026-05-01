import { StyleSheet, Text, View } from 'react-native';
import { PageLayout } from '@/components/ui/PageLayout';
import { PageHeader } from '@/components/ui/app-primitives';
import { colors, spacing, typography } from '@/theme';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <Text style={styles.paragraph}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicyScreen() {
  return (
    <PageLayout header={<PageHeader title="Privacy Policy" />}>
      <View style={styles.container}>
        <Text style={styles.effectiveDate}>Effective Date: May 1, 2026</Text>

        <Paragraph>
          Strength Pty Ltd ("Strength," "we," "us," or "our") respects your privacy. This Privacy
          Policy explains how we collect, use, store, and protect your personal information when you
          use our mobile application and related services (collectively, the "Service").
        </Paragraph>

        <Section title="1. Information We Collect">
          <Paragraph>We collect the following types of information:</Paragraph>
          <Bullet>
            Account Information: name, email address, and password hash when you register or sign
            in.
          </Bullet>
          <Bullet>
            Authentication Data: if you use Google sign-in, we receive your name and email from
            Google. We also store OAuth tokens and session identifiers.
          </Bullet>
          <Bullet>
            Fitness Data: workouts, exercises, sets, reps, weights, RPE ratings, program cycles,
            templates, and related training metrics you log through the Service.
          </Bullet>
          <Bullet>
            Health Integration Data: if you connect WHOOP, we sync and store your WHOOP profile data
            (including name, email, height, weight, and max heart rate), workouts, recovery scores,
            heart rate variability (HRV), sleep data, and other metrics provided by WHOOP.
          </Bullet>
          <Bullet>
            Nutrition Data: meal entries, macronutrient information, and AI chat messages you send
            or receive through the nutrition assistant.
          </Bullet>
          <Bullet>
            Body Stats: bodyweight, height, and personal calorie and macro targets you enter.
          </Bullet>
          <Bullet>
            Device and Usage Data: IP address, user agent, and timezone preference for session
            management, rate limiting, and security.
          </Bullet>
          <Bullet>
            Local Device Data: a local database on your device caches workouts and preferences for
            offline access and sync.
          </Bullet>
        </Section>

        <Section title="2. How We Use Your Information">
          <Paragraph>We use your information to:</Paragraph>
          <Bullet>Provide, maintain, and improve the Service.</Bullet>
          <Bullet>Authenticate your account and keep you signed in.</Bullet>
          <Bullet>Track and analyze your fitness, nutrition, and recovery data.</Bullet>
          <Bullet>Sync data with connected third-party services (e.g., WHOOP).</Bullet>
          <Bullet>Process AI-powered nutrition analysis and chat responses.</Bullet>
          <Bullet>Enforce rate limits and protect against abuse.</Bullet>
          <Bullet>Communicate with you about your account or the Service.</Bullet>
        </Section>

        <Section title="3. How We Store and Protect Your Data">
          <Paragraph>
            Your data is stored in a Cloudflare D1 (SQLite) database. We use industry-standard
            practices to protect your information, including hashed passwords and encrypted
            connections. However, no method of transmission or storage is completely secure, and we
            cannot guarantee absolute security.
          </Paragraph>
        </Section>

        <Section title="4. Third-Party Services">
          <Paragraph>
            We integrate with third-party services to provide features. These services have their
            own privacy policies:
          </Paragraph>
          <Bullet>
            Google OAuth: used for sign-in and sign-up. Subject to Google's Privacy Policy.
          </Bullet>
          <Bullet>
            WHOOP: used for health and recovery data integration. Subject to WHOOP's Privacy Policy.
          </Bullet>
          <Paragraph>We do not sell your personal information to third parties.</Paragraph>
        </Section>

        <Section title="5. Cookies and Sessions">
          <Paragraph>
            We use session cookies and tokens to keep you authenticated. These are essential for the
            Service to function and do not track you across third-party websites.
          </Paragraph>
        </Section>

        <Section title="6. Your Rights and Choices">
          <Paragraph>You may:</Paragraph>
          <Bullet>Access, update, or delete your account information through the app.</Bullet>
          <Bullet>Disconnect WHOOP or other integrations at any time.</Bullet>
          <Bullet>Request deletion of your account and associated data by contacting us.</Bullet>
          <Paragraph>
            We will comply with applicable laws regarding your rights to access, correct, or delete
            your personal information.
          </Paragraph>
        </Section>

        <Section title="7. Children's Privacy">
          <Paragraph>
            The Service is not intended for children under 13. We do not knowingly collect personal
            information from children under 13. If you believe we have collected information from a
            child under 13, please contact us immediately.
          </Paragraph>
        </Section>

        <Section title="8. International Users">
          <Paragraph>
            The Service is hosted in the United States. If you access the Service from outside the
            United States, you consent to the transfer of your information to the United States.
          </Paragraph>
        </Section>

        <Section title="9. Changes to This Policy">
          <Paragraph>
            We may update this Privacy Policy from time to time. We will notify you of material
            changes by posting the updated policy in the app. Your continued use of the Service
            after changes constitutes acceptance of the updated policy.
          </Paragraph>
        </Section>

        <Section title="10. Contact Us">
          <Paragraph>
            If you have questions or concerns about this Privacy Policy, please contact us at:
          </Paragraph>
          <Text style={styles.contactText}>Strength Pty Ltd</Text>
          <Text style={styles.contactText}>Email: stevenbduong@gmail.com</Text>
        </Section>
      </View>
    </PageLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: spacing.xl,
  },
  effectiveDate: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSizes.base,
    fontWeight: typography.fontWeights.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  paragraph: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
    paddingLeft: spacing.sm,
  },
  bulletDot: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    marginRight: spacing.sm,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 22,
  },
  contactText: {
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
