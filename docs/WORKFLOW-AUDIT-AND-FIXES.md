# Squado workflow audit and fixes

## Included in this patch

- Shared plan persistence/feed integration from the prior patch.
- Admin Event payload preserves verified location metadata (city, state, latitude, longitude, source).
- First-visit theme is explicitly light; saved `squado-theme` preference is still respected.
- Location containers use a lavender/purple + white palette with explicit dark-theme contrast.
- Profile Settings shows a blocked-user count; clicking opens a details overlay with Unblock actions.
- Authenticated block/unblock actions use the existing `public.blocks` table and preserve a safe name/username/avatar/city snapshot for the private list.

## Migrations

- Keep `0001_squado_schema.sql`: it defines the core tables including `profiles`, `plans`, `memberships`, `join_requests`, and `blocks`.
- Keep `0006_shared_plan_location.sql`: shared plans need city and coordinate/source metadata. It uses `ADD COLUMN IF NOT EXISTS`, but still confirm whether it has already been applied before running it against the live database.
- `0008_blocked_user_snapshots.sql` is added by this patch so it does not overwrite a separately created `0007` migration. It adds only safe display snapshot columns to `blocks`; it does not weaken Row Level Security. Apply it once in Supabase SQL Editor if those columns do not already exist.
- The supplied ZIP did not contain a `0007` migration, but you mentioned creating one separately. Keep that file; inspect it and apply migrations in dependency order. This patch uses `0008` to avoid overwriting it. If your `0007` already adds the same snapshot columns, `0008` is still idempotent because it uses `ADD COLUMN IF NOT EXISTS`, but verify the contents before applying.

## Files not deleted

No source or migration was deleted as “unused” based on name alone. `src/styles/admin.css` is used by `admin.html`, even though the static build's index-only reference scan warns about it. Migration files are deployment history and should not be deleted just because a column/table also appears in a later file.

## Verification limitation

The static build and frontend/source checks pass. The complete `npm test` command stops in the server-test stage in this environment because `node_modules/@supabase/supabase-js` is incomplete/missing. Re-run `npm ci` in your local project before deployment and run the full suite. Live Supabase cross-account behaviour still needs testing against your project.
