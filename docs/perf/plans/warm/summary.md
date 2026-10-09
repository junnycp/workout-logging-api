# Query plans (warm)

Generated 2026-10-09T03:54:39.358Z by `npm run perf:plans -- --label warm`.
DB ms = sum of auto_explain durations (EXPLAIN ANALYZE overhead included; statements of one request can
run in parallel). Buffers = shared hit / read over all statements. Scans: only workout_entries / workout_sets.

| Scenario | Statements | DB ms (sum) | Slowest ms | Buffers hit | Buffers read | Scans of the big tables |
|---|---:|---:|---:|---:|---:|---|
| H1-history-first-page | 4 | 0.3 | 0.14 | 90 | 0 | Index Scan workout_entries_user_id_performed_at_id_idx (est 49299 / actual 21)<br>Bitmap Heap Scan workout_sets (est 94 / actual 88)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 88) |
| H2-history-deep-cursor | 4 | 0.27 | 0.12 | 94 | 0 | Bitmap Heap Scan workout_entries (est 19 / actual 20)<br>Bitmap Index Scan workout_entries_user_id_performed_at_id_idx (est 19 / actual 20)<br>Bitmap Heap Scan workout_sets (est 94 / actual 92)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 92) |
| H3-history-partial-name | 5 | 0.33 | 0.12 | 126 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1494 / actual 17 x5)<br>Bitmap Heap Scan workout_sets (est 94 / actual 87)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 87) |
| H4-history-broad-name | 5 | 0.84 | 0.56 | 560 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1494 / actual 12 x51)<br>Bitmap Heap Scan workout_sets (est 94 / actual 89)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 89) |
| H5-history-old-exercise | 5 | 0.24 | 0.15 | 90 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1494 / actual 21)<br>Bitmap Heap Scan workout_sets (est 94 / actual 90)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 90) |
| H6-history-muscle-group | 6 | 0.33 | 0.14 | 205 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1494 / actual 11 x11)<br>Bitmap Heap Scan workout_sets (est 94 / actual 86)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 86) |
| H7-history-range-and-name | 5 | 0.26 | 0.12 | 113 | 0 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 44 / actual 14 x5)<br>Bitmap Heap Scan workout_sets (est 94 / actual 87)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 87) |
| H8-history-100-in-lb | 4 | 0.62 | 0.45 | 319 | 0 | Index Scan workout_entries_user_id_performed_at_id_idx (est 49299 / actual 101)<br>Bitmap Heap Scan workout_sets (est 471 / actual 442)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 471 / actual 442) |
| P1-records-largest-exercise | 7 | 89.84 | 33.47 | 5815 | 1 | Parallel Index Only Scan workout_sets_pr_covering_idx (est 22035 / actual 17712 x3, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Index Scan workout_entries_pkey (est 6 / actual 6) |
| P2-records-typical-exercises | 7 | 9.48 | 3.77 | 653 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 6106 / actual 5905, heap 0)<br>Index Scan workout_sets_pkey (est 5 / actual 5)<br>Index Scan workout_entries_pkey (est 5 / actual 5) |
| P3-records-one-month | 7 | 1.77 | 0.58 | 156 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 1446 / actual 1415, heap 0)<br>Index Scan workout_sets_pkey (est 4 / actual 4)<br>Index Scan workout_entries_pkey (est 4 / actual 4) |
| P4-records-plateau | 10 | 1.24 | 0.41 | 781 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 50 / actual 174, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 1 / actual 174, heap 0)<br>Bitmap Heap Scan workout_sets (est 174 / actual 174)<br>Bitmap Index Scan workout_sets_pkey (est 174 / actual 174)<br>Bitmap Heap Scan workout_entries (est 174 / actual 40)<br>Bitmap Index Scan workout_entries_pkey (est 174 / actual 40) |
| P5-records-natural-ties | 8 | 6.27 | 2.75 | 1023 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 3414 / actual 3347, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 55 / actual 53, heap 0)<br>Bitmap Heap Scan workout_sets (est 86 / actual 86)<br>Bitmap Index Scan workout_sets_pkey (est 86 / actual 86)<br>Bitmap Heap Scan workout_entries (est 86 / actual 63)<br>Bitmap Index Scan workout_entries_pkey (est 86 / actual 63) |
| P6-records-bodyweight-only | 8 | 0.69 | 0.23 | 240 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 859 / actual 0, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 50 / actual 1, heap 0) |
| P7-records-typical-user | 7 | 3.46 | 1.32 | 217 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 2232 / actual 2147, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Index Scan workout_entries_pkey (est 6 / actual 6) |
| P8-records-unknown-name | 3 | 0.37 | 0.36 | 10 | 0 | - |
| C1-compare-months | 10 | 5.37 | 1.79 | 451 | 0 | Index Only Scan workout_sets_pr_covering_idx (est 1446 / actual 1415, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 1490 / actual 1565, heap 0)<br>Index Scan workout_sets_pkey (est 26 / actual 26)<br>Bitmap Heap Scan workout_entries (est 26 / actual 26)<br>Bitmap Index Scan workout_entries_pkey (est 26 / actual 26) |
| W1-post-one-entry | 4 | 0.64 | 0.38 | 66 | 1 | - |
| W2-post-max-bulk | 5 | 80.78 | 46.21 | 36976 | 220 | - |

## Table sizes

| Table | Rows | Heap | Indexes | Total |
|---|---:|---|---|---|
| workout_entries | 150011 | 27 MB | 62 MB | 89 MB |
| workout_sets | 675236 | 178 MB | 282 MB | 460 MB |

## Index usage during this pass (idx_scan since reset)

| Table | Index | Scans | Size |
|---|---|---:|---|
| exercise_muscle_groups | exercise_muscle_groups_muscle_group_code_exercise_id_idx | 1 | 40 kB |
| exercise_muscle_groups | exercise_muscle_groups_pkey | 0 | 16 kB |
| exercise_names | exercise_names_exercise_id_idx | 2 | 16 kB |
| exercise_names | exercise_names_name_key_trgm_idx | 0 | 136 kB |
| exercise_names | exercise_names_pkey | 0 | 16 kB |
| exercises | exercises_name_key | 0 | 16 kB |
| exercises | exercises_pkey | 2 | 16 kB |
| idempotency_keys | idempotency_keys_created_at_idx | 0 | 8192 bytes |
| idempotency_keys | idempotency_keys_pkey | 0 | 8192 bytes |
| muscle_groups | muscle_groups_pkey | 1 | 16 kB |
| workout_entries | workout_entries_pkey | 5155 | 6864 kB |
| workout_entries | workout_entries_user_id_exercise_id_performed_at_id_idx | 73 | 29 MB |
| workout_entries | workout_entries_user_id_performed_at_id_idx | 5 | 26 MB |
| workout_sets | workout_sets_entry_id_set_number_key | 240 | 51 MB |
| workout_sets | workout_sets_pkey | 307 | 39 MB |
| workout_sets | workout_sets_pr_covering_idx | 38 | 192 MB |
