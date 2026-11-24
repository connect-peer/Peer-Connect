Peer Connect UI update

The sign-in and account-creation screen uses a split layout: account form on the left and Peer Connect introduction on the right. On smaller screens, it becomes a one-column form. Successful email sign-in closes the screen and returns to the app.

The main pages now use a consistent social-learning layout, with a more prominent home feed and a community tips rail beside the Doubts feed. Existing routes, Supabase authentication, saved doubts, and answers are retained. No SQL changes are needed.

Replace index.html, app.js, supabase-config.js, and README.md in the repository root, then publish the site.
