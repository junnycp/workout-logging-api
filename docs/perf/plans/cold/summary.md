# Query plans (cold)

Generated 2026-10-09T04:25:52.748Z by `npm run perf:plans -- --label cold`.
DB ms = sum of auto_explain durations (EXPLAIN ANALYZE overhead included; statements of one request can
run in parallel). Buffers = shared hit / read over all statements. Scans: only workout_entries / workout_sets.

| Scenario | Statements | DB ms (sum) | Slowest ms | Buffers hit | Buffers read | Scans of the big tables |
|---|---:|---:|---:|---:|---:|---|
| H1-history-first-page | 4 | 1.37 | 1.02 | 75 | 15 | Index Scan workout_entries_user_id_performed_at_id_idx (est 50200 / actual 21)<br>Bitmap Heap Scan workout_sets (est 97 / actual 88)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 88) |
| H2-history-deep-cursor | 4 | 0.44 | 0.2 | 86 | 7 | Bitmap Heap Scan workout_entries (est 21 / actual 20)<br>Bitmap Index Scan workout_entries_user_id_performed_at_id_idx (est 21 / actual 20)<br>Bitmap Heap Scan workout_sets (est 97 / actual 92)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 92) |
| H3-history-partial-name | 5 | 1.89 | 1.29 | 84 | 40 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1521 / actual 17 x5)<br>Bitmap Heap Scan workout_sets (est 97 / actual 87)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 87) |
| H4-history-broad-name | 5 | 4.34 | 4.14 | 479 | 69 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1521 / actual 12 x51)<br>Bitmap Heap Scan workout_sets (est 97 / actual 89)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 89) |
| H5-history-old-exercise | 5 | 0.58 | 0.49 | 63 | 27 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1521 / actual 21)<br>Bitmap Heap Scan workout_sets (est 97 / actual 90)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 90) |
| H6-history-muscle-group | 6 | 0.61 | 0.25 | 162 | 4 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1521 / actual 11 x11)<br>Bitmap Heap Scan workout_sets (est 97 / actual 86)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 86) |
| H7-history-range-and-name | 5 | 0.27 | 0.13 | 109 | 2 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 40 / actual 14 x5)<br>Bitmap Heap Scan workout_sets (est 97 / actual 87)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 97 / actual 87) |
| H8-history-100-in-lb | 4 | 0.68 | 0.5 | 312 | 7 | Index Scan workout_entries_user_id_performed_at_id_idx (est 50200 / actual 101)<br>Bitmap Heap Scan workout_sets (est 483 / actual 442)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 483 / actual 442) |
| P1-records-largest-exercise | 7 | 548.21 | 188 | 2818 | 1327 | Parallel Index Only Scan workout_sets_pr_covering_idx (est 22182 / actual 17712 x3, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Bitmap Heap Scan workout_entries (est 6 / actual 6)<br>Bitmap Index Scan workout_entries_pkey (est 6 / actual 6) |
| P2-records-typical-exercises | 7 | 58.56 | 19.47 | 328 | 160 | Index Only Scan workout_sets_pr_covering_idx (est 6014 / actual 5905, heap 0)<br>Index Scan workout_sets_pkey (est 5 / actual 5)<br>Bitmap Heap Scan workout_entries (est 5 / actual 5)<br>Bitmap Index Scan workout_entries_pkey (est 5 / actual 5) |
| P3-records-one-month | 7 | 3.04 | 1.47 | 152 | 1 | Index Only Scan workout_sets_pr_covering_idx (est 1518 / actual 1415, heap 0)<br>Index Scan workout_sets_pkey (est 4 / actual 4)<br>Bitmap Heap Scan workout_entries (est 4 / actual 4)<br>Bitmap Index Scan workout_entries_pkey (est 4 / actual 4) |
| P4-records-plateau | 10 | 5.34 | 1.62 | 603 | 166 | Index Only Scan workout_sets_pr_covering_idx (est 64 / actual 174, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 1 / actual 174, heap 0)<br>Bitmap Heap Scan workout_sets (est 174 / actual 174)<br>Bitmap Index Scan workout_sets_pkey (est 174 / actual 174)<br>Bitmap Heap Scan workout_entries (est 174 / actual 40)<br>Bitmap Index Scan workout_entries_pkey (est 174 / actual 40) |
| P5-records-natural-ties | 8 | 36.81 | 11.77 | 625 | 277 | Index Only Scan workout_sets_pr_covering_idx (est 3435 / actual 3347, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 58 / actual 53, heap 0)<br>Bitmap Heap Scan workout_sets (est 86 / actual 86)<br>Bitmap Index Scan workout_sets_pkey (est 86 / actual 86)<br>Bitmap Heap Scan workout_entries (est 86 / actual 63)<br>Bitmap Index Scan workout_entries_pkey (est 86 / actual 63) |
| P6-records-bodyweight-only | 8 | 16.33 | 5.51 | 125 | 57 | Index Only Scan workout_sets_pr_covering_idx (est 898 / actual 0, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 49 / actual 1, heap 0) |
| P7-records-typical-user | 7 | 23.69 | 8.02 | 143 | 70 | Index Only Scan workout_sets_pr_covering_idx (est 2247 / actual 2147, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Bitmap Heap Scan workout_entries (est 6 / actual 6)<br>Bitmap Index Scan workout_entries_pkey (est 6 / actual 6) |
| P8-records-unknown-name | 3 | 0.29 | 0.28 | 13 | 0 | - |
| C1-compare-months | 10 | 3.96 | 0.63 | 413 | 35 | Index Only Scan workout_sets_pr_covering_idx (est 1518 / actual 1415, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 1516 / actual 1565, heap 0)<br>Index Scan workout_sets_pkey (est 26 / actual 26)<br>Bitmap Heap Scan workout_entries (est 26 / actual 26)<br>Bitmap Index Scan workout_entries_pkey (est 26 / actual 26) |
| W1-post-one-entry | 4 | 1.85 | 1.23 | 51 | 15 | - |
| W2-post-max-bulk | 5 | 74.08 | 40.04 | 30466 | 0 | - |

## Table sizes

| Table | Rows | Heap | Indexes | Total |
|---|---:|---|---|---|
| workout_entries | 150000 | 14 MB | 38 MB | 53 MB |
| workout_sets | 675222 | 88 MB | 181 MB | 269 MB |

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
| workout_sets | workout_sets_pr_covering_idx | 38 | 119 MB |
