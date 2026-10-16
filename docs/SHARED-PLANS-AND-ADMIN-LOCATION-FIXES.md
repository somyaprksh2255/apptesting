# Squado shared-plan and Admin Event location fixes

This patch is based on the supplied `squado-correction(2).zip` source tree. It preserves the existing GitHub Pages + Render + Supabase architecture and does not include credentials or a Git repository directory.

## Shared plans

- Authenticated users have their Supabase `profiles` row upserted before a plan is created.
- Normal plan creation and Still Outside creation now write to `public.plans` and wait for a successful database response before showing success.
- The creator's host membership is written to `public.memberships`. If this fails, the client attempts to remove the just-created plan and reports failure instead of showing a false success state.
- Home/Discover state is hydrated from open plans in Supabase, along with membership and pending-request records visible under the existing RLS policies.
- Creator profiles visible under RLS are loaded for plan cards. The feed refreshes after authentication and every 30 seconds.
- Signing out clears cached shared records from the browser state.
- Local UI state and local-only legacy plans are not automatically migrated to the database.

## Admin Event location

- `server/admin.mjs` now preserves `city`, `state`, `locLat`, `locLng`, and `locationSource` in saved Event payloads.
- The server rejects payloads without the expected OpenStreetMap selection marker, a city, or valid latitude/longitude ranges. The browser already clears selected metadata when the search field changes and requires the current text to match the selected result.
- Old Events that have no verified location metadata must be reselected from the map before they can be saved again.

## Existing migrations

The supplied source includes `supabase/migrations/0001_squado_schema.sql`, which defines `profiles`, `plans`, `memberships`, and `join_requests`, and `0006_shared_plan_location.sql`, which adds city and coordinate fields to `plans`. This patch does not add a duplicate `0007` migration. Before production testing, verify that these migrations have actually been applied to the existing Supabase project; do not blindly reset the database or rerun migrations without checking the current schema and migration history.

## Verification

The static build and source checks passed in the patch workspace. The full server-test chain could not complete in the patch workspace because `npm ci` did not finish and the local `node_modules/@supabase/supabase-js` package was incomplete. Run `npm ci` and `npm test` in a network-enabled environment before deploying. The browser-to-Supabase flow still requires live testing with two separate authenticated accounts.
