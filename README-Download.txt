Meridian frontend update

This repository contains the static Meridian frontend and its Supabase setup
files. Deploy index.html, app.js, and supabase-config.js together through the
existing GitHub Pages workflow. Run new SQL migrations in Supabase SQL Editor
before deploying frontend features that depend on them.

Never publish private identity documents, authentication tokens, service-role
keys, payment keys, or video provider secrets in the frontend.
