import type {
  CharacterCommandResult,
  CharacterDetail,
  CharacterId,
  CharacterSummary,
  LocationId,
  LocationSummary,
  MembershipRole,
  UserId,
} from "../index.js";

/** A viewer with no campaign membership (or no session). Read-only. */
export interface AnonymousViewerContext {
  viewerRole: "ANONYMOUS";
}

/** An authenticated, active campaign member. */
export interface MemberViewerContext {
  userId: UserId;
  viewerRole: MembershipRole;
}

/** Who a KB read is resolved for. Every read takes one. */
export type ViewerContext = AnonymousViewerContext | MemberViewerContext;

/** Who is asserting. Writes always come from a member; anonymous viewers cannot write. */
export type ActorContext = MemberViewerContext;

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
  listCharacters(
    ownerUserId: UserId,
    context: ViewerContext,
  ): Promise<CharacterSummary[]>;

  getCharacter(
    characterId: CharacterId,
    context: ViewerContext,
  ): Promise<CharacterDetail | null>;

  listLocations(context: ViewerContext): Promise<LocationSummary[]>;

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
