# Peer Connect: project handoff

Peer Connect is a peer tutoring network for a school, like LinkedIn for studying. Students find tutors, send connection requests, and ask and answer doubts. This folder is the working front-end prototype. The goal is to turn it into a live website.

The page styling is embedded in `index.html`; the app behavior is in `app.js`.

## Automatic semantic releases

Peer Connect uses GitHub Actions and Conventional Commits. Use `fix:` for a
patch, `feat:` for a minor release, and `!` or a `BREAKING CHANGE:` footer for
a major release. The workflow opens a release pull request that updates
`version.json`; merging it creates the matching `vX.Y.Z` GitHub Release and
tag. See [CONTRIBUTING.md](CONTRIBUTING.md) for examples and setup details.

## 1. What exists today

A front-end prototype connected to Supabase Auth. People can create an account with email and password or use Google, then choose Student or Tutor and add their class (9–12), school, city, state, and country. Tutors submit a school ID and fee receipt for private review. Only approved tutors appear in search with a green Verified badge. Tutor cards open a social-style profile, and tutors can filter incoming student requests by state and city.

| Page | Route | What it does |
|---|---|---|
| Home | `#home` | Pitch, three cards linking to other pages, "How it works" steps |
| Tutors | `#tutors` | Search verified tutors, filter by subject/state/city, open profile cards, Connect |
| Doubts | `#doubts` | Ask a doubt, upvote, sort Hot/New/Top, filter by subject, answer |
| Pricing | `#pricing` | Student and tutor accounts are free; optional tutor Blue Tick is planned as a one-time purchase with price TBD |
| My page | `#me` | Account details and location editing |
| Tutor dashboard | `#dashboard` | Verification submission/status, location-filtered requests, availability, and profile editing |
| Verification review | `#verification` | Private review queue for allowlisted reviewers only |

On phones a bottom tab bar replaces the top links.

## 2. Files

- `index.html`: page structure. Each page is a block with a `data-v="..."` attribute. The router shows or hides blocks by that value.
- Styling is embedded in `index.html` so the UI does not rely on a separate CSS file.
- `app.js`: page behavior plus Supabase Auth. A map of its functions is in the comment at the top of the file.

No framework or build step. Serve this folder through a local web server to run
it; the Supabase client is loaded from jsDelivr, and OAuth does not work from a
`file://` URL.

## 3. Current business rules

- Student and tutor accounts are free. Students can send unlimited connection requests.
- Optional tutor **Blue Tick** is planned as a one-time payment. The price is undecided and payments are not implemented.
- The green **Verified** badge is free. A trusted reviewer checks a school ID and fee receipt; the client cannot grant the badge.
- Verification files live in a private bucket and the review page removes them after approval or rejection. They are never displayed on tutor profiles.
- Student locations stay in a row-level protected table. They are shown to the tutor receiving that student’s connection request. Verified tutor school/location details are shown in tutor search and profiles.
- Changing a verified tutor’s name, class, school, headline, or subject list clears approval and requires another review.
- Tutor verification remains separate from the optional Blue Tick.

## 4. Data shapes

```js
tutor = { n: "name", g: "Class 12", s: ["Maths"], h: "one-line headline",
          r: 4.8 /* rating or "New" */, x: 12 /* sessions */, m: 0 /* mutual connections */,
  c: "#2B4EFF" /* cover color */, school: "school", city: "city", state: "state",
  country: "country", verified: true /* set by the protected reviewer workflow */ }

post  = { id: 1, n: "asker name", g: "Class 11", sub: "Maths", t: "question text",
          ago: "now", likes: 0, liked: false, rep: [{ n: "answerer", t: "answer text" }] }
```

Main state variables in `app.js`: `tutors`, `posts`, `sent`, `user` (signed-in person), `mine` (has a tutor profile), `fSub`, `fSort`, `openR`.

## 5. What is fake and must be replaced

| Fake today | Real version |
|---|---|
| Doubt upvotes are still local | Save upvotes in a database table |
| Optional Blue Tick payment | Payment provider and price are undecided; no payment is active |
| Data in `tutors` and `posts` arrays | Database tables, loaded through an API |
| Tutor verification | `supabase-tutor-verification.sql` adds private location storage, private ID/receipt storage, reviewer access, and protected verification status |

## 6. Supabase Auth setup

The app keeps its CSS in index.html, loads a pinned Supabase JavaScript client
from jsDelivr and reads its project URL and publishable key from
supabase-config.js. The key is intended
for browser use; never put a service-role or secret key in frontend files.

Google sign-in uses Supabase Auth. The selected account type is saved to the
profiles table. Tutor setup saves the student's grade and tutor subjects to
the connected project. The My page reads the signed-in user's profile.

## 7. Tutor verification setup

Before publishing the updated site, open Supabase SQL Editor for the connected
project and run `supabase-tutor-verification.sql` once. It adds the private
location table, review queue, access rules, and private storage bucket. The
script also moves existing profile school/city values into the private table.
Students and tutors will be prompted to confirm school, city, state, and
country after their next sign-in.

Then add the trusted reviewer account from the bottom of that SQL file:

1. Replace `YOUR_ADMIN_EMAIL` with your own signed-in email.
2. Run the `insert into public.verification_admins ...` statement in SQL Editor.
3. Sign out and back in. The **Verify tutors** link appears for that account.
4. Review the school ID and fee receipt from the private queue. Approval adds
   the green badge; approval or rejection removes the uploaded files from
   storage. Only the reviewer can open those files.

Do not manually set a verification status or add a reviewer from browser code.
The browser uses only the Supabase publishable key; never add a service-role
key to `supabase-config.js`.

Location details are not selected from the public `profiles` table. Tutor
directory results expose locations only for approved tutors. A student's
location is returned only to the tutor receiving their connection request.

To enable Google sign-in:

1. Add a Google OAuth web client in Google Cloud and set its callback URL to
   https://dximxjxlzmfnqaaryphv.supabase.co/auth/v1/callback.
2. In Supabase Dashboard, open Authentication → Sign In / Providers → Google
   and enter the Google client ID and client secret.
3. In Authentication → URL Configuration, add the deployed Peer Connect URL
   (for example, https://example.com/**) and the local development URL
   (for example, http://localhost:8000/**) to the allowed redirect URLs.
4. Serve this folder through a local web server or deploy it to a static host.
   Opening index.html as a file:// URL is not suitable for OAuth callbacks.

## 8. Suggested stack for the live site

Keep it simple for a student team:

- **Supabase** (Postgres + Google login + row-level security) or **Firebase**.
- Front end: keep plain HTML/JS at first, or move to **React with Vite** or **Next.js** when the pages grow. Next.js gives real URLs like `/tutors/aarav` instead of `#tutors`.
- Hosting: Vercel or Netlify (free tiers).
- Payments: consider a one-time checkout only if the Blue Tick price is approved later.

Suggested tables: `profiles`, `tutor_profiles`, `connections` (requester, tutor, status), `doubts`, `answers`, `votes`, `subscriptions`, `reports`.

## 9. Safety and legal points for a live site (important)

Most users will be under 18, so plan for this before launch:

- Sessions in school or in a supervised space only. No private contact details shown on profiles.
- Add a **Report** button on profiles, doubts and answers, and a way for an adult admin to remove content.
- Verify users with a school email or a teacher approval.
- India's Digital Personal Data Protection Act, 2023 requires verifiable parental consent before processing a child's data. Add a consent step and a privacy policy.
- Do not take payments from minors directly. Any future one-time purchase should be handled with a parent or guardian.

## 10. Style rules

- Plain English in all text. No buzzwords.
- Keep the design: blue brand color, gold accent, Bricolage Grotesque for headings, Figtree for body.
- Keep dark mode working (colors are variables in `:root`).
- Keep it usable on phones.
- Use the typographic apostrophe in visible text.

## 11. Good next tasks to ask ChatGPT

1. "Persist doubt upvotes in Supabase."
2. "Add a separate profile page for each tutor, with their reviews and a request button."
3. "Make connection requests real: the tutor sees a list and can accept or decline."
4. "Add a one-time checkout for the tutor Blue Tick after its price is decided."
5. "Add a Report button and a simple admin page to remove content."
6. "Add a Follow button on tutors and a trending subjects box on the Doubts page."

## 11. How to ask for changes

- Name the page and the function, for example "in `drawMe()` in `app.js`".
- Ask for the full changed function, not a summary, so you can paste it in.
- After each change, verify email and Google sign-in, role setup, tutor request handling, and doubt posting/upvoting/answers.
