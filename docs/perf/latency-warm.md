# Endpoint latency (warm)

Generated 2026-10-09T04:26:30.952Z by `npm run perf:latency -- --label warm` against http://localhost:3000.
Client-side milliseconds per request (response body fully read), after 5 warm-up calls.
Variants = request variants cycled through (different users, cursors, exercises or ranges).

| Scenario | Variants | Mode | n | p50 ms | p95 ms | max ms |
|---|---:|---|---:|---:|---:|---:|
| H1-history-first-page | 10 | sequential | 100 | 2.7 | 4.6 | 6.2 |
| H1-history-first-page | 10 | batches of 20 | 100 | 29.6 | 73.1 | 75.9 |
| H2-history-deep-cursor | 11 | sequential | 100 | 2.9 | 4.7 | 7.4 |
| H3-history-partial-name | 5 | sequential | 100 | 2.7 | 3.8 | 5.1 |
| H4-history-broad-name | 3 | sequential | 100 | 3.1 | 5.1 | 15.4 |
| H5-history-old-exercise | 1 | sequential | 100 | 2.6 | 4 | 5.5 |
| H6-history-muscle-group | 4 | sequential | 100 | 2.8 | 3.7 | 5.2 |
| H7-history-range-and-name | 2 | sequential | 100 | 3 | 4.4 | 5.3 |
| H8-history-100-in-lb | 2 | sequential | 100 | 4.3 | 6.1 | 9 |
| P1-records-largest-exercise | 1 | sequential | 100 | 29.3 | 31 | 51.3 |
| P2-records-typical-exercises | 12 | sequential | 100 | 5.9 | 20.5 | 58.6 |
| P2-records-typical-exercises | 12 | batches of 20 | 100 | 76.3 | 105.1 | 106.5 |
| P3-records-one-month | 1 | sequential | 100 | 3.8 | 5.7 | 20.8 |
| P4-records-plateau | 1 | sequential | 100 | 4.6 | 7.6 | 17.4 |
| P5-records-natural-ties | 1 | sequential | 100 | 5.4 | 7.6 | 13.6 |
| P6-records-bodyweight-only | 1 | sequential | 100 | 2.5 | 3.1 | 6.2 |
| P7-records-typical-user | 10 | sequential | 100 | 4 | 7.7 | 9.8 |
| P8-records-unknown-name | 1 | sequential | 100 | 1.8 | 3.2 | 7.6 |
| C1-compare-months | 4 | sequential | 100 | 5.3 | 7.8 | 38.5 |
| W1-post-one-entry | 1 | sequential | 100 | 2.7 | 4.4 | 5.1 |
| W2-post-max-bulk | 1 | sequential | 20 | 284.7 | 327.9 | 332.8 |

## Index usage during this pass (idx_scan since reset)

| Table | Index | Scans | Size |
|---|---|---:|---|
| exercise_muscle_groups | exercise_muscle_groups_muscle_group_code_exercise_id_idx | 105 | 16 kB |
| exercise_muscle_groups | exercise_muscle_groups_pkey | 0 | 16 kB |
| exercise_names | exercise_names_exercise_id_idx | 210 | 16 kB |
| exercise_names | exercise_names_name_key_trgm_idx | 0 | 136 kB |
| exercise_names | exercise_names_pkey | 0 | 16 kB |
| exercises | exercises_name_key | 0 | 16 kB |
| exercises | exercises_pkey | 210 | 16 kB |
| idempotency_keys | idempotency_keys_created_at_idx | 0 | 8192 bytes |
| idempotency_keys | idempotency_keys_pkey | 0 | 8192 bytes |
| muscle_groups | muscle_groups_pkey | 105 | 16 kB |
| workout_entries | workout_entries_pkey | 143341 | 6256 kB |
| workout_entries | workout_entries_user_id_exercise_id_performed_at_id_idx | 7317 | 17 MB |
| workout_entries | workout_entries_user_id_performed_at_id_idx | 427 | 15 MB |
| workout_sets | workout_sets_entry_id_set_number_key | 29805 | 40 MB |
| workout_sets | workout_sets_pkey | 34783 | 31 MB |
| workout_sets | workout_sets_pr_covering_idx | 4301 | 138 MB |
