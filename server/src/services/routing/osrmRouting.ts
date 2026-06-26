const OSRM_BASE = 'https://router.project-osrm.org/route/v1';

export interface OsrmRouteLegResult {
  coords: [number, number][]; // lat,lng
  distanceM: number;
  durationS: number;
}

/** Single leg OSRM GeoJSON geometry. */
export async function osrmLegRoute(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  profile: 'walking' | 'driving',
  { signal }: { signal?: AbortSignal } = {},
): Promise<OsrmRouteLegResult> {
  const coords = `${fromLng},${fromLat};${toLng},${toLat}`;
  const url = `${OSRM_BASE}/${profile}/${coords}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json() as { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
  if (data.code !== 'Ok' || !data.routes?.[0]?.geometry?.coordinates?.length)
    throw new Error('No OSRM route');
  const rt = data.routes[0];
  const coordinates: [number, number][] = rt.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return {
    coords: coordinates,
    distanceM: rt.distance,
    durationS: rt.duration,
  };
}
