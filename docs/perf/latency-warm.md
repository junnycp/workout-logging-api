# Endpoint latency (warm)

Generated 2026-10-09T03:35:15.865Z by `npm run perf:latency -- --label warm` against http://localhost:3000.
Client-side milliseconds per request (response body fully read), after 5 warm-up calls.
Variants = request variants cycled through (different users, cursors, exercises or ranges).

| Scenario | Variants | Mode | n | p50 ms | p95 ms | max ms |
|---|---:|---|---:|---:|---:|---:|
| H1-history-first-page | 10 | sequential | 100 | 2.9 | 5.4 | 9.3 |
| H1-history-first-page | 10 | 20 in flight | 100 | 27.2 | 80 | 85.7 |
| H2-history-deep-cursor | 11 | sequential | 100 | 2.7 | 5.1 | 10.8 |
| H3-history-partial-name | 5 | sequential | 100 | 2.9 | 4.1 | 6.6 |
| H4-history-broad-name | 3 | sequential | 100 | 3.1 | 5.5 | 19.3 |
| H5-history-old-exercise | 1 | sequential | 100 | 2.5 | 4 | 5 |
| H6-history-muscle-group | 4 | sequential | 100 | 2.7 | 3.7 | 5.6 |
| H7-history-range-and-name | 2 | sequential | 100 | 3 | 4.5 | 5.6 |
| H8-history-100-in-lb | 2 | sequential | 100 | 4.2 | 6.5 | 22.3 |
| P1-records-largest-exercise | 1 | sequential | 100 | 29.2 | 32.1 | 39.7 |
| P2-records-typical-exercises | 15 | sequential | 100 | 6.5 | 30.1 | 57.6 |
| P2-records-typical-exercises | 15 | 20 in flight | 100 | 114 | 152.9 | 160.5 |
| P3-records-one-month | 1 | sequential | 100 | 3.8 | 5.5 | 8.6 |
| P4-records-plateau | 1 | sequential | 100 | 4.6 | 7.4 | 21.6 |
| P5-records-natural-ties | 1 | sequential | 100 | 5.3 | 7.1 | 8 |
| P6-records-bodyweight-only | 1 | sequential | 100 | 2.5 | 5.3 | 7.2 |
| P7-records-typical-user | 10 | sequential | 100 | 3.9 | 5.8 | 12 |
| P8-records-unknown-name | 1 | sequential | 100 | 1.9 | 2.6 | 4.1 |
| C1-compare-months | 4 | sequential | 100 | 5.8 | 12.8 | 24.8 |
| W1-post-one-entry | 1 | sequential | 100 | 2.7 | 4.2 | 6.7 |
| W2-post-max-bulk | 1 | sequential | 20 | 292.4 | 336.1 | 353 |
| S1-records-single-exercise-user | 1 | sequential | 100 | 77.1 | 80.3 | 110.4 |
| S2-compare-single-exercise-user | 1 | sequential | 100 | 9.7 | 11.9 | 21.3 |

## Index usage during this pass (idx_scan since reset)

| Table | Index | Scans | Size |
|---|---|---:|---|
| exercise_muscle_groups | exercise_muscle_groups_muscle_group_code_exercise_id_idx | 105 | 16 kB |
| exercise_muscle_groups | exercise_muscle_groups_pkey | 0 | 16 kB |
| exercise_names | exercise_names_exercise_id_idx | 210 | 16 kB |
| exercise_names | exercise_names_name_key_trgm_idx | 0 | 96 kB |
| exercise_names | exercise_names_pkey | 0 | 16 kB |
| exercises | exercises_name_key | 0 | 16 kB |
| exercises | exercises_pkey | 210 | 16 kB |
| idempotency_keys | idempotency_keys_created_at_idx | 0 | 8192 bytes |
| idempotency_keys | idempotency_keys_pkey | 0 | 8192 bytes |
| muscle_groups | muscle_groups_pkey | 105 | 16 kB |
| workout_entries | workout_entries_pkey | 146849 | 6856 kB |
| workout_entries | workout_entries_user_id_exercise_id_performed_at_id_idx | 7316 | 29 MB |
| workout_entries | workout_entries_user_id_performed_at_id_idx | 428 | 26 MB |
| workout_sets | workout_sets_entry_id_set_number_key | 29805 | 50 MB |
| workout_sets | workout_sets_pkey | 38572 | 38 MB |
| workout_sets | workout_sets_pr_covering_idx | 5817 | 177 MB |
