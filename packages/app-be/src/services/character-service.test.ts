import { describe, expect, it } from "vitest";

import type {
  CampaignView,
  CharacterDetail,
  LocationSummary,
} from "../index.js";
import { DomainError } from "../domain/domain-error.js";
import { InMemoryKnowledgeBaseGateway } from "../kb/in-memory-knowledge-base-gateway.js";
import type { ViewerContext } from "../kb/knowledge-base-gateway.js";
import { CharacterService } from "./character-service.js";

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

describe("CharacterService", () => {
  it("activates an eligible draft character and records the KB write", async () => {
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

    expect(result.character.lifecycleStatus).toBe("ACTIVE");
    expect(result.character.currentLocation?.id).toBe(marinsHold.id);
    expect(result.character.countsAgainstRosterLimit).toBe(true);
    expect(result.eventIds).toHaveLength(1);
    expect(kb.activationWrites).toEqual([
      { characterId: "tordek", startingLocationId: marinsHold.id },
    ]);
  });

  it("rejects activation when the roster is full without writing to the KB", async () => {
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

    const result = service.activateCharacter(
      "tordek",
      { startingLocationId: marinsHold.id },
      context,
    );

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({
      code: "ROSTER_LIMIT_REACHED",
      details: { current: 3, maximum: 3 },
    });
    expect(kb.activationWrites).toHaveLength(0);
  });

  it("rejects activation of a character that does not exist", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [character("tordek", "DRAFT")],
      startingLocations: [marinsHold],
    });
    const service = new CharacterService(kb);

    const result = service.activateCharacter(
      "unknown-character",
      { startingLocationId: marinsHold.id },
      context,
    );

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(kb.activationWrites).toHaveLength(0);
  });

  it("rejects activation when the requester does not own the character", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [
        { ...character("tordek", "DRAFT"), ownerUserId: "someone-else" },
      ],
      startingLocations: [marinsHold],
    });
    const service = new CharacterService(kb);

    const result = service.activateCharacter(
      "tordek",
      { startingLocationId: marinsHold.id },
      context,
    );

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(kb.activationWrites).toHaveLength(0);
  });

  it("rejects activation of a character that is not a draft", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [character("tordek", "ACTIVE")],
      startingLocations: [marinsHold],
    });
    const service = new CharacterService(kb);

    const result = service.activateCharacter(
      "tordek",
      { startingLocationId: marinsHold.id },
      context,
    );

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({
      code: "CHARACTER_NOT_DRAFT",
      details: { lifecycleStatus: "ACTIVE" },
    });
    expect(kb.activationWrites).toHaveLength(0);
  });

  it("rejects activation at a location that does not allow it", async () => {
    const forbiddenLocation: LocationSummary = {
      id: "haunted-mire",
      name: "Haunted Mire",
      allowsCharacterActivation: false,
    };
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign,
      characters: [character("tordek", "DRAFT")],
      startingLocations: [marinsHold, forbiddenLocation],
    });
    const service = new CharacterService(kb);

    const result = service.activateCharacter(
      "tordek",
      { startingLocationId: forbiddenLocation.id },
      context,
    );

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({
      code: "INVALID_STARTING_LOCATION",
      details: { startingLocationId: forbiddenLocation.id },
    });
    expect(kb.activationWrites).toHaveLength(0);
  });

  it("rejects standard activation when the campaign requires GM approval", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({
      campaign: {
        ...campaign,
        characterRules: { ...campaign.characterRules, activationPolicy: "GM_APPROVAL" },
      },
      characters: [character("tordek", "DRAFT")],
      startingLocations: [marinsHold],
    });
    const service = new CharacterService(kb);

    const result = service.activateCharacter(
      "tordek",
      { startingLocationId: marinsHold.id },
      context,
    );

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({
      code: "DOMAIN_VALIDATION_FAILED",
      details: { activationPolicy: "GM_APPROVAL" },
    });
    expect(kb.activationWrites).toHaveLength(0);
  });
});

describe("CharacterService.createDraftCharacter", () => {
  it("creates a draft character owned by the requesting player", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({ campaign });
    const service = new CharacterService(kb);

    const result = await service.createDraftCharacter(
      { name: "Tordek", gameData: { class: "fighter" } },
      context,
    );

    expect(result.character.name).toBe("Tordek");
    expect(result.character.ownerUserId).toBe(context.userId);
    expect(result.character.lifecycleStatus).toBe("DRAFT");
    expect(result.character.currentLocation).toBeUndefined();
    expect(result.character.countsAgainstRosterLimit).toBe(false);
    expect(result.character.gameData).toEqual({ class: "fighter" });
    expect(result.eventIds).toHaveLength(1);
    expect(kb.creationWrites).toEqual([
      { name: "Tordek", gameData: { class: "fighter" }, ownerUserId: context.userId },
    ]);
  });

  it("rejects creation with a blank name without writing to the KB", async () => {
    const kb = new InMemoryKnowledgeBaseGateway({ campaign });
    const service = new CharacterService(kb);

    const result = service.createDraftCharacter({ name: "   " }, context);

    await expect(result).rejects.toBeInstanceOf(DomainError);
    await expect(result).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(kb.creationWrites).toHaveLength(0);
  });
});
