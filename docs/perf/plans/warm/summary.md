# Query plans (warm)

Generated 2026-10-09T04:25:55.965Z by `npm run perf:plans -- --label warm`.
DB ms = sum of auto_explain durations (EXPLAIN ANALYZE overhead included; statements of one request can
run in parallel). Buffers = shared hit / read over all statements. Scans: only workout_entries / workout_sets.

| Scenario | Statements | DB ms (sum) | Slowest ms | Buffers hit | Buffers read | Scans of the big tables |
|---|---:|---:|---:|---:|---:|---|
| H1-history-first-page | 4 | 0.24 | 0.13 | 90 | 0 | Index Scan workout_entries_user_id_performed_at_id_idx (est 50254 / actual 21)<br>Bitmap Heap Scan workout_sets (est 97 / actual 88)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 88) |
| H2-history-deep-cursor | 4 | 0.25 | 0.12 | 93 | 0 | Bitmap Heap Scan workout_entries (est 21 / actual 20)<br>Bitmap Index Scan workout_entries_user_id_performed_at_id_idx (est 21 / actual 20)<br>Bitmap Heap Scan workout_sets (est 97 / actual 92)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 92) |
| H3-history-partial-name | 5 | 0.3 | 0.13 | 124 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1523 / actual 17 x5)<br>Bitmap Heap Scan workout_sets (est 97 / actual 87)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 87) |
| H4-history-broad-name | 5 | 0.79 | 0.54 | 548 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1523 / actual 12 x51)<br>Bitmap Heap Scan workout_sets (est 97 / actual 89)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 89) |
| H5-history-old-exercise | 5 | 0.22 | 0.13 | 90 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1523 / actual 21)<br>Bitmap Heap Scan workout_sets (est 97 / actual 90)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 90) |
| H6-history-muscle-group | 6 | 0.35 | 0.13 | 166 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1523 / actual 11 x11)<br>Bitmap Heap Scan workout_sets (est 97 / actual 86)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 86) |
| H7-history-range-and-name | 5 | 0.23 | 0.1 | 111 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 40 / actual 14 x5)<br>Bitmap Heap Scan workout_sets (est 97 / actual 87)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 87) |
| H8-history-100-in-lb | 4 | 0.59 | 0.41 | 319 | 0 | Index Scan workout_entries_user_id_performed_at_id_idx (est 50254 / actual 101)<br>Bitmap Heap Scan workout_sets (est 483 / actual 442)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 483 / actual 442) |
| P1-records-largest-exercise | 7 | 82.3 | 30.35 | 4148 | 0 | Parallel Index Only Scan workout_sets_pr_covering_idx (est 22352 / actual 17712 x3, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Bitmap Heap Scan workout_entries (est 6 / actual 6)<br>Bitmap Index Scan workout_entries_pkey (est 6 / actual 6) |
| P2-records-typical-exercises | 7 | 7.71 | 2.6 | 485 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 6060 / actual 5905, heap 0)<br>Index Scan workout_sets_pkey (est 5 / actual 5)<br>Bitmap Heap Scan workout_entries (est 5 / actual 5)<br>Bitmap Index Scan workout_entries_pkey (est 5 / actual 5) |
| P3-records-one-month | 7 | 1.74 | 0.56 | 153 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 1530 / actual 1415, heap 0)<br>Index Scan workout_sets_pkey (est 4 / actual 4)<br>Bitmap Heap Scan workout_entries (est 4 / actual 4)<br>Bitmap Index Scan workout_entries_pkey (est 4 / actual 4) |
| P4-records-plateau | 10 | 1.3 | 0.43 | 769 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 65 / actual 174, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 1 / actual 174, heap 0)<br>Bitmap Heap Scan workout_sets (est 174 / actual 174)<br>Bitmap Index Scan workout_sets_pkey (est 174 / actual 174)<br>Bitmap Heap Scan workout_entries (est 174 / actual 40)<br>Bitmap Index Scan workout_entries_pkey (est 174 / actual 40) |
| P5-records-natural-ties | 8 | 4.5 | 1.35 | 902 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 3461 / actual 3347, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 59 / actual 53, heap 0)<br>Bitmap Heap Scan workout_sets (est 86 / actual 86)<br>Bitmap Index Scan workout_sets_pkey (est 86 / actual 86)<br>Bitmap Heap Scan workout_entries (est 86 / actual 63)<br>Bitmap Index Scan workout_entries_pkey (est 86 / actual 63) |
| P6-records-bodyweight-only | 8 | 0.75 | 0.27 | 182 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 905 / actual 0, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 50 / actual 1, heap 0) |
| P7-records-typical-user | 7 | 3.27 | 1.15 | 213 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 2264 / actual 2147, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Bitmap Heap Scan workout_entries (est 6 / actual 6)<br>Bitmap Index Scan workout_entries_pkey (est 6 / actual 6) |
| P8-records-unknown-name | 3 | 0.41 | 0.4 | 10 | 0 | - |
| C1-compare-months | 10 | 4.12 | 0.81 | 448 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 1530 / actual 1415, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 1527 / actual 1565, heap 0)<br>Index Scan workout_sets_pkey (est 26 / actual 26)<br>Bitmap Heap Scan workout_entries (est 26 / actual 26)<br>Bitmap Index Scan workout_entries_pkey (est 26 / actual 26) |
| W1-post-one-entry | 4 | 0.66 | 0.42 | 60 | 0 | - |
| W2-post-max-bulk | 5 | 77.15 | 42.39 | 31371 | 0 | - |

## Table sizes

| Table | Rows | Heap | Indexes | Total |
|---|---:|---|---|---|
| workout_entries | 150000 | 14 MB | 38 MB | 53 MB |
| workout_sets | 675222 | 89 MB | 182 MB | 271 MB |

## Index usage during this pass (idx_scan since reset)

| Table | Index | Scans | Size |
|---|---|---:|---|
| exercise_muscle_groups | exercise_muscle_groups_muscle_group_code_exercise_id_idx | 1 | 16 kB |
| exercise_muscle_groups | exercise_muscle_groups_pkey | 0 | 16 kB |
| exercise_names | exercise_names_exercise_id_idx | 2 | 16 kB |
| exercise_names | exercise_names_name_key_trgm_idx | 0 | 136 kB |
| exercise_names | exercise_names_pkey | 0 | 16 kB |
| exercises | exercises_name_key | 0 | 16 kB |
| exercises | exercises_pkey | 2 | 16 kB |
| idempotency_keys | idempotency_keys_created_at_idx | 0 | 8192 bytes |
| idempotency_keys | idempotency_keys_pkey | 0 | 8192 bytes |
| muscle_groups | muscle_groups_pkey | 1 | 16 kB |
| workout_entries | workout_entries_pkey | 5155 | 6176 kB |
| workout_entries | workout_entries_user_id_exercise_id_performed_at_id_idx | 73 | 17 MB |
| workout_entries | workout_entries_user_id_performed_at_id_idx | 5 | 15 MB |
| workout_sets | workout_sets_entry_id_set_number_key | 240 | 35 MB |
| workout_sets | workout_sets_pkey | 307 | 27 MB |
| workout_sets | workout_sets_pr_covering_idx | 38 | 120 MB |
