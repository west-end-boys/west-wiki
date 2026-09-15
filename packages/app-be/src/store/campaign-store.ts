import type {
  CampaignId,
  CampaignMembership,
  CampaignView,
  MembershipRole,
  MembershipStatus,
  User,
  UserId,
} from "../index.js";

export interface CreateCampaignInput {
  name: string;
  gameSystem: string;
  timezone: string;
  characterRules: CampaignView["characterRules"];
  downtimeRules: CampaignView["downtimeRules"];
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
}

export interface CreateMembershipInput {
  userId: UserId;
  campaignId: CampaignId;
  role: MembershipRole;
}

/**
 * Application-owned store for Campaign/User/CampaignMembership, per
 * doc/adr/002-application-owned-identity-and-scheduling-state.md. The KB
 * has no visibility into this data.
 *
 * getCampaign() is zero-argument: this app has always assumed a single
 * campaign per deployment (doc/contract/API.md's GET /campaign is
 * singular; doc/app/REQUIREMENTS.md rules out public multi-tenant
 * hosting for the initial release).
 */
export interface CampaignStore {
  createCampaign(input: CreateCampaignInput): Promise<CampaignView>;
  getCampaign(): Promise<CampaignView | null>;

  createUser(input: CreateUserInput): Promise<User>;
  getUser(userId: UserId): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;

  /** Never exposed on the public User projection - AuthService-only. */
  getPasswordHash(userId: UserId): Promise<string | null>;

  createMembership(input: CreateMembershipInput): Promise<CampaignMembership>;
  getMembership(
    userId: UserId,
    campaignId: CampaignId,
  ): Promise<CampaignMembership | null>;
  setMembershipStatus(
    userId: UserId,
    campaignId: CampaignId,
    status: MembershipStatus,
  ): Promise<CampaignMembership>;
}
