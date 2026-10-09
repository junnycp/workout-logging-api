# Endpoint latency (single)

Generated 2026-10-09T04:29:13.754Z by `npm run perf:latency -- --label single` against http://localhost:3000.
Client-side milliseconds per request (response body fully read), after 5 warm-up calls.
Variants = request variants cycled through (different users, cursors, exercises or ranges).

| Scenario | Variants | Mode | n | p50 ms | p95 ms | max ms |
|---|---:|---|---:|---:|---:|---:|
| S1-records-single-exercise-user | 1 | sequential | 100 | 85.5 | 89.9 | 124.4 |
| S2-compare-single-exercise-user | 1 | sequential | 100 | 10.8 | 14.1 | 34.8 |

## Index usage during this pass (idx_scan since reset)

| Table | Index | Scans | Size |
|---|---|---:|---|
| exercise_muscle_groups | exercise_muscle_groups_muscle_group_code_exercise_id_idx | 0 | 16 kB |
| exercise_muscle_groups | exercise_muscle_groups_pkey | 0 | 16 kB |
| exercise_names | exercise_names_exercise_id_idx | 0 | 16 kB |
| exercise_names | exercise_names_name_key_trgm_idx | 0 | 136 kB |
| exercise_names | exercise_names_pkey | 0 | 16 kB |
| exercises | exercises_name_key | 0 | 16 kB |
| exercises | exercises_pkey | 0 | 16 kB |
| idempotency_keys | idempotency_keys_created_at_idx | 0 | 8192 bytes |
| idempotency_keys | idempotency_keys_pkey | 0 | 8192 bytes |
| muscle_groups | muscle_groups_pkey | 0 | 16 kB |
| workout_entries | workout_entries_pkey | 2940 | 6832 kB |
| workout_entries | workout_entries_user_id_exercise_id_performed_at_id_idx | 0 | 30 MB |
| workout_entries | workout_entries_user_id_performed_at_id_idx | 13 | 25 MB |
| workout_sets | workout_sets_entry_id_set_number_key | 0 | 45 MB |
| workout_sets | workout_sets_pkey | 2940 | 34 MB |
| workout_sets | workout_sets_pr_covering_idx | 1575 | 194 MB |
