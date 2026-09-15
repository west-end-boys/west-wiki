import type {
  CreateAccountRequest,
  CreateAccountResult,
  LoginRequest,
  LoginResult,
} from "../index.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { DomainError } from "../domain/domain-error.js";
import { hasAtLeast } from "../domain/role.js";
import type { EmailGateway } from "../email/email-gateway.js";
import type { SessionStore } from "../http/session-store.js";
import type { ViewerContext } from "../kb/knowledge-base-gateway.js";
import type { CampaignStore } from "../store/campaign-store.js";

export class AuthService {
  constructor(
    private readonly campaignStore: CampaignStore,
    private readonly emailGateway: EmailGateway,
    private readonly sessionStore: SessionStore,
  ) {}

  /** GM/Admin-assisted account creation - ADR 005's MVP interim path. */
  async createAccount(
    request: CreateAccountRequest,
    context: ViewerContext,
  ): Promise<CreateAccountResult> {
    const campaign = await this.campaignStore.getCampaign();
    if (!campaign) {
      throw new DomainError("NOT_FOUND", "Campaign was not found.");
    }

    const callerMembership = await this.campaignStore.getMembership(
      context.userId,
      campaign.id,
    );
    if (
      !callerMembership ||
      !hasAtLeast(callerMembership.role, "ADMINISTRATOR")
    ) {
      throw new DomainError(
        "FORBIDDEN",
        "Only an Administrator may create accounts.",
      );
    }

    const existing = await this.campaignStore.getUserByEmail(request.email);
    if (existing) {
      throw new DomainError(
        "INVALID_REQUEST",
        "An account with this email already exists.",
        { email: request.email },
      );
    }

    const passwordHash = await hashPassword(request.password);
    const user = await this.campaignStore.createUser({
      email: request.email,
      passwordHash,
    });
    const membership = await this.campaignStore.createMembership({
      userId: user.id,
      campaignId: campaign.id,
      role: request.role,
    });

    await this.emailGateway.send({
      to: user.email,
      subject: `Welcome to ${campaign.name}`,
      body: "Your account has been created.",
    });

    return { user, membership };
  }

  async login(request: LoginRequest): Promise<LoginResult> {
    const user = await this.campaignStore.getUserByEmail(request.email);
    if (!user) {
      throw new DomainError(
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
      );
    }

    const passwordHash = await this.campaignStore.getPasswordHash(user.id);
    const passwordMatches =
      passwordHash !== null &&
      (await verifyPassword(request.password, passwordHash));

    if (!passwordMatches) {
      throw new DomainError(
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
      );
    }

    return {
      sessionId: await this.sessionStore.createSession(user.id),
      userId: user.id,
    };
  }
}
