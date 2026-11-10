import { describe, expect, it } from "vitest";

import type { CharacterCommitment } from "../index.js";
import { DomainError } from "../domain/domain-error.js";
import { InMemoryCharacterCommitmentStore } from "../store/in-memory-character-commitment-store.js";
import { CommitmentService } from "./commitment-service.js";

function commitment(
  overrides: Partial<CharacterCommitment> = {},
): CharacterCommitment {
  return {
    id: "commitment-1",
    characterId: "tordek",
    type: "CRAFTING",
    startDate: "2026-09-15",
    endDate: "2026-09-21",
    status: "SCHEDULED",
    ...overrides,
  };
}

describe("CommitmentService", () => {
  it("rejects overlapping blocking commitments", async () => {
    const store = new InMemoryCharacterCommitmentStore({
      commitments: [commitment()],
    });
    const service = new CommitmentService(store);

    const result = service.createCommitment({
      characterId: "tordek",
      type: "TRAVEL",
      startDate: "2026-09-20",
      endDate: "2026-09-22",
      status: "SCHEDULED",
    });

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({
      code: "COMMITMENT_CONFLICT",
      details: { commitmentId: "commitment-1" },
    });
  });

  it("allows non-overlapping commitments", async () => {
    const store = new InMemoryCharacterCommitmentStore({
      commitments: [commitment()],
    });
    const service = new CommitmentService(store);

    const created = await service.createCommitment({
      characterId: "tordek",
      type: "TRAVEL",
      startDate: "2026-09-22",
      endDate: "2026-09-24",
      status: "SCHEDULED",
    });

    expect(created.startDate).toBe("2026-09-22");
  });

  it("reconciles scheduled and completed status at read time", async () => {
    const store = new InMemoryCharacterCommitmentStore({
      commitments: [commitment()],
    });
    const service = new CommitmentService(store);

    const before = await service.listForCharacter("tordek", "2026-09-14");
    const during = await service.listForCharacter("tordek", "2026-09-15");
    const after = await service.listForCharacter("tordek", "2026-09-22");

    expect(before[0]?.status).toBe("SCHEDULED");
    expect(during[0]?.status).toBe("ACTIVE");
    expect(after[0]?.status).toBe("COMPLETED");
  });

  it("treats the end date as blocking and the next day as free", async () => {
    const store = new InMemoryCharacterCommitmentStore({
      commitments: [commitment()],
    });
    const service = new CommitmentService(store);

    expect(
      await service.findBlockingCommitment("tordek", "2026-09-21"),
    ).toMatchObject({ id: "commitment-1" });
    expect(
      await service.findBlockingCommitment("tordek", "2026-09-22"),
    ).toBeNull();
  });

  it("uses effectiveEndDate for an ended-early commitment", async () => {
    const store = new InMemoryCharacterCommitmentStore({
      commitments: [
        commitment({
          status: "ENDED_EARLY",
          effectiveEndDate: "2026-09-18",
        }),
      ],
    });
    const service = new CommitmentService(store);

    expect(
      await service.findBlockingCommitment("tordek", "2026-09-18"),
    ).toMatchObject({ id: "commitment-1" });
    expect(
      await service.findBlockingCommitment("tordek", "2026-09-19"),
    ).toBeNull();
  });
});
