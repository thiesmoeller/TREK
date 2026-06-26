type PlaceLike = {
  name: string
  lat?: number | null
  lng?: number | null
  google_place_id?: string | null
  google_ftid?: string | null
}
const GOOGLE_FTID_RE = /^0x[0-9a-f]+:0x[0-9a-f]+$/i

export function getGoogleMapsUrlForPlace(place: PlaceLike | null | undefined, detailsUrl?: string | null): string | null {
  if (!place) return null
  const ftid = place.google_ftid?.trim()
  if (ftid && GOOGLE_FTID_RE.test(ftid)) {
    return `https://www.google.com/maps/place/?q=${encodeURIComponent(place.name)}&ftid=${ftid}`
  }
  const placeId = place.google_place_id?.trim()
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${encodeURIComponent(placeId)}`
  }
  if (detailsUrl) return detailsUrl
  if (place.lat == null || place.lng == null) return null
  return `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`
}
