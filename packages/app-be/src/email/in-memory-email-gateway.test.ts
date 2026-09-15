import { describe, expect, it } from "vitest";

import { InMemoryEmailGateway } from "./in-memory-email-gateway.js";

describe("InMemoryEmailGateway", () => {
  it("records a sent message for later assertion", async () => {
    const gateway = new InMemoryEmailGateway();

    await gateway.send({
      to: "player@example.com",
      subject: "Welcome to Western Reaches",
      body: "Your account has been created.",
    });

    expect(gateway.sentMessages).toEqual([
      {
        to: "player@example.com",
        subject: "Welcome to Western Reaches",
        body: "Your account has been created.",
      },
    ]);
  });

  it("accumulates multiple sends in order", async () => {
    const gateway = new InMemoryEmailGateway();

    await gateway.send({ to: "a@example.com", subject: "First", body: "1" });
    await gateway.send({ to: "b@example.com", subject: "Second", body: "2" });

    expect(gateway.sentMessages.map((message) => message.subject)).toEqual([
      "First",
      "Second",
    ]);
  });
});
