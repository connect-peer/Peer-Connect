Peer Connect default sign-in update

Visitors who open Peer Connect without a valid signed-in session are shown the full-screen sign-in page immediately. The sign-up switch remains available. The sign-in page fills the viewport, does not scroll, and cannot be dismissed to bypass sign-in. Successful sign-in returns to the app; a signed-in session skips the sign-in screen. Password recovery continues to work.

The right panel introduces Peer Connect. Existing Supabase authentication and persistent doubts/answers remain in place. No SQL changes are needed.

Replace index.html, app.js, supabase-config.js, and README.md in the repository root, then publish the site.
