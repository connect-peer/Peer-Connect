# Meridian

Meridian helps learners find their bearings with practical guidance from someone who has been there. The frontend is a static HTML, CSS, and JavaScript app for GitHub Pages; Supabase provides authentication, database, and private storage.

## Run and deploy

Open the project with a local static web server while developing. Google sign-in does not work from `file://` URLs. Publish the repository through its existing GitHub Pages workflow; no framework or build step is required.

`supabase-config.js` contains only the public Supabase URL and publishable key. Never place service-role, payment, mail-provider, or video-provider secrets in browser files.

## Supabase setup

The deployed Meridian database already has the app’s profiles, bookings, social feed, reports, verification, and private storage tables. For a new or updating project, run **`supabase_meridian_safety_moderation.sql` once** in **Supabase → SQL Editor**. It now includes the learner-goals tables so there is one Meridian product migration to run.

That migration adds private age and guardian-consent fields, contact-detail filtering, reporting review tools, block records, fixed 30-minute booking safeguards, a 12-hour response window, a database-level one-person-per-time lock, private booking notifications and call reminders, mentor journey/results, fixed-weight matching, mentor achievement review with private proof and redacted public files, and the settlement ledger. The starting commission is 25%; change it in `meridian_platform_config.commission_percent` before new bookings if needed. Booking slots are 8:00 AM–8:00 PM India time. Seniors can block unavailable times; slots and duration remain company-set.

Booking requests, decisions, cancellations, and 10-minute call reminders appear in the signed-in notification center. The migration schedules reminders through `pg_cron` when available. If it reports that `pg_cron` is unavailable, schedule `public.meridian_notify_upcoming_calls()` to run every five minutes in Supabase Scheduled Functions.

These SQL files use `auth.uid()` to tie rows to signed-in profiles; they do not need an email address written into SQL. The Meridian migration is designed to be rerun after updates; back up the project before applying database changes and use the latest complete file.

### Meridian team admin access

The **Meridian Admin** page is for team accounts explicitly listed in `public.verification_admins`. The app and database both check this allow-list; ordinary users cannot grant themselves admin access. Add only trusted team accounts, after they have signed in once, by replacing the example email and running this in the Supabase SQL Editor:

```sql
insert into public.verification_admins (user_id)
select u.id
from auth.users u
where lower(u.email) = lower('TEAM_MEMBER_EMAIL')
  and not exists (
    select 1 from public.verification_admins a where a.user_id = u.id
  );
```

Admin access enables the app's review queues and moderation/settlement tools. It does not bypass database protections or put a service-role key in the website. Keep private learner chats and unrelated private data outside blanket admin access; use only the specific review tools needed for safety and account operations.

## Current product rules

- The public brand is **Meridian**. Existing Supabase table and RPC names remain internal compatibility interfaces; Meridian-prefixed browser settings automatically migrate previous saved preferences.
- People choose Learner, Senior, or Both. A Senior is still a learner.
- Learners book a verified Senior directly and explain what they want guidance on. A booking holds its time while pending or confirmed.
- A scheduled 30-minute Bearings call opens private in-site chat at the booked time. Only the two participants can read or send messages during that window.
- Do not share personal contact details or home addresses. The app checks content in the browser and the database applies a second filter.
- Achievement evidence and school verification files remain private. Only reviewer-approved, redacted achievement summaries and optional reviewed copies appear on public Senior profiles.
- The Meridian live call is a private two-person 100ms room, opens five minutes before its scheduled 30-minute slot, and is configured without recording. Participants start with camera and microphone off.
- Payments are authorized during checkout and captured only when the Senior accepts. A cancellation after capture requests a refund; completed calls are recorded in the configured commission and Senior share ledger. Payouts are manual and shown in the Senior dashboard and reviewer ledger.
- The current release metadata is in `version.json`; release automation uses Conventional Commits and release-please. Do not hand-edit the version during ordinary feature work.

## External launch requirements

GitHub Pages serves only the static frontend. Never put payment, email, or video secrets in browser files. Deploy the Supabase Edge Functions before enabling live sessions:

```text
supabase functions deploy meridian-create-order
supabase functions deploy meridian-verify-payment
supabase functions deploy meridian-session-action
supabase functions deploy meridian-create-room
supabase functions deploy meridian-video-token
supabase functions deploy meridian-razorpay-webhook --no-verify-jwt
```

In **Supabase → Edge Functions → Secrets**, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `MERIDIAN_100MS_ACCESS_KEY`, `MERIDIAN_100MS_APP_SECRET`, `MERIDIAN_100MS_TEMPLATE_ID`, and `MERIDIAN_100MS_ROLE` (the role must exist in that 100ms template). `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase to deployed functions; never copy the service-role key into the site. In Razorpay, use an approved account with manual capture. Register the deployed `meridian-razorpay-webhook` URL for `payment.authorized`, `payment.captured`, and `refund.processed`. Test checkout, capture, decline, cancellation, refund, and settlement with test-mode keys first. The Senior and reviewer dashboards show the split and payment state; no automatic mentor transfer is initiated. External payout activation remains a separate step requiring explicit approval and payment-provider setup.

Guardian consent currently requires the Meridian safety team to contact the guardian privately and mark the check in the reviewer area. No guardian email is sent by the app. Do not send minors’ personal data to an email or payment provider until Meridian has selected and approved that provider. Live payments/video require provider accounts, deployment secrets, and end-to-end checks; they are not usable until those are configured.

Guardian email matching is enforced by `meridian_guardian_account_policy.sql`, which should be run after `supabase_meridian_safety_moderation.sql`. A guardian email linked to a normal Meridian learner or mentor cannot be approved for consent or used to unlock a new booking. Authorized staff can be allowlisted in the private `meridian_staff_accounts` table; existing `verification_admins` accounts are automatically treated as admins/reviewers for this check, regardless of their learner/mentor profile role. Changing guardian details clears the old consent approval and returns the learner to the review queue.

## Main files

- `index.html`: Meridian pages, styles, navigation, and dialogs.
- `app.js`: frontend behavior and Supabase calls.
- `supabase-config.js`: browser-safe Supabase configuration only.
- `version.json`, `.release-please-manifest.json`, `.github/workflows/`: release metadata and automation.
- `supabase_meridian_safety_moderation.sql`: single additive database migration for Meridian safety, guidance, matching, and booking.
- `supabase/functions/`: server-only payment and 100ms video handlers. These run on Supabase, never GitHub Pages.
