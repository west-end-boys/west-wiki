import type {
  ActivateCharacterRequest,
  CharacterCommandResult,
  CharacterId,
} from "../index";
import { DomainError } from "../domain/domain-error";
import type {
  KnowledgeBaseGateway,
  ViewerContext,
} from "../kb/knowledge-base-gateway";

export class CharacterService {
  constructor(private readonly kb: KnowledgeBaseGateway) {}

  async activateCharacter(
    characterId: CharacterId,
    request: ActivateCharacterRequest,
    context: ViewerContext,
  ): Promise<CharacterCommandResult> {
    const [campaign, character, ownedCharacters, startingLocations] =
      await Promise.all([
        this.kb.getCampaign(context),
        this.kb.getCharacter(characterId, context),
        this.kb.listCharacters(context.userId, context),
        this.kb.listStartingLocations(context),
      ]);

    if (!character) {
      throw new DomainError("NOT_FOUND", "Character was not found.");
    }

    if (character.ownerUserId !== context.userId) {
      throw new DomainError(
        "FORBIDDEN",
        "Only the character owner may activate this character.",
      );
    }

    if (character.lifecycleStatus !== "DRAFT") {
      throw new DomainError(
        "CHARACTER_NOT_DRAFT",
        "Only draft characters may be activated.",
        { lifecycleStatus: character.lifecycleStatus },
      );
    }

    const rosterCount = ownedCharacters.filter(
      (candidate) =>
        candidate.lifecycleStatus === "ACTIVE" ||
        candidate.lifecycleStatus === "MISSING",
    ).length;

    if (rosterCount >= campaign.characterRules.maxRosterSize) {
      throw new DomainError(
        "ROSTER_LIMIT_REACHED",
        "The player has no available character roster slots.",
        {
          current: rosterCount,
          maximum: campaign.characterRules.maxRosterSize,
        },
      );
    }

    const startingLocation = startingLocations.find(
      (location) => location.id === request.startingLocationId,
    );

    if (!startingLocation || !startingLocation.allowsCharacterActivation) {
      throw new DomainError(
        "INVALID_STARTING_LOCATION",
        "The requested location is not a valid character starting location.",
        { startingLocationId: request.startingLocationId },
      );
    }

    if (campaign.characterRules.activationPolicy !== "AUTOMATIC") {
      throw new DomainError(
        "DOMAIN_VALIDATION_FAILED",
        "This campaign requires GM approval before character activation.",
        { activationPolicy: campaign.characterRules.activationPolicy },
      );
    }

    return this.kb.recordCharacterActivated(
      {
        characterId,
        startingLocationId: request.startingLocationId,
      },
      context,
    );
  }
}
