# frata-integrations — Email

Part of `frata-integrations` (SKILL.md holds the dating rule and the rules for every connector). Each fact keeps its checked date and tag; older than 90 days or [S]/[U] before you build on it → `integration-researcher`. Moved here unchanged (practices plan G4).

## Contents

- Email — checked 2026-11-08; SES API, events, SNS, OIDC, Supabase rechecked 2026-11-11

## Email — checked 2026-11-08; SES API, events, SNS, OIDC, Supabase rechecked 2026-11-11 (research `docs/research/2026-11-08-email-and-notifications.md`)

- **Amazon SES (owner: from the start).** ap-south-1 has API, SMTP `email-smtp.ap-south-1.amazonaws.com` and feedback
  endpoints; sandbox 200 a day, 1 a second until production access [V-undated]. Price: à la carte $0.10/1,000; new
  accounts start on Essentials $0.16/1,000 from 21 Jul 2026 (switchable) [V-undated, aws.amazon.com/ses/pricing].
- **SES tenants:** $0.005/tenant/month + $0.005/1,000; per-tenant reputation and auto-pause (Standard/Strict/None), up
  to 10,000; "combined sending activity still affects your overall account reputation" [V-undated, dg/tenants].
  Suppression order "Configuration Set > Tenant > Account" [V, AWS blog 2026-07-07].
- **SES domains:** `CreateEmailIdentity` → 3 DKIM CNAMEs; custom MAIL FROM = MX feedback-smtp.<region> + SPF TXT;
  events via a configuration set's event destination (SNS or EventBridge default bus) [V-undated, 2026-11-11].
- **SendEmail (v2), checked 2026-11-11** [V-undated, APIReference-V2 SendEmail/Message/MessageHeader/MessageTag, dg/header-fields]:
  `TenantName` + `ConfigurationSetName` (both associated with the tenant, or the send fails); `Content.Simple` {Subject,
  Body.Html/Text, Attachments, Headers ≤ 15}; header name ≤ 126, value ≤ 995, together ≤ 996, printable ASCII.
  Simple/Template refuse BCC, CC, Content-Disposition, Content-Type, Date, From, Message-ID, MIME-Version, Reply-To,
  Return-Path, Subject, To as custom headers; `List-Unsubscribe` + `List-Unsubscribe-Post` allowed (never send
  `ListManagementOptions`, which overrides them). SES overwrites Message-ID → our id goes in `EmailTags` (ASCII letters,
  digits, `_`, `-`, ≤ 256 each; count limit [U]) and comes back as `mail.tags.<name>[0]` on every event (config-set
  publishing only). Max message 40 MB after base64. Errors: AccountSuspended, BadRequest, LimitExceeded,
  MailFromDomainNotVerified, MessageRejected, NotFound, SendingPaused (account), TooManyRequests 429.
- **Tenants API, checked 2026-11-11** [V-undated, CreateTenant, CreateTenantResourceAssociation, dg/tenants, dg/quotas]:
  `CreateTenant {TenantName ≤ 64 [A-Za-z0-9_-]}` → SendingStatus ENABLED|REINSTATED|DISABLED;
  `CreateTenantResourceAssociation {TenantName, ResourceArn}` for identity, config set, template — one resource may serve
  many tenants (one `frratamail.app` identity for all shops). A tenant needs ≥ 1 identity + ≥ 1 config set. Default policy
  `arn:aws:ses:<region>:aws:reputation-policy/standard`. A paused tenant's sends fail (which exception [U]); an AWS_SES pause
  needs a Support case. **Every SES API action but SendEmail/SendBulkEmail: 1 request/s** → tenant set-up is paced outbox
  rows. 10,000 tenants default; plans include 1,000 per region [V, pricing].
- **Event JSON** [V-undated, dg/event-publishing-retrieving-sns-contents, 2026-11-11]: `eventType` + `mail` {messageId,
  destination, tags…} + one object. Bounce: bounceType Permanent|Transient|Undetermined (+ subtypes; Transient only after SES
  stops retrying), bouncedRecipients[]. Complaint: complainedRecipients (ISPs redact), complaintFeedbackType. Delivery:
  recipients, smtpResponse. Send `{}`. Reject "Bad content" only. DeliveryDelay: delayType, expirationTime. **No tenant field
  in event JSON [U]** → tag every send with the shop id and our message id.
- **SNS HTTPS** [V-undated, sns dg + API, 2026-11-11]: confirm by GET `SubscribeURL`; answer within ~15 s; default 3 retries
  20 s apart, custom ≤ 100 retries and ≤ 3,600 s in all; only 5xx/429 retried — any other status drops the event; dedupe
  `x-amz-sns-message-id`; body `text/plain` JSON, `Message` = the SES event as a string; 256 KiB max. Topic `SignatureVersion`
  defaults to 1 → set 2 (SHA256). String to sign = `Key\nValue\n` in byte order, one trailing newline, unescaped values:
  Notification Message, MessageId, Subject (if present), Timestamp, TopicArn, Type; SubscriptionConfirmation Message,
  MessageId, SubscribeURL, Timestamp, Token, TopicArn, Type. SigningCertURL https, host
  `^sns\.[a-zA-Z0-9-]{3,}\.amazonaws\.com$` (AWS's sns-validator); reject any other TopicArn. **SNS signs fields, not the raw
  body**: ADR-0006's "raw body" means "the provider's documented signature".
- **Vercel OIDC → AWS** [V, vercel.com/docs/oidc 2026-08-04, /oidc/aws 2026-08-28, /oidc/reference 2026-09-17]: all plans;
  IAM provider `https://oidc.vercel.com/<team-slug>` (Team mode), audience `https://vercel.com/<team-slug>`; trust
  `oidc.vercel.com/<team-slug>:sub` = `owner:<team-slug>:project:<project>:environment:production` (previews refused). Token
  in the `x-vercel-oidc-token` header (request-scoped), 2 h. Set `AWS_REGION=ap-south-1` yourself. Don't pass a custom
  audience (Vercel's pages disagree on it).
- **Supabase Auth via SES** [V-undated, supabase auth-smtp, rate-limits, send-email-hook; AWS smtp-credentials, 2026-11-11]:
  custom SMTP needs SES SMTP credentials of an IAM USER (never temporary/OIDC) stored in Supabase; 30 emails/hour until raised
  (`rate_limit_email_sent`). Alternative: the Send Email Hook (Standard Webhooks, `v1,whsec_…`) → our route sends through the
  SES API with OIDC, no long-lived key.
- **Production access** [V-undated, dg/request-production-access, 2026-11-11]: MailType, WebsiteURL, ≤ 4 contacts,
  acknowledgement (opt-in only; bounce/complaint process); first reply within **96 h**; locked while in review. Production
  quota "varies based on your specific use case" (no current figure [U]).
- **VDM / Mail Manager**: neither needed to start; keep VDM's optimized shared delivery off on transactional sets [V, 2026-11-11].
- **Resend** (not chosen): no India region; single-account tenants share one reputation; complaint rate < 0.08% or
  "may be shut down without warning" [V-undated; AUP V 2026-10-13]. Postmark: separate transactional/broadcast streams
  [V 2026-10-26]. ZeptoMail: transactional only [V-undated].
- **Gmail:** every sender SPF or DKIM, spam < 0.3%; bulk (~5,000 a day to personal accounts, **counted per primary
  domain, subdomains together, permanent**) needs SPF + DKIM + DMARC aligned, one-click unsubscribe on marketing
  ("Transactional messages are excluded"), spam < 0.10%; enforcement ramped from Nov 2025 [V-undated,
  support.google.com/a/answer/81126, /14229414]. Yahoo: RFC 8058, unsubscribes honoured within 2 days. Microsoft: 5,000+
  a day → SPF, DKIM, DMARC pass or 550 5.7.515 (from 5 May 2025) [V-undated / S]. BIMI: DMARC quarantine/reject at
  100% + VMC/CMC [V 2026-10-26].
- **Shopify:** an unauthenticated sender is rewritten to `store+123@shopifyemail.com`; CNAMEs, DMARC `p=none` minimum,
  up to 48 h; Shopify Messaging 10,000 free a month then $1 / $0.65 / $0.55 per 1,000; abandoned checkout free; warm-up
  20–30% a week, 5× a day's volume triggers throttling [V-undated, help.shopify.com].
- **India:** no law or rule on commercial email found [U]; DPDP governs it (§ Privacy). No email data-residency or
  GST-invoice-by-email rule found [U, a CA to confirm].
- **A prepaid wallet** for Frrata's own services is a closed-system PPI, "not regulated or supervised by RBI", while it
  permits no cash withdrawal [V, RBI Master Direction on PPIs as on 30 Sep 2026, para 2.1]. Paying Meta or an SMS
  vendor on the merchant's behalf would make it semi-closed (RBI authorisation) [S reading].
