# Shared feedback implementation notes

This update adds `supabase/migrations/0009_shared_feedback.sql` and connects feedback submission to Supabase RPCs. Individual feedback rows are private to their author; public summaries are exposed through aggregate RPCs only. Meetup and person summaries are hidden until at least three ratings exist.

## Before deploying

1. Back up the Supabase project and review the existing migration history.
2. Confirm migrations `0001` through `0008` have been reconciled/applied as appropriate; do not rerun them blindly.
3. Review and apply `0009_shared_feedback.sql` in a staging Supabase project first.
4. Verify that the attendance workflow writes verified rows to `public.attendance` and the host completion workflow writes `plans.completion` to Supabase. The feedback RPC deliberately rejects submissions if either server-side record is missing. Local browser state is not authoritative for eligibility.
5. Run the app with two or more test accounts and test a completed plan with three eligible attendees. Confirm no individual comment or author can be read by other accounts and aggregates are null below three ratings.

## Current limitation

This migration and frontend submission path are an integration step, not proof that the full live workflow is production-ready. The existing attendance/completion path must be verified to persist its server-side records before the feedback RPC can accept real submissions. The full server test suite also requires `npm ci` to complete successfully so `@supabase/supabase-js` is installed.
