import { Resend } from 'resend';

function getResendClient(apiKey: string | undefined): Resend | null {
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function buildEmailHtml({
  title,
  preview,
  bodyHtml,
  ctaText,
  ctaUrl,
  footerText,
}: {
  title: string;
  preview: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  footerText: string;
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        background-color: #0a0a0a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      .container {
        max-width: 480px;
        margin: 0 auto;
        padding: 40px 24px;
      }
      .card {
        background-color: #18181b;
        border: 1px solid #27272a;
        border-radius: 16px;
        padding: 32px;
      }
      .preview {
        display: none;
      }
      h1 {
        color: #fafafa;
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 16px;
        line-height: 1.3;
      }
      p {
        color: #a1a1aa;
        font-size: 15px;
        line-height: 1.6;
        margin: 0 0 24px;
      }
      .cta {
        display: inline-block;
        background-color: #ef6f4f;
        color: #fafafa;
        text-decoration: none;
        padding: 14px 24px;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 600;
      }
      .footer {
        margin-top: 24px;
        color: #71717a;
        font-size: 13px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <span class="preview">${preview}</span>
    <div class="container">
      <div class="card">
        <h1>${title}</h1>
        ${bodyHtml}
        <a href="${ctaUrl}" class="cta">${ctaText}</a>
        <p class="footer">${footerText}</p>
      </div>
    </div>
  </body>
</html>`;
}

export async function sendPasswordResetEmail({
  to,
  url,
  apiKey,
  fromEmail,
}: {
  to: string;
  url: string;
  apiKey: string | undefined;
  fromEmail: string | undefined;
}) {
  const resend = getResendClient(apiKey);
  if (!resend || !fromEmail) {
    console.warn('Resend not configured; password reset email not sent');
    return;
  }

  const html = buildEmailHtml({
    title: 'Reset your password',
    preview: 'Reset your Strength password',
    bodyHtml: `<p>We received a request to reset the password for your Strength account. Click the button below to set a new password. This link expires in 1 hour.</p>`,
    ctaText: 'Reset Password',
    ctaUrl: url,
    footerText:
      "If you didn't request a password reset, you can safely ignore this email. Your account is secure.",
  });

  await resend.emails.send({
    from: fromEmail,
    to,
    subject: 'Reset your Strength password',
    html,
  });
}

export async function sendVerificationEmail({
  to,
  url,
  apiKey,
  fromEmail,
}: {
  to: string;
  url: string;
  apiKey: string | undefined;
  fromEmail: string | undefined;
}) {
  const resend = getResendClient(apiKey);
  if (!resend || !fromEmail) {
    console.warn('Resend not configured; verification email not sent');
    return;
  }

  const html = buildEmailHtml({
    title: 'Verify your email',
    preview: 'Verify your Strength email address',
    bodyHtml: `<p>Thanks for signing up for Strength. Please verify your email address by clicking the button below.</p>`,
    ctaText: 'Verify Email',
    ctaUrl: url,
    footerText: "If you didn't create an account with Strength, you can safely ignore this email.",
  });

  await resend.emails.send({
    from: fromEmail,
    to,
    subject: 'Verify your Strength email',
    html,
  });
}
