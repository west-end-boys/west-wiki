import type {
  CharacterAvailability,
  CharacterId,
  LocalDate,
} from "../index.js";
import { DomainError } from "../domain/domain-error.js";
import type {
  KnowledgeBaseGateway,
  ViewerContext,
} from "../kb/knowledge-base-gateway.js";
import { CommitmentService } from "./commitment-service.js";

export class AvailabilityService {
  constructor(
    private readonly kb: KnowledgeBaseGateway,
    private readonly commitments: CommitmentService,
  ) {}

  async getCharacterAvailability(
    characterId: CharacterId,
    date: LocalDate,
    context: ViewerContext,
  ): Promise<CharacterAvailability> {
    const character = await this.kb.getCharacter(characterId, context);
    if (!character) {
      throw new DomainError("NOT_FOUND", "Character was not found.");
    }

    if (character.lifecycleStatus === "MISSING") {
      return {
        characterId,
        date,
        available: false,
        reasons: [{ code: "MISSING" }],
      };
    }

    if (character.lifecycleStatus !== "ACTIVE") {
      return {
        characterId,
        date,
        available: false,
        reasons: [{ code: "NOT_ACTIVE" }],
      };
    }

    const blockingCommitment = await this.commitments.findBlockingCommitment(
      characterId,
      date,
    );
    if (blockingCommitment) {
      return {
        characterId,
        date,
        available: false,
        reasons: [
          {
            code: "BLOCKING_COMMITMENT",
            commitmentId: blockingCommitment.id,
          },
        ],
      };
    }

    return {
      characterId,
      date,
      available: true,
      reasons: [{ code: "AVAILABLE" }],
    };
  }
}
