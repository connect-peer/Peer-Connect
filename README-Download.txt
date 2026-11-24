Peer Connect persistent doubts update

Includes the latest Peer Connect files: index.html, app.js, supabase-config.js, and README.md.

The Doubts page now reads/writes the existing public.doubts and public.answers tables. The existing Supabase RLS policies already allow authenticated users to read the shared feed and only permit each signed-in user to create records under their own author ID. No SQL changes are required.

Replace these files in the repository root and push to publish. Doubts created before this update existed only in browser memory and cannot be restored from the database.
