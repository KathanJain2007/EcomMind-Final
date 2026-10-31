/** A business location picked from Google Places (verified) or typed (unverified). */
export interface PlaceValue {
  text: string
  placeId: string | null
  sessionToken: string | null
  formattedAddress?: string | null
  lat?: number | null
  lng?: number | null
  city?: string | null
  state?: string | null
  country?: string | null
  verified: boolean
}

/** Whether a location value may be submitted, given the server's policy. */
export function locationProblem(v: PlaceValue, verificationRequired: boolean): string | undefined {
  if (v.text.trim().length < 2) return 'Enter your business location.'
  if (verificationRequired && !v.verified) return 'Pick your location from the suggestions list.'
  return undefined
}
