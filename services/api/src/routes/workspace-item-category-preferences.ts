import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  ItemCategoryPreferencesService,
  ItemCategoryPreferencesServiceError,
  parseFavoriteCategoryIdsPayload,
  parseFavoriteOrderPayload,
  parseFavoriteTemplateIdsPayload,
  parsePersonalDataBootstrapDismissedPayload,
  buildDefaultFavoriteOrder,
} from "../item-category-preferences/service.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type ItemCategoryPreferencesBody = {
  favorite_category_ids?: unknown;
  favorite_template_ids?: unknown;
  favorite_order?: unknown;
  personal_data_bootstrap_dismissed?: unknown;
};

function preferencesResponse(preferences: {
  favoriteCategoryIds: string[];
  favoriteTemplateIds: string[];
  favoriteOrder: string[];
  personalDataBootstrapDismissed: boolean;
}) {
  return {
    favorite_category_ids: preferences.favoriteCategoryIds,
    favorite_template_ids: preferences.favoriteTemplateIds,
    favorite_order: preferences.favoriteOrder,
    personal_data_bootstrap_dismissed: preferences.personalDataBootstrapDismissed,
  };
}

export function createWorkspaceItemCategoryPreferencesRoute(
  service: ItemCategoryPreferencesService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }

    const workspaceId = ctx.params.workspaceId?.trim() ?? "";
    if (!workspaceId) {
      json(ctx.res, 400, errorPayload("INVALID_WORKSPACE_ID", "workspace id is required", ctx.requestId));
      return;
    }

    try {
      if (ctx.req.method === "GET") {
        const preferences = await service.getPreferences(workspaceId, userId);
        json(ctx.res, 200, preferencesResponse(preferences));
        return;
      }

      // Authorize before body validation so foreign workspaces cannot be probed via 400s.
      await service.ensureWorkspaceAccess(workspaceId, userId);

      const body = await readJsonBody<ItemCategoryPreferencesBody>(ctx.req);
      const hasFavoritesUpdate = body.favorite_category_ids !== undefined;
      const hasDismissUpdate = body.personal_data_bootstrap_dismissed !== undefined;

      if (!hasFavoritesUpdate && !hasDismissUpdate) {
        json(
          ctx.res,
          400,
          errorPayload(
            "INVALID_PREFERENCES_BODY",
            "favorite_category_ids or personal_data_bootstrap_dismissed is required",
            ctx.requestId,
          ),
        );
        return;
      }

      let dismissed: boolean | undefined;
      if (hasDismissUpdate) {
        const parsed = parsePersonalDataBootstrapDismissedPayload(body.personal_data_bootstrap_dismissed);
        if (parsed === null) {
          json(
            ctx.res,
            400,
            errorPayload(
              "INVALID_PERSONAL_DATA_BOOTSTRAP_DISMISSED",
              "personal_data_bootstrap_dismissed must be a boolean",
              ctx.requestId,
            ),
          );
          return;
        }
        dismissed = parsed;
      }

      if (!hasFavoritesUpdate) {
        const updated = await service.setPersonalDataBootstrapDismissed(
          workspaceId,
          userId,
          dismissed === true,
        );
        json(ctx.res, 200, preferencesResponse(updated));
        return;
      }

      const favoriteCategoryIds = parseFavoriteCategoryIdsPayload(body.favorite_category_ids);
      if (favoriteCategoryIds === null) {
        json(
          ctx.res,
          400,
          errorPayload("INVALID_FAVORITE_CATEGORY_IDS", "favorite_category_ids must be a string array", ctx.requestId),
        );
        return;
      }
      const favoriteTemplateIds = parseFavoriteTemplateIdsPayload(body.favorite_template_ids);
      if (favoriteTemplateIds === null) {
        json(
          ctx.res,
          400,
          errorPayload("INVALID_FAVORITE_TEMPLATE_IDS", "favorite_template_ids must be a string array", ctx.requestId),
        );
        return;
      }
      const favoriteOrder =
        body.favorite_order === undefined
          ? buildDefaultFavoriteOrder(favoriteCategoryIds, favoriteTemplateIds)
          : parseFavoriteOrderPayload(body.favorite_order);
      if (favoriteOrder === null) {
        json(
          ctx.res,
          400,
          errorPayload("INVALID_FAVORITE_ORDER", "favorite_order must be a string array", ctx.requestId),
        );
        return;
      }

      const updated = await service.updatePreferences(workspaceId, userId, {
        favoriteCategoryIds,
        favoriteTemplateIds,
        favoriteOrder,
        personalDataBootstrapDismissed: dismissed,
      });
      json(ctx.res, 200, preferencesResponse(updated));
    } catch (error) {
      handleError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof ItemCategoryPreferencesServiceError) {
    json(res, error.statusCode, errorPayload(error.code, error.message, requestId));
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}
