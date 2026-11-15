
/**
 * A partner building a store with no owner yet (approved mockup screen 7): one line above every console page. Hand over
 * lives in the partner workspace's Clients, where it asks for the passkey again (T1b; partner sign-in mockup screen 17):
 * this line links there. Not shown in a support visit.
 */
export function BuildingBanner({ shop, tenantId, inviteEmail }: { shop: string; tenantId: string; inviteEmail: string | null }) {
  return (
    <div role="status" className="sticky top-0 z-40 flex h-[var(--shell-top)] items-center gap-3 border-b border-border bg-info px-4 text-sm text-info-text md:px-5 print:hidden">
      <span className="min-w-0 truncate font-semibold">Building for {shop}</span>
      <span className="hidden min-w-0 truncate md:inline">{inviteEmail ? `Invite sent to ${inviteEmail}` : 'No owner yet'}</span>
      <span className="ml-auto" />
      {/* A full page load: the workspace may ask for a passkey, which the console's own page policy refuses. */}
      <a href={`/partner?handover=${tenantId}`} className="inline-flex min-h-6 shrink-0 items-center font-semibold underline">
        {inviteEmail ? 'Send again' : 'Hand over'}
      </a>
    </div>
  )
}
