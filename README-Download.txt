Peer Connect delete controls

Users can now delete their own doubts and answers from the Doubts feed. Each delete asks for confirmation. Deleting a doubt also deletes all of its answers because the existing database relationship cascades deletes. Other users' content has no delete button.

Existing Supabase owner-only delete policies are used. No SQL changes are needed. Replace index.html, app.js, supabase-config.js, and README.md in the repository root, then publish the site.
