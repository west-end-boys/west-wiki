import type { EmailGateway, EmailMessage } from "./email-gateway.js";

/** Test/dev fake for EmailGateway. Records sends for assertion; delivers nothing. */
export class InMemoryEmailGateway implements EmailGateway {
  readonly sentMessages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sentMessages.push(structuredClone(message));
  }
}
