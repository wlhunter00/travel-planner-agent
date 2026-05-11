/**
 * Build a Places photo proxy URL usable from server tools (`searchPlaces`) and persisted to trip JSON.
 */
export function placesPhotoProxyUrl(photoResourceName: string, maxHeightPx = 400): string {
  return `/api/places/photo?name=${encodeURIComponent(photoResourceName)}&w=${encodeURIComponent(
    String(maxHeightPx),
  )}`;
}
