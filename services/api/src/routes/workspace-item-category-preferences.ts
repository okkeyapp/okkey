import type { IncomingMessage } from "node:http";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  ItemCategoryPreferencesService,
  ItemCategoryPreferencesServiceError,
  parseFavoriteCategoryIdsPayload,
  parseFavoriteOrderPayload,
  parseFavoriteTemplateIdsPayload,
  buildDefaultFavoriteOrder,
} from "../item-category-preferences/service.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type ItemCategoryPreferencesBody = {
  favorite_category_ids?: unknown;
  favorite_template_ids?: unknown;
  favorite_order?: unknown;
};

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
        json(ctx.res, 200, {
          favorite_category_ids: preferences.favoriteCategoryIds,
          favorite_template_ids: preferences.favoriteTemplateIds,
          favorite_order: preferences.favoriteOrder,
        });
        return;
      }

      const body = await readJsonBody<ItemCategoryPreferencesBody>(ctx.req);
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
      });
      json(ctx.res, 200, {
        favorite_category_ids: updated.favoriteCategoryIds,
        favorite_template_ids: updated.favoriteTemplateIds,
        favorite_order: updated.favoriteOrder,
      });
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
