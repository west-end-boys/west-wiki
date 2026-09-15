import { hashPassword } from "./auth/password.js";
import { InMemoryEmailGateway } from "./email/in-memory-email-gateway.js";
import { createServer } from "./http/create-server.js";
import { InMemorySessionStore } from "./http/in-memory-session-store.js";
import { InMemoryKnowledgeBaseGateway } from "./kb/in-memory-knowledge-base-gateway.js";
import { InMemoryCampaignStore } from "./store/in-memory-campaign-store.js";
import type { CampaignView, CharacterDetail, LocationSummary } from "./index.js";

const campaign: CampaignView = {
  id: "western-reaches",
  name: "Western Reaches",
  gameSystem: "shadowdark",
  timezone: "America/Chicago",
  characterRules: {
    maxRosterSize: 3,
    activationPolicy: "AUTOMATIC",
  },
  downtimeRules: {
    maxActivitiesBetweenExpeditions: 1,
  },
};

const marinsHold: LocationSummary = {
  id: "marins-hold",
  name: "Marin's Hold",
  allowsCharacterActivation: true,
};

const campaignStore = new InMemoryCampaignStore({ campaign });
const emailGateway = new InMemoryEmailGateway();
const sessionStore = new InMemorySessionStore();

const GM_EMAIL = "gm@example.com";
const GM_PASSWORD = "gm-password";

const gmPasswordHash = await hashPassword(GM_PASSWORD);
const gmUser = await campaignStore.createUser({
  email: GM_EMAIL,
  passwordHash: gmPasswordHash,
});
await campaignStore.createMembership({
  userId: gmUser.id,
  campaignId: campaign.id,
  role: "ADMINISTRATOR",
});

const tordek: CharacterDetail = {
  id: "tordek",
  campaignId: campaign.id,
  ownerUserId: gmUser.id,
  name: "Tordek",
  gameSystem: "shadowdark",
  gameData: {},
  lifecycleStatus: "DRAFT",
  countsAgainstRosterLimit: false,
  createdAt: new Date().toISOString(),
};

const kb = new InMemoryKnowledgeBaseGateway({
  campaign,
  characters: [tordek],
  startingLocations: [marinsHold],
});

const app = createServer({ kb, campaignStore, emailGateway, sessionStore });
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`app-be listening on http://localhost:${port}`);
  console.log(`Seeded Administrator "${GM_EMAIL}" / "${GM_PASSWORD}", owning draft character "tordek".`);
  console.log(`Try:`);
  console.log(
    `  curl -X POST http://localhost:${port}/auth/login -H "Content-Type: application/json" -d '{"email":"${GM_EMAIL}","password":"${GM_PASSWORD}"}'`,
  );
  console.log(
    `  # then: curl -H "Authorization: Bearer <sessionId>" http://localhost:${port}/campaign`,
  );
});
