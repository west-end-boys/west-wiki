import type {
  CharacterCommitment,
  CharacterId,
  ScheduleDowntimeRequest,
} from "../index.js";
import { DomainError } from "../domain/domain-error.js";
import type {
  KnowledgeBaseGateway,
  ViewerContext,
} from "../kb/knowledge-base-gateway.js";
import { CommitmentService } from "./commitment-service.js";

const DOWNTIME_TYPES = new Set([
  "TRAVEL",
  "CAROUSING",
  "CRAFTING",
  "TRAINING",
  "RECOVERY",
  "OTHER",
]);

export class DowntimeService {
  constructor(
    private readonly kb: KnowledgeBaseGateway,
    private readonly commitments: CommitmentService,
  ) {}

  async scheduleDowntime(
    characterId: CharacterId,
    request: ScheduleDowntimeRequest,
    context: ViewerContext,
  ): Promise<CharacterCommitment> {
    const character = await this.kb.getCharacter(characterId, context);
    if (!character) {
      throw new DomainError("NOT_FOUND", "Character was not found.");
    }

    if (character.ownerUserId !== context.userId) {
      throw new DomainError(
        "FORBIDDEN",
        "Only the character owner may schedule downtime for this character.",
      );
    }

    if (character.lifecycleStatus !== "ACTIVE") {
      throw new DomainError(
        "CHARACTER_NOT_ELIGIBLE",
        "Only active characters may schedule downtime.",
        { lifecycleStatus: character.lifecycleStatus },
      );
    }

    if (!DOWNTIME_TYPES.has(request.type)) {
      throw new DomainError(
        "INVALID_REQUEST",
        "The requested activity is not a downtime type.",
        { type: request.type },
      );
    }

    await this.validateTravelRequest(request, context);

    return this.commitments.createCommitment({
      characterId,
      type: request.type,
      startDate: request.startDate,
      endDate: request.endDate,
      status: "SCHEDULED",
      description: request.description,
      sourceType: "DOWNTIME_REQUEST",
      activityData: request.activityData,
    });
  }

  async cancelScheduledDowntime(
    characterId: CharacterId,
    commitmentId: string,
    context: ViewerContext,
  ): Promise<CharacterCommitment> {
    const character = await this.kb.getCharacter(characterId, context);
    if (!character) {
      throw new DomainError("NOT_FOUND", "Character was not found.");
    }

    if (character.ownerUserId !== context.userId) {
      throw new DomainError(
        "FORBIDDEN",
        "Only the character owner may cancel this downtime.",
      );
    }

    const commitment = await this.commitments.getCommitment(commitmentId);
    if (!commitment || commitment.characterId !== characterId) {
      throw new DomainError("NOT_FOUND", "Downtime commitment was not found.");
    }

    if (commitment.type === "EXPEDITION") {
      throw new DomainError(
        "DOMAIN_VALIDATION_FAILED",
        "Expedition commitments are not downtime and cannot be cancelled through this workflow.",
      );
    }

    return this.commitments.cancelScheduledCommitment(commitmentId);
  }

  private async validateTravelRequest(
    request: ScheduleDowntimeRequest,
    context: ViewerContext,
  ): Promise<void> {
    if (request.type !== "TRAVEL") return;

    const destinationLocationId = request.activityData?.destinationLocationId;
    if (
      typeof destinationLocationId !== "string" ||
      destinationLocationId.length === 0
    ) {
      throw new DomainError(
        "INVALID_REQUEST",
        "Travel downtime requires activityData.destinationLocationId.",
      );
    }

    const locations = await this.kb.listLocations(context);
    if (!locations.some((location) => location.id === destinationLocationId)) {
      throw new DomainError(
        "INVALID_LOCATION",
        "Travel destination was not found.",
        { locationId: destinationLocationId },
      );
    }
  }
}
