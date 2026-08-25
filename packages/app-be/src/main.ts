import { createServer } from "./http/create-server.js";
import { InMemoryKnowledgeBaseGateway } from "./kb/in-memory-knowledge-base-gateway.js";
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

const tordek: CharacterDetail = {
  id: "tordek",
  campaignId: campaign.id,
  ownerUserId: "player-1",
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

const app = createServer(kb);
const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`app-be listening on http://localhost:${port}`);
  console.log(`Seeded draft character "tordek" owned by "player-1".`);
  console.log(
    `Try: curl -H "x-user-id: player-1" http://localhost:${port}/campaign`,
  );
});
