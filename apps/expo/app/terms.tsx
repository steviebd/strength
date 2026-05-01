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

export default function TermsOfServiceScreen() {
  return (
    <PageLayout header={<PageHeader title="Terms of Service" />}>
      <View style={styles.container}>
        <Text style={styles.effectiveDate}>Effective Date: May 1, 2026</Text>

        <Paragraph>
          These Terms of Service ("Terms") govern your access to and use of the Strength mobile
          application and related services (collectively, the "Service") provided by Strength Pty
          Ltd ("Strength," "we," "us," or "our"). By creating an account, signing in, or otherwise
          using the Service, you agree to these Terms. If you do not agree, do not use the Service.
        </Paragraph>

        <Section title="1. Use of the Service">
          <Paragraph>
            You must be at least 13 years old to use the Service. You agree to use the Service only
            for lawful purposes and in accordance with these Terms. You are responsible for
            maintaining the confidentiality of your account credentials.
          </Paragraph>
        </Section>

        <Section title="2. User Accounts">
          <Paragraph>
            You may create an account using an email address and password or through Google sign-in.
            You agree to provide accurate and complete information and to keep it updated. You are
            solely responsible for all activity that occurs under your account.
          </Paragraph>
        </Section>

        <Section title="3. User Content">
          <Paragraph>
            You retain ownership of any data you input into the Service, including workout logs,
            nutrition entries, and health data. By using the Service, you grant us a limited license
            to store, process, and display your data solely to provide the Service to you.
          </Paragraph>
          <Paragraph>
            You are responsible for the accuracy of any health or fitness data you enter. The
            Service does not provide medical advice. Always consult a qualified healthcare
            professional before beginning any exercise or nutrition program.
          </Paragraph>
        </Section>

        <Section title="4. Third-Party Integrations">
          <Paragraph>
            The Service allows you to connect third-party services such as WHOOP and Google. Your
            use of these integrations is subject to the respective third-party terms and policies.
            We are not responsible for the availability, accuracy, or practices of these third-party
            services.
          </Paragraph>
        </Section>

        <Section title="5. Intellectual Property">
          <Paragraph>
            The Service, including its software, design, text, graphics, and logos, is owned by
            Strength Pty Ltd and is protected by copyright and other intellectual property laws. You
            may not copy, modify, distribute, or create derivative works from the Service without
            our prior written consent.
          </Paragraph>
        </Section>

        <Section title="6. Disclaimers">
          <Paragraph>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
            EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
          </Paragraph>
          <Paragraph>
            WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT
            ANY DATA LOSS WILL NOT OCCUR. YOU USE THE SERVICE AT YOUR OWN RISK.
          </Paragraph>
        </Section>

        <Section title="7. Limitation of Liability">
          <Paragraph>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, STRENGTH PTY LTD SHALL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF
            PROFITS, DATA, OR GOODWILL, ARISING OUT OF OR RELATING TO YOUR USE OF THE SERVICE.
          </Paragraph>
          <Paragraph>
            OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THESE TERMS OR THE SERVICE SHALL NOT
            EXCEED THE AMOUNT YOU PAID US TO USE THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE
            CLAIM, OR ONE HUNDRED U.S. DOLLARS (US$100), WHICHEVER IS GREATER.
          </Paragraph>
        </Section>

        <Section title="8. Indemnification">
          <Paragraph>
            You agree to indemnify and hold harmless Strength Pty Ltd and its officers, directors,
            employees, and agents from any claims, damages, losses, or expenses (including
            reasonable attorneys' fees) arising out of your use of the Service, your violation of
            these Terms, or your violation of any rights of a third party.
          </Paragraph>
        </Section>

        <Section title="9. Termination">
          <Paragraph>
            We may suspend or terminate your account and access to the Service at any time, with or
            without cause or notice. You may delete your account at any time through the app or by
            contacting us. Upon termination, your right to use the Service will immediately cease.
          </Paragraph>
        </Section>

        <Section title="10. Governing Law">
          <Paragraph>
            These Terms shall be governed by and construed in accordance with the laws of the State
            of California, United States, without regard to its conflict of law principles. Any
            dispute arising under these Terms shall be resolved in the state or federal courts
            located in California.
          </Paragraph>
        </Section>

        <Section title="11. Changes to These Terms">
          <Paragraph>
            We may modify these Terms from time to time. We will notify you of material changes by
            posting the updated Terms in the app. Your continued use of the Service after changes
            constitutes acceptance of the updated Terms.
          </Paragraph>
        </Section>

        <Section title="12. Contact Us">
          <Paragraph>If you have questions about these Terms, please contact us at:</Paragraph>
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
