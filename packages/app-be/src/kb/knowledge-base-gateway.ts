import type {
  CampaignView,
  CharacterCommandResult,
  CharacterDetail,
  CharacterId,
  CharacterSummary,
  LocationId,
  LocationSummary,
  UserId,
} from "../index.js";

export type ViewerRole = "PLAYER" | "GM" | "ADMINISTRATOR";

export interface ViewerContext {
  userId: UserId;
  viewerRole: ViewerRole;
}

export type ActorContext = ViewerContext;

export interface ActivateCharacterEventInput {
  characterId: CharacterId;
  startingLocationId: LocationId;
}

export interface CreateCharacterEventInput {
  name: string;
  gameData: Record<string, unknown>;
  ownerUserId: UserId;
}

export interface RetireCharacterEventInput {
  characterId: CharacterId;
  locationId: LocationId;
  narrative?: string;
}

/**
 * Application-facing seam to the event-sourced knowledge base.
 *
 * Reads return viewer-safe projections. Writes request accepted domain events;
 * callers never mutate KB records directly.
 */
export interface KnowledgeBaseGateway {
  getCampaign(context: ViewerContext): Promise<CampaignView>;

  listCharacters(
    ownerUserId: UserId,
    context: ViewerContext,
  ): Promise<CharacterSummary[]>;

  getCharacter(
    characterId: CharacterId,
    context: ViewerContext,
  ): Promise<CharacterDetail | null>;

  listStartingLocations(context: ViewerContext): Promise<LocationSummary[]>;

  recordCharacterActivated(
    input: ActivateCharacterEventInput,
    context: ActorContext,
  ): Promise<CharacterCommandResult>;

  recordCharacterCreated(
    input: CreateCharacterEventInput,
    context: ActorContext,
  ): Promise<CharacterCommandResult>;

  recordCharacterRetired(
    input: RetireCharacterEventInput,
    context: ActorContext,
  ): Promise<CharacterCommandResult>;
}
