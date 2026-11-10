import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import type {
  ActivateCharacterRequest,
  ApiError,
  CreateAccountRequest,
  CreateCharacterRequest,
  LoginRequest,
  RetireCharacterRequest,
  ScheduleDowntimeRequest,
} from "../index.js";
import { DomainError } from "../domain/domain-error.js";
import type { EmailGateway } from "../email/email-gateway.js";
import type { KnowledgeBaseGateway } from "../kb/knowledge-base-gateway.js";
import { AuthService } from "../services/auth-service.js";
import { AvailabilityService } from "../services/availability-service.js";
import { CharacterService } from "../services/character-service.js";
import { CommitmentService } from "../services/commitment-service.js";
import { DowntimeService } from "../services/downtime-service.js";
import type { CampaignStore } from "../store/campaign-store.js";
import type { CharacterCommitmentStore } from "../store/character-commitment-store.js";
import { createAuthMiddleware, requireViewerContext } from "./auth-middleware.js";
import { mapDomainErrorToStatus } from "./error-mapping.js";
import type { SessionStore } from "./session-store.js";

export interface CreateServerDependencies {
  kb: KnowledgeBaseGateway;
  campaignStore: CampaignStore;
  emailGateway: EmailGateway;
  sessionStore: SessionStore;
  commitmentStore: CharacterCommitmentStore;
}

function requireCharacterId(req: Request, res: Response): string | undefined {
  const { characterId } = req.params;
  if (typeof characterId !== "string" || characterId.length === 0) {
    res.status(400).json({
      code: "INVALID_REQUEST",
      message: "Missing characterId route parameter.",
    } satisfies ApiError);
    return undefined;
  }
  return characterId;
}

export function createServer(deps: CreateServerDependencies): Express {
  const { kb, campaignStore, emailGateway, sessionStore, commitmentStore } = deps;
  const characterService = new CharacterService(kb, campaignStore);
  const commitmentService = new CommitmentService(commitmentStore);
  const availabilityService = new AvailabilityService(kb, commitmentService);
  const downtimeService = new DowntimeService(kb, commitmentService);
  const authService = new AuthService(campaignStore, emailGateway, sessionStore);
  const authMiddleware = createAuthMiddleware(sessionStore, campaignStore);
  const app = express();

  app.use(express.json());

  // Public: no session exists yet at the point of logging in.
  app.post("/auth/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body as LoginRequest);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use(authMiddleware);

  app.post("/accounts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.createAccount(
        req.body as CreateAccountRequest,
        requireViewerContext(req),
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/campaign", async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireViewerContext(req);
      const campaign = await campaignStore.getCampaign();
      if (!campaign) {
        res.status(404).json({
          code: "NOT_FOUND",
          message: "Campaign was not found.",
        } satisfies ApiError);
        return;
      }
      res.status(200).json(campaign);
    } catch (error) {
      next(error);
    }
  });

  app.get("/locations", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = requireViewerContext(req);
      const startingLocationOnly = req.query.startingLocation === "true";
      const locations = startingLocationOnly
        ? await kb.listStartingLocations(context)
        : await kb.listLocations(context);
      res.status(200).json(locations);
    } catch (error) {
      next(error);
    }
  });

  app.get("/characters", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = requireViewerContext(req);
      const characters = await kb.listCharacters(context.userId, context);
      res.status(200).json(characters);
    } catch (error) {
      next(error);
    }
  });

  app.get(
    "/characters/:characterId/availability",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const characterId = requireCharacterId(req, res);
        if (!characterId) return;

        const date = req.query.date;
        if (typeof date !== "string" || date.length === 0) {
          res.status(400).json({
            code: "INVALID_REQUEST",
            message: "A date query parameter in YYYY-MM-DD format is required.",
          } satisfies ApiError);
          return;
        }

        const result = await availabilityService.getCharacterAvailability(
          characterId,
          date,
          requireViewerContext(req),
        );
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.get(
    "/characters/:characterId",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const characterId = requireCharacterId(req, res);
        if (!characterId) return;

        const context = requireViewerContext(req);
        const character = await kb.getCharacter(characterId, context);
        if (!character) {
          res.status(404).json({
            code: "NOT_FOUND",
            message: "Character was not found.",
          } satisfies ApiError);
          return;
        }

        res.status(200).json(character);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post("/characters", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await characterService.createDraftCharacter(
        req.body as CreateCharacterRequest,
        requireViewerContext(req),
      );
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/characters/:characterId/downtime",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const characterId = requireCharacterId(req, res);
        if (!characterId) return;

        const result = await downtimeService.scheduleDowntime(
          characterId,
          req.body as ScheduleDowntimeRequest,
          requireViewerContext(req),
        );
        res.status(201).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/characters/:characterId/commitments/:commitmentId/cancel",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const characterId = requireCharacterId(req, res);
        if (!characterId) return;

        const { commitmentId } = req.params;
        if (typeof commitmentId !== "string" || commitmentId.length === 0) {
          res.status(400).json({
            code: "INVALID_REQUEST",
            message: "Missing commitmentId route parameter.",
          } satisfies ApiError);
          return;
        }

        const result = await downtimeService.cancelScheduledDowntime(
          characterId,
          commitmentId,
          requireViewerContext(req),
        );
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/characters/:characterId/activate",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const characterId = requireCharacterId(req, res);
        if (!characterId) return;

        const result = await characterService.activateCharacter(
          characterId,
          req.body as ActivateCharacterRequest,
          requireViewerContext(req),
        );
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/characters/:characterId/retire",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const characterId = requireCharacterId(req, res);
        if (!characterId) return;

        const result = await characterService.retireCharacter(
          characterId,
          req.body as RetireCharacterRequest,
          requireViewerContext(req),
        );
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof DomainError) {
        const body: ApiError = {
          code: error.code,
          message: error.message,
          details: error.details,
        };
        res.status(mapDomainErrorToStatus(error.code)).json(body);
        return;
      }

      const body: ApiError = {
        code: "INTERNAL_ERROR",
        message: "Unexpected server error.",
      };
      res.status(500).json(body);
    },
  );

  return app;
}
