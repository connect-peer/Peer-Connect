Peer Connect signed-in workspace redesign

Files: index.html, app.js, supabase-config.js

The signed-out landing page remains public. After sign-in, users land in a separate workspace with persistent navigation, a signed-in badge, role-aware actions, and account details. The desktop layout uses a left navigation rail, central workspace, and a supporting right panel; the rail becomes a bottom navigation bar on phones.

To publish, replace these three files in the root of the Peer-Connect repository and push the changes. The Supabase config contains only the browser-safe legacy anon key, never a service-role key.
