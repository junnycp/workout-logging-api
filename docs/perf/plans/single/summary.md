# Query plans (single)

Generated 2026-10-09T04:28:51.961Z by `npm run perf:plans -- --label single`.
DB ms = sum of auto_explain durations (EXPLAIN ANALYZE overhead included; statements of one request can
run in parallel). Buffers = shared hit / read over all statements. Scans: only workout_entries / workout_sets.

| Scenario | Statements | DB ms (sum) | Slowest ms | Buffers hit | Buffers read | Scans of the big tables |
|---|---:|---:|---:|---:|---:|---|
| S1-records-single-exercise-user | 7 | 293 | 105.85 | 15941 | 0 | Parallel Index Only Scan workout_sets_pr_covering_idx (est 38389 / actual 71106 x3, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Index Scan workout_entries_pkey (est 6 / actual 6) |
| S2-compare-single-exercise-user | 10 | 17.47 | 3.89 | 1050 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 2574 / actual 5576, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 2565 / actual 5983, heap 0)<br>Index Scan workout_sets_pkey (est 22 / actual 22)<br>Bitmap Heap Scan workout_entries (est 22 / actual 22)<br>Bitmap Index Scan workout_entries_pkey (est 22 / actual 22) |

## Table sizes

| Table | Rows | Heap | Indexes | Total |
|---|---:|---|---|---|
| workout_entries | 200000 | 25 MB | 62 MB | 86 MB |
| workout_sets | 899844 | 162 MB | 274 MB | 436 MB |

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
| workout_entries | workout_entries_pkey | 28 | 6832 kB |
| workout_entries | workout_entries_user_id_exercise_id_performed_at_id_idx | 0 | 30 MB |
| workout_entries | workout_entries_user_id_performed_at_id_idx | 0 | 25 MB |
| workout_sets | workout_sets_entry_id_set_number_key | 0 | 45 MB |
| workout_sets | workout_sets_pkey | 28 | 34 MB |
| workout_sets | workout_sets_pr_covering_idx | 15 | 194 MB |
