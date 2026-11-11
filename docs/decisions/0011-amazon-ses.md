# ADR-0011: Amazon SES for every email, reached without a stored key

Status: accepted · 2026-11-11 (owner: "Amazon SES from the start", 2026-11-08; "supabase send email hook", 2026-11-11)
· Plan `docs/plans/2026-11-11-email.md` · Facts `frata-integrations` § Email (rechecked 2026-11-11)

This is the decision record ADR-0005 asks for before an AWS service is used.

## Decision
- **Service and why:** Amazon SES v2 in `ap-south-1` sends every email — shops' order emails (from `frratamail.app`),
  Frrata's notices (from Frrata's own domain) and the sign-in email. One SES **tenant per shop** gives each shop its
  own reputation and pause; ₹0.014 an email; Mumbai beside bom1 and Supabase.
- **No stored AWS key.** Vercel OIDC federation: a function exchanges its request-scoped Vercel token for short-lived
  credentials (STS `AssumeRoleWithWebIdentity`) on one IAM role that trusts only the `frata` project's **production**
  environment, with a policy of `ses:SendEmail` on the two identities and their configuration sets plus
  `ses:CreateTenant` / `ses:CreateTenantResourceAssociation`. This replaces, for SES, ADR-0005's "one IAM user per
  service, its key in Vercel": there is no user and no key. Previews cannot assume the role.
- **The sign-in email** goes through Supabase's Send Email Hook to our route, then through SES the same way — not
  Supabase's SMTP setting, which would need a long-lived IAM-user SMTP key stored in Supabase.
- **No AWS SDK.** SES v2 is a JSON REST API; requests are signed with SigV4 (`aws4fetch`) and sent with
  `fetchWithTimeout`, so check:fetch holds and e2e can point at a fake. Production endpoints are hard-coded.
- **Events** come back through SNS (SignatureVersion 2), verified field by field as SNS documents it, stored
  trimmed and routed by our own message id only (ADR-0006).
- **Data in AWS:** the message in flight and SES's own logs; no shopper data is stored in AWS by us. SES's
  account-level suppression list is off; ours, per shop, is the only one.

## Why not
- **Resend / Postmark:** no India region or one shared reputation (`frata-integrations` § Email).
- **The AWS SDK:** ~1 MB of clients to sign one POST, its own HTTP stack outside `fetchWithTimeout`.
- **Supabase SMTP:** the one long-lived AWS key that would remain.

## Revisit when
SES tenants stop isolating reputation, or a second AWS service needs the same role (give it its own role).
