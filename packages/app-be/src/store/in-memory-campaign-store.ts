import type {
  CampaignId,
  CampaignMembership,
  CampaignView,
  User,
  UserId,
} from "../index.js";
import type {
  CampaignStore,
  CreateCampaignInput,
  CreateMembershipInput,
  CreateUserInput,
} from "./campaign-store.js";

export interface InMemoryCampaignStoreSeed {
  campaign?: CampaignView;
  users?: User[];
  memberships?: CampaignMembership[];
}

/**
 * Test/dev adapter for CampaignStore. Not intended to model persistence
 * internals - deterministic behavior only, until a real store exists.
 */
export class InMemoryCampaignStore implements CampaignStore {
  private campaign: CampaignView | null;
  private readonly users = new Map<UserId, User>();
  private readonly memberships = new Map<string, CampaignMembership>();
  private campaignSequence = 0;
  private userSequence = 0;

  constructor(seed: InMemoryCampaignStoreSeed = {}) {
    this.campaign = seed.campaign ? structuredClone(seed.campaign) : null;

    for (const user of seed.users ?? []) {
      this.users.set(user.id, structuredClone(user));
    }

    for (const membership of seed.memberships ?? []) {
      this.memberships.set(
        this.membershipKey(membership.userId, membership.campaignId),
        structuredClone(membership),
      );
    }
  }

  async createCampaign(input: CreateCampaignInput): Promise<CampaignView> {
    const id = `campaign-${++this.campaignSequence}` as CampaignId;
    this.campaign = { id, ...input };
    return structuredClone(this.campaign);
  }

  async getCampaign(): Promise<CampaignView | null> {
    return this.campaign ? structuredClone(this.campaign) : null;
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const id = `user-${++this.userSequence}` as UserId;
    const user: User = {
      id,
      email: input.email,
      createdAt: new Date().toISOString(),
    };
    this.users.set(id, user);
    return structuredClone(user);
  }

  async getUser(userId: UserId): Promise<User | null> {
    const user = this.users.get(userId);
    return user ? structuredClone(user) : null;
  }

  async createMembership(
    input: CreateMembershipInput,
  ): Promise<CampaignMembership> {
    const membership: CampaignMembership = {
      userId: input.userId,
      campaignId: input.campaignId,
      role: input.role,
      status: "ACTIVE",
    };
    this.memberships.set(
      this.membershipKey(input.userId, input.campaignId),
      membership,
    );
    return structuredClone(membership);
  }

  async getMembership(
    userId: UserId,
    campaignId: CampaignId,
  ): Promise<CampaignMembership | null> {
    const membership = this.memberships.get(
      this.membershipKey(userId, campaignId),
    );
    return membership ? structuredClone(membership) : null;
  }

  private membershipKey(userId: UserId, campaignId: CampaignId): string {
    return `${userId}:${campaignId}`;
  }
}
