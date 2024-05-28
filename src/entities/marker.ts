import type { Marker, MarkerType } from "../schema";

export function serializeMarker(marker: Marker) {
  return {
    last_read_id: marker.lastReadId,
    version: marker.version,
    updated_at: marker.updated.toISOString(),
  };
}

export function serializeMarkers(markers: Marker[]) {
  const result: Partial<
    Record<MarkerType, ReturnType<typeof serializeMarker>>
  > = {};
  for (const marker of markers) {
    result[marker.type] = serializeMarker(marker);
  }
  return result;
}
