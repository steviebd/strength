export class WhoopSessionExpiredError extends Error {
  code = 'WHOOP_SESSION_EXPIRED' as const;
  reauthUrl: string | null = null;

  constructor(message = 'WHOOP session has expired. Please reconnect your account.') {
    super(message);
    this.name = 'WhoopSessionExpiredError';
  }
}

type WhoopReauthCause = 'token_revoked' | 'refresh_failed' | 'no_refresh_token';

export class WhoopNotConnectedError extends Error {
  code = 'WHOOP_NOT_CONNECTED' as const;
  message = 'WHOOP not connected. Please connect your account.';
  reauthUrl: string | null = null;

  constructor() {
    super('WHOOP not connected. Please connect your account.');
    this.name = 'WhoopNotConnectedError';
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
): error is WhoopSessionExpiredError | WhoopReauthRequiredError | WhoopNotConnectedError {
  return (
    error instanceof WhoopSessionExpiredError ||
    error instanceof WhoopReauthRequiredError ||
    error instanceof WhoopNotConnectedError
  );
}

export function toWhoopAuthErrorResponse(
  error: WhoopSessionExpiredError | WhoopReauthRequiredError | WhoopNotConnectedError,
) {
  if (error instanceof WhoopReauthRequiredError) {
    return {
      error: error.code,
      message: error.message,
      cause: error.cause,
    };
  }

  if (error instanceof WhoopNotConnectedError) {
    return {
      error: error.code,
      message: error.message,
      reauthUrl: error.reauthUrl,
    };
  }

  return {
    error: error.code,
    message: error.message,
    reauthUrl: error.reauthUrl,
  };
}
