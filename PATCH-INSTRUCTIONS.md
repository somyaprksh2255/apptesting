# Squado schema reconciliation patch

Apply this patch to the existing local Squado repository folder (the one containing `.git`). Extract these files into that folder and allow matching files to be overwritten. Do not overwrite or remove the `.git` directory.

After copying, manually delete `supabase/migrations/0010_live_schema_shared_plans.sql` if it still exists in the migrations folder; the replacement copy is archived under `supabase/archive/` and must not be run.

The core migration set now consistently uses `public.profiles.id = auth.users.id`, matching the frontend/server implementation. The RLS test fixtures were updated to use `id`.

`supabase/TEST_ONLY_clean_start_baseline.sql` is a convenience combination for the new empty test project. It has only received static review and has NOT been executed against PostgreSQL/Supabase in this environment. Do not run it until the project owner has reviewed it and confirmed the target is the new test project, not live production.
