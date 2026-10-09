# Endpoint latency (warm)

Generated 2026-10-09T03:55:15.817Z by `npm run perf:latency -- --label warm` against http://localhost:3000.
Client-side milliseconds per request (response body fully read), after 5 warm-up calls.
Variants = request variants cycled through (different users, cursors, exercises or ranges).

| Scenario | Variants | Mode | n | p50 ms | p95 ms | max ms |
|---|---:|---|---:|---:|---:|---:|
| H1-history-first-page | 10 | sequential | 100 | 2.8 | 5.2 | 10.3 |
| H1-history-first-page | 10 | batches of 20 | 100 | 25.8 | 62.4 | 70.4 |
| H2-history-deep-cursor | 11 | sequential | 100 | 2.5 | 4 | 7.8 |
| H3-history-partial-name | 5 | sequential | 100 | 2.7 | 4.2 | 12.8 |
| H4-history-broad-name | 3 | sequential | 100 | 3.1 | 5 | 6.7 |
| H5-history-old-exercise | 1 | sequential | 100 | 2.4 | 3.7 | 4.8 |
| H6-history-muscle-group | 4 | sequential | 100 | 2.6 | 3.7 | 5.7 |
| H7-history-range-and-name | 2 | sequential | 100 | 2.9 | 4.7 | 11.4 |
| H8-history-100-in-lb | 2 | sequential | 100 | 4.1 | 6.5 | 11.5 |
| P1-records-largest-exercise | 1 | sequential | 100 | 28.9 | 31.5 | 36.9 |
| P2-records-typical-exercises | 12 | sequential | 100 | 5.7 | 12.6 | 26.8 |
| P2-records-typical-exercises | 12 | batches of 20 | 100 | 73.6 | 85.7 | 86.6 |
| P3-records-one-month | 1 | sequential | 100 | 3.7 | 5.2 | 19.1 |
| P4-records-plateau | 1 | sequential | 100 | 4.5 | 7.6 | 16.1 |
| P5-records-natural-ties | 1 | sequential | 100 | 5.1 | 7.3 | 13.3 |
| P6-records-bodyweight-only | 1 | sequential | 100 | 2.4 | 3.8 | 5.2 |
| P7-records-typical-user | 10 | sequential | 100 | 3.7 | 5.9 | 17.6 |
| P8-records-unknown-name | 1 | sequential | 100 | 1.8 | 3.4 | 4.4 |
| C1-compare-months | 4 | sequential | 100 | 5 | 8 | 19.3 |
| W1-post-one-entry | 1 | sequential | 100 | 2.6 | 4.6 | 7.3 |
| W2-post-max-bulk | 1 | sequential | 20 | 286.7 | 322.2 | 331.7 |

## Index usage during this pass (idx_scan since reset)

| Table | Index | Scans | Size |
|---|---|---:|---|
| exercise_muscle_groups | exercise_muscle_groups_muscle_group_code_exercise_id_idx | 105 | 40 kB |
| exercise_muscle_groups | exercise_muscle_groups_pkey | 0 | 16 kB |
| exercise_names | exercise_names_exercise_id_idx | 210 | 16 kB |
| exercise_names | exercise_names_name_key_trgm_idx | 0 | 136 kB |
| exercise_names | exercise_names_pkey | 0 | 16 kB |
| exercises | exercises_name_key | 0 | 16 kB |
| exercises | exercises_pkey | 210 | 16 kB |
| idempotency_keys | idempotency_keys_created_at_idx | 0 | 8192 bytes |
| idempotency_keys | idempotency_keys_pkey | 0 | 8192 bytes |
| muscle_groups | muscle_groups_pkey | 105 | 16 kB |
| workout_entries | workout_entries_pkey | 143341 | 6944 kB |
| workout_entries | workout_entries_user_id_exercise_id_performed_at_id_idx | 7317 | 29 MB |
| workout_entries | workout_entries_user_id_performed_at_id_idx | 426 | 26 MB |
| workout_sets | workout_sets_entry_id_set_number_key | 29805 | 51 MB |
| workout_sets | workout_sets_pkey | 34783 | 39 MB |
| workout_sets | workout_sets_pr_covering_idx | 4301 | 192 MB |
