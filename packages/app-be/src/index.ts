export type CampaignId = string;
export type UserId = string;
export type CharacterId = string;
export type LocationId = string;
export type CommitmentId = string;

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

export interface LocationSummary {
  id: LocationId;
  name: string;
  allowsCharacterActivation: boolean;
}

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

export interface CreateCharacterRequest {
  name: string;
  gameData?: Record<string, unknown>;
}

export interface UpdateCharacterRequest {
  name?: string;
  gameData?: Record<string, unknown>;
}

export interface ActivateCharacterRequest {
  startingLocationId: LocationId;
}

export interface ActivateCharacterResult {
  character: CharacterDetail;
}

export interface RetireCharacterRequest {
  locationId: LocationId;
  narrative?: string;
}

export interface RetireCharacterResult {
  character: CharacterDetail;
}

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
  | "INTERNAL_ERROR";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
