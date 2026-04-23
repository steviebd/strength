export type WhoopReauthCause = 'token_revoked' | 'refresh_failed' | 'no_refresh_token';

export class WhoopSessionExpiredError extends Error {
  code = 'WHOOP_SESSION_EXPIRED' as const;
  reauthUrl: string | null = null;

  constructor(message = 'WHOOP session has expired. Please reconnect your account.') {
    super(message);
    this.name = 'WhoopSessionExpiredError';
  }
}

export class WhoopReauthRequiredError extends Error {
  code = 'WHOOP_REAUTH_REQUIRED' as const;

  constructor(
    public cause: WhoopReauthCause,
    message = 'WHOOP access has been revoked. Please re-authorize.',
  ) {
    super(message);
    this.name = 'WhoopReauthRequiredError';
  }
}

export function isWhoopAuthError(
  error: unknown,
): error is WhoopSessionExpiredError | WhoopReauthRequiredError {
  return error instanceof WhoopSessionExpiredError || error instanceof WhoopReauthRequiredError;
}

export function toWhoopAuthErrorResponse(
  error: WhoopSessionExpiredError | WhoopReauthRequiredError,
) {
  if (error instanceof WhoopReauthRequiredError) {
    return {
      error: error.code,
      message: error.message,
      cause: error.cause,
    };
  }

  return {
    error: error.code,
    message: error.message,
    reauthUrl: error.reauthUrl,
  };
}
