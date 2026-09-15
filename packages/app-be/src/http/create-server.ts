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
} from "../index.js";
import { DomainError } from "../domain/domain-error.js";
import type { EmailGateway } from "../email/email-gateway.js";
import type { KnowledgeBaseGateway } from "../kb/knowledge-base-gateway.js";
import { AuthService } from "../services/auth-service.js";
import { CharacterService } from "../services/character-service.js";
import type { CampaignStore } from "../store/campaign-store.js";
import { createAuthMiddleware, requireViewerContext } from "./auth-middleware.js";
import { mapDomainErrorToStatus } from "./error-mapping.js";
import type { SessionStore } from "./session-store.js";

export interface CreateServerDependencies {
  kb: KnowledgeBaseGateway;
  campaignStore: CampaignStore;
  emailGateway: EmailGateway;
  sessionStore: SessionStore;
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
  const { kb, campaignStore, emailGateway, sessionStore } = deps;
  const characterService = new CharacterService(kb, campaignStore);
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
