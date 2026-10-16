# Squado — clean setup starter

This repository is a clean-start copy of the Squado v27 source. It is deliberately **not connected to any existing live service**. The Supabase URL/key, Google client ID, API URL, and app URL in `src/js/config.js` are blank so a first deployment cannot accidentally point at the existing production services.

## Current status

- Frontend source and GitHub Pages workflow are included.
- An optional Express API for Render is included under `server/`. GitHub Pages cannot host this API.
- Core Supabase migrations are now aligned on `profiles.id = auth.users.id`, matching the current frontend and server code. The old duplicate `0010` draft has been moved to `supabase/archive/` and must not be run.
- Do not configure this new deployment to use the existing live Supabase or Render service until the replacement has passed end-to-end verification.

## Before deploying

1. Create a new GitHub repository and upload this source. Do not delete or change the existing repository.
2. Apply the reviewed core migrations in order to the disposable Supabase test project only. Start with `0001_squado_schema.sql`, then `0002_squado_constraints.sql`, `0003_attendance.sql`, `0005_admin_console.sql`, `0006_shared_plan_location.sql`, `0008_blocked_user_snapshots.sql`, and `0009_shared_feedback.sql`. Do not run the archived `0010` draft.
3. Create a separate Supabase project for the replacement and configure Google OAuth with that project's callback URL.
4. Set public frontend configuration in `src/js/config.js` only after the new project and URLs exist. The Supabase publishable/anon key and Google client ID are public identifiers; never put a Supabase secret/service-role key, Google client secret, or database password in frontend files.
5. Set the Render API's private environment variables in the Render dashboard, not in GitHub or frontend files. Use `.env.example` as a names-only template.
6. Deploy and test the replacement independently. Switch users only after sign-in, profiles, shared plans, join requests, group chat, media, attendance, feedback, blocks, and admin controls are verified.

## Local development

Requires Node.js 18 or later. Run `npm ci`, then `npm run dev` for the frontend. Use `npm run build` to create the static site in `dist/`. The API can be started separately with `npm run start:api` after its private environment variables are configured.

## Safety

Never commit `.env` files or secret keys. The `.gitignore` excludes `.env` and `.env.*` except `.env.example`. Keep the existing production services unchanged until the replacement is verified.
