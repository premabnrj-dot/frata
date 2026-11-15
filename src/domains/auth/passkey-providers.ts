// =============================================================================
// FILE: src/domains/auth/passkey-providers.ts — which password manager holds a passkey, from the AAGUID its
// authenticator reports at creation, so a passkey is named the way people know it ("Google Password Manager", not a
// device; partner sign-in research lesson 4). Source: the community list passkeydeveloper/passkey-authenticator-aaguids
// (checked 2026-11-15). An unknown or zeroed AAGUID (some browsers zero it) names nothing: the caller falls back to the
// device ("Chrome on Android").
// =============================================================================

const PROVIDERS: Record<string, string> = {
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'Windows Hello',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'Windows Hello',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  '53414d53-554e-4700-0000-000000000000': 'Samsung Pass',
  '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
}

export const passkeyProvider = (aaguid: string | null | undefined): string | null => (aaguid ? PROVIDERS[aaguid.toLowerCase()] ?? null : null)
