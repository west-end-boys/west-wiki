export type CampaignId = string;
export type UserId = string;
export type CharacterId = string;
export type LocationId = string;
export type CommitmentId = string;
export type EventId = string;

/** ISO local date in YYYY-MM-DD form. */
export type LocalDate = string;

export type CharacterLifecycleStatus =
  | "DRAFT"
  | "ACTIVE"
  | "MISSING"
  | "RETIRED"
  | "DEAD"
  | "ARCHIVED";

export type ActivationPolicy = "AUTOMATIC" | "GM_APPROVAL";

/** Viewer-safe current projection of campaign configuration. */
export interface CampaignView {
  id: CampaignId;
  name: string;
  gameSystem: string;
  timezone: string;
  characterRules: {
    maxRosterSize: number;
    activationPolicy: ActivationPolicy;
  };
  downtimeRules: {
    maxActivitiesBetweenExpeditions: number;
  };
}

/** Viewer-safe current projection of a location. */
export interface LocationSummary {
  id: LocationId;
  name: string;
  allowsCharacterActivation: boolean;
}

/** Viewer-safe current projection of a character. */
export interface CharacterSummary {
  id: CharacterId;
  name: string;
  lifecycleStatus: CharacterLifecycleStatus;
  currentLocation?: LocationSummary;
  countsAgainstRosterLimit: boolean;
}

export interface CharacterDetail extends CharacterSummary {
  campaignId: CampaignId;
  ownerUserId: UserId;
  gameSystem: string;
  gameData: Record<string, unknown>;
  createdAt: string;
  retiredAt?: string;
}

/** Command input: create a new draft character. */
export interface CreateCharacterRequest {
  name: string;
  gameData?: Record<string, unknown>;
}

/** Command input: propose player-managed character corrections/changes. */
export interface EditCharacterRequest {
  name?: string;
  gameData?: Record<string, unknown>;
}

export interface ActivateCharacterRequest {
  startingLocationId: LocationId;
}

export interface RetireCharacterRequest {
  locationId: LocationId;
  narrative?: string;
}

/**
 * Successful command results return the current projection after the accepted
 * event(s) have been applied, plus the event IDs produced by the command when available.
 */
export interface CharacterCommandResult {
  character: CharacterDetail;
  eventIds?: EventId[];
}

export type CreateCharacterResult = CharacterCommandResult;
export type EditCharacterResult = CharacterCommandResult;
export type ActivateCharacterResult = CharacterCommandResult;
export type RetireCharacterResult = CharacterCommandResult;

export type AvailabilityReason =
  | { code: "AVAILABLE" }
  | { code: "NOT_ACTIVE" }
  | { code: "MISSING" }
  | { code: "BLOCKING_COMMITMENT"; commitmentId: CommitmentId };

export interface CharacterAvailability {
  characterId: CharacterId;
  date: LocalDate;
  available: boolean;
  reasons: AvailabilityReason[];
}

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "ROSTER_LIMIT_REACHED"
  | "INVALID_STARTING_LOCATION"
  | "CHARACTER_NOT_DRAFT"
  | "CHARACTER_NOT_ELIGIBLE"
  | "COMMITMENT_CONFLICT"
  | "DOWNTIME_LIMIT_REACHED"
  | "DOMAIN_VALIDATION_FAILED"
  | "KB_WRITE_REJECTED"
  | "KB_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
