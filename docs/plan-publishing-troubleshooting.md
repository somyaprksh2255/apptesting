# Plan publishing troubleshooting

Publishing requires an authenticated Supabase session, a synced `profiles` row, a successful `plans` insert, and a `memberships` host row. The UI does **not** report success until both database operations succeed.

## If posting fails

1. Open browser DevTools → Console. Find `[plans] publish failed` and note `stage`, `databaseCode`, `databaseMessage`.
2. In the Supabase project linked to this deployment, verify the migrations have been applied in order, especially `supabase/migrations/0006_shared_plan_location.sql`. It adds `city`, `loc_lat`, `loc_lng`, `loc_source`, `loc_place`, `day`, and `event_id` columns used by the posting payload.
3. Verify the deployed frontend has the correct Supabase URL and public anon key, and that the user is signed in.
4. If database code is `42501`, inspect RLS policies for `profiles`, `plans`, and `memberships`. Never disable RLS as a workaround.
5. If database code is `23503`, inspect the linked event and profile foreign keys.
6. Retry and confirm that both the plan row and host membership row exist.

This change improves diagnosis and messaging; a missing migration or incorrect production configuration must still be fixed in the actual Supabase project. Never put the service-role key in the frontend.
