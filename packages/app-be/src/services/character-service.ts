import type {
  ActivateCharacterRequest,
  CharacterCommandResult,
  CharacterId,
  CharacterLifecycleStatus,
  CreateCharacterRequest,
  RetireCharacterRequest,
} from "../index.js";
import { DomainError } from "../domain/domain-error.js";
import type {
  KnowledgeBaseGateway,
  ViewerContext,
} from "../kb/knowledge-base-gateway.js";
import type { CampaignStore } from "../store/campaign-store.js";

const RETIREMENT_ELIGIBLE_STATUSES: ReadonlySet<CharacterLifecycleStatus> =
  new Set(["ACTIVE", "MISSING"]);

export class CharacterService {
  constructor(
    private readonly kb: KnowledgeBaseGateway,
    private readonly campaignStore: CampaignStore,
  ) {}

  async activateCharacter(
    characterId: CharacterId,
    request: ActivateCharacterRequest,
    context: ViewerContext,
  ): Promise<CharacterCommandResult> {
    const [character, ownedCharacters, startingLocations] = await Promise.all(
      [
        this.kb.getCharacter(characterId, context),
        this.kb.listCharacters(context.userId, context),
        this.kb.listStartingLocations(context),
      ],
    );

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

    const campaign = await this.campaignStore.getCampaign();
    if (!campaign) {
      throw new DomainError("NOT_FOUND", "Campaign was not found.");
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

  async createDraftCharacter(
    request: CreateCharacterRequest,
    context: ViewerContext,
  ): Promise<CharacterCommandResult> {
    const name = request.name?.trim();
    if (!name) {
      throw new DomainError(
        "INVALID_REQUEST",
        "Character name is required.",
      );
    }

    return this.kb.recordCharacterCreated(
      {
        name,
        gameData: request.gameData ?? {},
        ownerUserId: context.userId,
      },
      context,
    );
  }

  async retireCharacter(
    characterId: CharacterId,
    request: RetireCharacterRequest,
    context: ViewerContext,
  ): Promise<CharacterCommandResult> {
    const [character, knownLocations] = await Promise.all([
      this.kb.getCharacter(characterId, context),
      this.kb.listStartingLocations(context),
    ]);

    if (!character) {
      throw new DomainError("NOT_FOUND", "Character was not found.");
    }

    if (character.ownerUserId !== context.userId) {
      throw new DomainError(
        "FORBIDDEN",
        "Only the character owner may retire this character.",
      );
    }

    if (!RETIREMENT_ELIGIBLE_STATUSES.has(character.lifecycleStatus)) {
      throw new DomainError(
        "CHARACTER_NOT_ELIGIBLE",
        "Only active or missing characters may be retired.",
        { lifecycleStatus: character.lifecycleStatus },
      );
    }

    const location = knownLocations.find(
      (candidate) => candidate.id === request.locationId,
    );

    if (!location) {
      throw new DomainError(
        "INVALID_LOCATION",
        "The requested retirement location was not found.",
        { locationId: request.locationId },
      );
    }

    return this.kb.recordCharacterRetired(
      {
        characterId,
        locationId: request.locationId,
        narrative: request.narrative,
      },
      context,
    );
  }
}
