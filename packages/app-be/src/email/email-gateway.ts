export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Application-owned email delivery seam. Needed by account
 * verification/recovery (doc/app/adr/005-email-and-password-authentication.md)
 * and by notifications (doc/app/REQUIREMENTS.md Notification Requirements).
 * Real provider selection is deferred - ADR 005's own open question.
 */
export interface EmailGateway {
  send(message: EmailMessage): Promise<void>;
}
