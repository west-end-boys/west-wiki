import assert from "node:assert/strict";
import test from "node:test";

import type {
  CampaignView,
  CharacterDetail,
  LocationSummary,
} from "../index";
import { DomainError } from "../domain/domain-error";
import { InMemoryKnowledgeBaseGateway } from "../kb/in-memory-knowledge-base-gateway";
import type { ViewerContext } from "../kb/knowledge-base-gateway";
import { CharacterService } from "./character-service";

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

const context: ViewerContext = {
  userId: "player-1",
  viewerRole: "PLAYER",
};

function character(
  id: string,
  lifecycleStatus: CharacterDetail["lifecycleStatus"],
): CharacterDetail {
  return {
    id,
    campaignId: campaign.id,
    ownerUserId: context.userId,
    name: id,
    gameSystem: "shadowdark",
    gameData: {},
    lifecycleStatus,
    currentLocation: lifecycleStatus === "DRAFT" ? undefined : marinsHold,
    countsAgainstRosterLimit:
      lifecycleStatus === "ACTIVE" || lifecycleStatus === "MISSING",
    createdAt: "2026-08-24T00:00:00Z",
  };
}

test("activates an eligible draft character and records the KB write", async () => {
  const kb = new InMemoryKnowledgeBaseGateway({
    campaign,
    characters: [character("tordek", "DRAFT")],
    startingLocations: [marinsHold],
  });
  const service = new CharacterService(kb);

  const result = await service.activateCharacter(
    "tordek",
    { startingLocationId: marinsHold.id },
    context,
  );

  assert.equal(result.character.lifecycleStatus, "ACTIVE");
  assert.equal(result.character.currentLocation?.id, marinsHold.id);
  assert.equal(result.character.countsAgainstRosterLimit, true);
  assert.equal(result.eventIds?.length, 1);
  assert.deepEqual(kb.activationWrites, [
    { characterId: "tordek", startingLocationId: marinsHold.id },
  ]);
});

test("rejects activation when the roster is full without writing to the KB", async () => {
  const kb = new InMemoryKnowledgeBaseGateway({
    campaign,
    characters: [
      character("tordek", "DRAFT"),
      character("brenna", "ACTIVE"),
      character("osric", "ACTIVE"),
      character("kell", "MISSING"),
    ],
    startingLocations: [marinsHold],
  });
  const service = new CharacterService(kb);

  await assert.rejects(
    service.activateCharacter(
      "tordek",
      { startingLocationId: marinsHold.id },
      context,
    ),
    (error: unknown) => {
      assert.ok(error instanceof DomainError);
      assert.equal(error.code, "ROSTER_LIMIT_REACHED");
      assert.deepEqual(error.details, { current: 3, maximum: 3 });
      return true;
    },
  );

  assert.equal(kb.activationWrites.length, 0);
});
