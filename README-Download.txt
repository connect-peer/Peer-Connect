Peer Connect update: original UI + saved doubts

This package keeps the original public site layout and sign-in styling. The doubts page saves doubts and answers in the existing Supabase tables so they remain after refresh and across signed-in accounts. No SQL changes are needed.

Replace index.html, app.js, supabase-config.js, and README.md in the repository root, then publish the site. Existing doubts that only lived temporarily in the browser cannot be recovered.
