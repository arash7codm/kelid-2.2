import { resolveBlobUrl } from '../db';

export const DEFAULT_TARH_HADI_MAP_URL = '/kelarabad_tarh_hadi_map.jpg';
export const DEFAULT_TARH_HADI_LEGEND_URL = '/kelarabad_legend.png';

export interface PlanAssetConfigLike {
  customMapBlobRef?: string;
  customLegendBlobRef?: string;
}

/**
 * Single source of truth (planAssets) for the Kelarabad Master Plan image and Legend image.
 * Resolves custom uploaded blobs from IndexedDB first, falling back to the canonical asset URLs.
 * Never generates or embeds any synthetic or substitute map.
 */
export function resolvePlanMapAssetUrl(config?: PlanAssetConfigLike | null): string {
  if (config?.customMapBlobRef) {
    const resolved = resolveBlobUrl(config.customMapBlobRef);
    if (resolved) return resolved;
  }
  return DEFAULT_TARH_HADI_MAP_URL;
}

export function resolvePlanLegendAssetUrl(config?: PlanAssetConfigLike | null): string {
  if (config?.customLegendBlobRef) {
    const resolved = resolveBlobUrl(config.customLegendBlobRef);
    if (resolved) return resolved;
  }
  return DEFAULT_TARH_HADI_LEGEND_URL;
}

export function hasCustomPlanMapAsset(config?: PlanAssetConfigLike | null): boolean {
  if (!config?.customMapBlobRef) return false;
  return Boolean(resolveBlobUrl(config.customMapBlobRef));
}

export function hasCustomPlanLegendAsset(config?: PlanAssetConfigLike | null): boolean {
  if (!config?.customLegendBlobRef) return false;
  return Boolean(resolveBlobUrl(config.customLegendBlobRef));
}
