# OAuth + Username/Password Interchangeability Plan

## Goal
Enable users to sign up with either OAuth (Google) or email/password, then seamlessly switch between the two login methods on the same account. This includes email verification, password reset via Resend, and a proactive frontend modal that detects OAuth-only users and guides them to set a password.

## Key Finding

Better Auth's built-in `resetPassword` endpoint **automatically creates a credential account if one does not exist**. This means the forgot-password flow doubles as a "set password" flow for OAuth-only users, eliminating the need for a custom "add password" API.

---

## Phase 1: Dependencies & Environment

### 1.1 Add Resend to Worker

**File:** `apps/worker/package.json`

Add `resend` to `dependencies`.

### 1.2 Add Environment Variables

**File:** `apps/worker/src/auth.ts`

Add to `WorkerEnv` interface:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (e.g., `auth@stevenduong.com`)

**File:** `apps/worker/wrangler.template.toml`

Add the same keys so they are injected by Infisical at build/deploy time.

**Infisical:**

Add `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to the `dev`, `staging`, and `prod` environments.

---

## Phase 2: Backend — Email Helpers

### 2.1 Create `apps/worker/src/auth/email.ts`

**Responsibilities:**

- Initialize a Resend client using `RESEND_API_KEY`.
- Export `sendPasswordResetEmail({ to, url })` — sends a branded HTML email with the reset link.
- Export `sendVerificationEmail({ to, url })` — sends a branded HTML email with the verification link.

Both emails should be minimal, dark-themed, and consistent with the app's visual identity.

---

## Phase 3: Backend — Better Auth Configuration

### 3.1 Update `apps/worker/src/auth.ts`

Modify the `betterAuth()` call to include:

```typescript
emailAndPassword: {
  enabled: true,
  password: {
    hash: hashPassword,
    verify: verifyPassword,
  },
  sendResetPassword: async ({ user, url }) => {
    await sendPasswordResetEmail({ to: user.email, url });
  },
  resetPasswordTokenExpiresIn: 3600, // 1 hour
  requireEmailVerification: true,
},
emailVerification: {
  sendOnSignUp: true,
  sendVerificationEmail: async ({ user, url }) => {
    await sendVerificationEmail({ to: user.email, url });
  },
},
account: {
  accountLinking: {
    enabled: true,
    trustedProviders: ['google', 'credential'],
  },
},
```

**Effects:**

- Users who sign up with email/password can later link Google OAuth to the same account.
- Users who sign up with Google can later set a password via forgot password and log in with email/password.
- Email verification is required before email/password sign-in is permitted.

---

## Phase 4: Backend — Custom API for Proactive Modal

### 4.1 Create `POST /api/auth/check-email-provider`

**File:** `apps/worker/src/index.ts` (or a dedicated auth routes file)

**Request body:** `{ email: string }`

**Response:** `{ hasCredential: boolean, hasOAuth: boolean }`

**Logic:**

1. Normalize email to lowercase.
2. Look up the user by email.
3. If no user exists, return `{ hasCredential: false, hasOAuth: false }` (prevents email enumeration via timing attacks by doing a dummy hash lookup).
4. Look up the user's linked accounts in the `account` table.
5. Return whether a `credential` provider account exists and whether any OAuth provider account exists.

**Rate limiting:**

Apply the existing `checkRateLimit` utility at **5 requests per hour per IP** to mitigate email enumeration and brute force.

---

## Phase 5: Backend — Rate Limit Auth Endpoints

### 5.1 Apply Rate Limiting

Use the existing `checkRateLimit` utility on:

- `POST /api/auth/request-password-reset`
- `POST /api/auth/check-email-provider`

This is currently unimplemented for auth routes and should be added as middleware or inline checks.

---

## Phase 6: Frontend — New Auth Screens

### 6.1 `apps/expo/app/auth/forgot-password.tsx`

**UI:**

- Email input field.
- Submit button.
- Success state: *"If this email exists in our system, check your inbox for a reset link."*

**Logic:**

- On submit, call `authClient.forgetPassword({ email, redirectTo })`.
- `redirectTo` must be:
  - Native: `Linking.createURL('/auth/reset-password')`
  - Web: `${window.location.origin}/auth/reset-password`

### 6.2 `apps/expo/app/auth/reset-password.tsx`

**Deep link:** `strength://auth/reset-password?token=...`

**UI:**

- New password input.
- Confirm password input.
- Submit button.

**Logic:**

- Parse `token` from the URL query parameters on mount.
- On submit, validate that passwords match and meet minimum length (8 characters).
- Call `authClient.resetPassword({ newPassword, token })`.
- On success, poll `waitForSessionReady()` (reusing the existing helper) until the session is established, then redirect to `/(app)/home` or a `returnTo` parameter.

### 6.3 `apps/expo/app/auth/verify-email.tsx`

**Deep link:** `strength://auth/verify-email?token=...`

**UI:**

- Loading spinner while verifying.
- Success state: *"Your email has been verified."* with a button to go to Sign In.
- Error state: *"This verification link is invalid or has expired."*

**Logic:**

- Parse `token` from URL on mount.
- Call `authClient.verifyEmail({ token })`.
- Handle success and error states accordingly.

---

## Phase 7: Frontend — Update Sign-In Screen

### 7.1 File: `apps/expo/app/auth/sign-in.tsx`

**Additions:**

1. **"Forgot password?" link** below the password input. Tapping it navigates to `/auth/forgot-password`.

2. **Proactive OAuth-only detection modal:**
   - On `authClient.signIn.email` failure (e.g., `INVALID_EMAIL_OR_PASSWORD`):
     - Call `POST /api/auth/check-email-provider` with the entered email.
     - If `hasCredential === false && hasOAuth === true`:
       - Show a **React Native `<Modal>`** (matching existing app patterns in `workouts.tsx` and `programs.tsx`) with the following content:
         > "You originally signed up with Google. To sign in with your email and password, you first need to set a password."
         > 
         > [Set Password] — triggers `authClient.forgetPassword({ email, redirectTo })` and shows the success message.
         > 
         > [Continue with Google] — triggers `authClient.signIn.social({ provider: 'google' ... })`.
     - Otherwise, display the standard error message.

---

## Phase 8: Frontend — Update Sign-Up Screen

### 8.1 File: `apps/expo/app/auth/sign-up.tsx`

**Additions:**

- After successful `authClient.signUp.email`, if the response indicates the user needs to verify their email (or if the session is not immediately ready because `requireEmailVerification` is true), show a message:
  > "Check your email to verify your account before signing in."
- Google sign-up remains unchanged — verified Google emails are treated as already verified.

---

## Phase 9: Deep Linking & Routing

Ensure the following Expo Router routes are created and reachable via deep links:

| Route | Deep Link Example |
|---|---|
| `/auth/reset-password` | `strength://auth/reset-password?token=abc123` |
| `/auth/verify-email` | `strength://auth/verify-email?token=abc123` |

Expo Router handles deep links automatically based on the `scheme` defined in `app.config.ts` (`strength`). No additional native linking configuration is required beyond creating the screen files.

---

## Phase 10: Testing Plan

| Scenario | Expected Result |
|---|---|
| User A signs up with email+password, verifies email, then signs in with Google | Google account links to existing User A; both login methods work |
| User B signs up with Google, then clicks "Forgot Password" | Receives Resend email, sets password via reset screen, can now sign in with email+password |
| User B tries email sign-in before setting password | App shows proactive modal: "You signed up with Google. Set a password..." |
| User C signs up with email+password but does not verify | Sign-in fails with "Email not verified"; resend verification email flow works |
| Rate limit on `/check-email-provider` | Blocked after 5 requests/hour |
| Rate limit on `/request-password-reset` | Blocked after threshold |
| Reset password on native Android/iOS | Deep link opens `auth/reset-password`, token is consumed, password is set, session is established automatically |
| Email verification on native | Deep link opens `auth/verify-email`, token is consumed, user sees success screen |

---

## Security Considerations

- **Account pre-hijacking:** Because `trustedProviders` includes both `google` and `credential`, a malicious actor could register with `victim@example.com` via password before the victim signs in with Google. Requiring `emailVerification: true` mitigates this for the password path. The Google path is safe because Google verifies email ownership.
- **Email enumeration:** The `check-email-provider` endpoint and `request-password-reset` endpoint must always return the same success message regardless of whether the email exists, to prevent timing attacks. The `check-email-provider` endpoint should perform a dummy password hash lookup when no user is found.
- **Rate limiting:** Both new endpoints must be strictly rate-limited.
- **Token expiry:** Password reset tokens expire in 1 hour. Verification tokens use Better Auth's default expiry.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `apps/worker/package.json` | Add `resend` dependency |
| `apps/worker/src/auth.ts` | Add env vars to `WorkerEnv`, update `betterAuth()` config |
| `apps/worker/src/auth/email.ts` | **Create** — Resend email helpers |
| `apps/worker/src/index.ts` | Add `/api/auth/check-email-provider` route + rate limiting |
| `apps/worker/wrangler.template.toml` | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `apps/expo/app/auth/forgot-password.tsx` | **Create** |
| `apps/expo/app/auth/reset-password.tsx` | **Create** |
| `apps/expo/app/auth/verify-email.tsx` | **Create** |
| `apps/expo/app/auth/sign-in.tsx` | Add forgot-password link + proactive modal logic |
| `apps/expo/app/auth/sign-up.tsx` | Add verification pending message |
| Infisical (all envs) | Add `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |

---

## Decision Log

| Decision | Rationale |
|---|---|
| **Proactive modal vs. passive helper** | Proactive modal was chosen for smoother UX. It requires a custom `check-email-provider` endpoint but prevents user confusion. |
| **Email verification enabled** | Eliminates account pre-hijacking risk for email/password sign-ups and ensures email ownership is proven before linking. |
| **Resend as email provider** | Already have a verified domain (`stevenduong.com`) and Resend is simple to integrate in a Cloudflare Worker environment. |
| **Reuse forgot-password as "set password"** | Better Auth's `resetPassword` endpoint auto-creates a credential account if missing. No custom endpoint needed. |
| **Rate limit on `check-email-provider`** | 5 req/hour per IP is strict but sufficient for legitimate UX flow while preventing enumeration abuse. |
