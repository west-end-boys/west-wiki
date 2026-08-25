import type {
  CampaignView,
  CharacterCommandResult,
  CharacterDetail,
  CharacterId,
  CharacterSummary,
  EventId,
  LocationSummary,
  UserId,
} from "../index";
import type {
  ActivateCharacterEventInput,
  KnowledgeBaseGateway,
  ViewerContext,
} from "./knowledge-base-gateway";

export interface InMemoryKnowledgeBaseSeed {
  campaign: CampaignView;
  characters?: CharacterDetail[];
  startingLocations?: LocationSummary[];
}

/**
 * Test adapter that mimics the KB contract using in-memory projections.
 * It is not intended to model KB internals; it only provides deterministic
 * behavior for application-service tests until the real KB adapter exists.
 */
export class InMemoryKnowledgeBaseGateway implements KnowledgeBaseGateway {
  private readonly campaign: CampaignView;
  private readonly characters = new Map<CharacterId, CharacterDetail>();
  private readonly startingLocations: LocationSummary[];
  private eventSequence = 0;

  readonly activationWrites: ActivateCharacterEventInput[] = [];

  constructor(seed: InMemoryKnowledgeBaseSeed) {
    this.campaign = structuredClone(seed.campaign);
    this.startingLocations = structuredClone(seed.startingLocations ?? []);

    for (const character of seed.characters ?? []) {
      this.characters.set(character.id, structuredClone(character));
    }
  }

  async getCampaign(_context: ViewerContext): Promise<CampaignView> {
    return structuredClone(this.campaign);
  }

  async listCharacters(
    ownerUserId: UserId,
    _context: ViewerContext,
  ): Promise<CharacterSummary[]> {
    return [...this.characters.values()]
      .filter((character) => character.ownerUserId === ownerUserId)
      .map((character) => this.toSummary(character));
  }

  async getCharacter(
    characterId: CharacterId,
    _context: ViewerContext,
  ): Promise<CharacterDetail | null> {
    const character = this.characters.get(characterId);
    return character ? structuredClone(character) : null;
  }

  async listStartingLocations(
    _context: ViewerContext,
  ): Promise<LocationSummary[]> {
    return structuredClone(this.startingLocations);
  }

  async recordCharacterActivated(
    input: ActivateCharacterEventInput,
    _context: ViewerContext,
  ): Promise<CharacterCommandResult> {
    const character = this.characters.get(input.characterId);
    if (!character) {
      throw new Error(`Unknown character ${input.characterId}`);
    }

    const location = this.startingLocations.find(
      (candidate) => candidate.id === input.startingLocationId,
    );
    if (!location) {
      throw new Error(`Unknown starting location ${input.startingLocationId}`);
    }

    this.activationWrites.push(structuredClone(input));

    const updated: CharacterDetail = {
      ...character,
      lifecycleStatus: "ACTIVE",
      currentLocation: structuredClone(location),
      countsAgainstRosterLimit: true,
    };
    this.characters.set(updated.id, updated);

    const eventId = `event-${++this.eventSequence}` as EventId;
    return {
      character: structuredClone(updated),
      eventIds: [eventId],
    };
  }

  private toSummary(character: CharacterDetail): CharacterSummary {
    return {
      id: character.id,
      name: character.name,
      lifecycleStatus: character.lifecycleStatus,
      currentLocation: character.currentLocation
        ? structuredClone(character.currentLocation)
        : undefined,
      countsAgainstRosterLimit: character.countsAgainstRosterLimit,
    };
  }
}
