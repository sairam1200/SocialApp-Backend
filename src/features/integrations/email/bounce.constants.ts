export const EMAIL_BOUNCE_EVENTS = {
  HARD_BOUNCE: 'hard_bounce',
  INVALID_EMAIL: 'invalid_email',
} as const;

export type EmailBounceEventType =
  (typeof EMAIL_BOUNCE_EVENTS)[keyof typeof EMAIL_BOUNCE_EVENTS];
