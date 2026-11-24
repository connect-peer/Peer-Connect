Peer Connect tutor verification update

This update adds:
- Required school, city, state, and country fields for students and tutors.
- Protected location storage. Student location details are shown only to a tutor who receives their connection request.
- State and city filters for verified tutors and incoming student requests.
- Tutor profiles that open into a social-style profile view with an About section and recent answers.
- Class 11/12 eligibility for tutor verification.
- Private school-ID and fee-receipt uploads, a reviewer-only approval queue, and a green Verified badge that users cannot set themselves.
- Automatic deletion of the uploaded documents after the reviewer approves or rejects the request.

Before publishing the site:
1. Open `supabase-tutor-verification.sql` and run it once in Supabase SQL Editor.
2. At the bottom of that file, replace `YOUR_ADMIN_EMAIL` with the trusted reviewer's Supabase login email. Copy the commented INSERT statement into SQL Editor without the leading `--` comment marks and run it separately.
3. Sign out and back in as the reviewer. The `Verify tutors` page will appear in navigation.
4. Publish the updated `index.html` and `app.js`. Keep your existing `supabase-config.js` unchanged.

The badge means a reviewer checked school affiliation, senior class, and tutor profile. It does not guarantee academic results. Never add a Supabase service-role key to browser files.
