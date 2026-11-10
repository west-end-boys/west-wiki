import type {
  CharacterCommitment,
  CharacterCommitmentStatus,
  CharacterId,
  LocalDate,
} from "../index.js";
import { DomainError } from "../domain/domain-error.js";
import type {
  CharacterCommitmentStore,
  CreateCharacterCommitmentInput,
} from "../store/character-commitment-store.js";

const ISO_LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CommitmentService {
  constructor(private readonly store: CharacterCommitmentStore) {}

  async createCommitment(
    input: CreateCharacterCommitmentInput,
  ): Promise<CharacterCommitment> {
    this.validateDate(input.startDate);
    this.validateDate(input.endDate);
    if (input.startDate > input.endDate) {
      throw new DomainError(
        "INVALID_REQUEST",
        "Commitment start date must not be after its end date.",
      );
    }

    const existing = await this.store.listCommitmentsForCharacter(
      input.characterId,
    );
    const conflict = existing.find(
      (commitment) =>
        this.canBlock(commitment) &&
        this.rangesOverlap(
          input.startDate,
          input.endDate,
          commitment.startDate,
          this.effectiveEnd(commitment),
        ),
    );

    if (conflict) {
      throw new DomainError(
        "COMMITMENT_CONFLICT",
        "The requested dates overlap an existing blocking commitment.",
        { commitmentId: conflict.id },
      );
    }

    return this.store.createCommitment(input);
  }

  async cancelScheduledCommitment(
    commitmentId: string,
  ): Promise<CharacterCommitment> {
    const commitment = await this.store.getCommitment(commitmentId);
    if (!commitment) {
      throw new DomainError("NOT_FOUND", "Commitment was not found.");
    }
    if (commitment.status !== "SCHEDULED") {
      throw new DomainError(
        "DOMAIN_VALIDATION_FAILED",
        "Only scheduled commitments may be cancelled.",
        { status: commitment.status },
      );
    }
    return this.store.updateCommitment({
      ...commitment,
      status: "CANCELLED",
    });
  }

  async listForCharacter(
    characterId: CharacterId,
    asOfDate: LocalDate,
  ): Promise<CharacterCommitment[]> {
    this.validateDate(asOfDate);
    const commitments = await this.store.listCommitmentsForCharacter(characterId);
    return commitments.map((commitment) => ({
      ...commitment,
      status: this.statusAsOf(commitment, asOfDate),
    }));
  }

  async findBlockingCommitment(
    characterId: CharacterId,
    date: LocalDate,
  ): Promise<CharacterCommitment | null> {
    this.validateDate(date);
    const commitments = await this.store.listCommitmentsForCharacter(characterId);
    return (
      commitments.find(
        (commitment) =>
          this.canBlock(commitment) &&
          date >= commitment.startDate &&
          date <= this.effectiveEnd(commitment),
      ) ?? null
    );
  }

  private statusAsOf(
    commitment: CharacterCommitment,
    date: LocalDate,
  ): CharacterCommitmentStatus {
    if (commitment.status === "CANCELLED") return "CANCELLED";
    if (commitment.status === "ENDED_EARLY") return "ENDED_EARLY";
    if (date < commitment.startDate) return "SCHEDULED";
    if (date > this.effectiveEnd(commitment)) return "COMPLETED";
    return "ACTIVE";
  }

  private canBlock(commitment: CharacterCommitment): boolean {
    return commitment.status !== "CANCELLED";
  }

  private effectiveEnd(commitment: CharacterCommitment): LocalDate {
    return commitment.effectiveEndDate ?? commitment.endDate;
  }

  private rangesOverlap(
    leftStart: LocalDate,
    leftEnd: LocalDate,
    rightStart: LocalDate,
    rightEnd: LocalDate,
  ): boolean {
    return leftStart <= rightEnd && rightStart <= leftEnd;
  }

  private validateDate(date: LocalDate): void {
    if (!ISO_LOCAL_DATE.test(date)) {
      throw new DomainError(
        "INVALID_REQUEST",
        "Date must use YYYY-MM-DD format.",
        { date },
      );
    }
  }
}
