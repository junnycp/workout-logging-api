# Query plans (cold)

Generated 2026-10-09T03:36:00.118Z by `npm run perf:plans -- --label cold`.
DB ms = sum of auto_explain durations (EXPLAIN ANALYZE overhead included; statements of one request can
run in parallel). Buffers = shared hit / read over all statements. Scans: only workout_entries / workout_sets.

| Scenario | Statements | DB ms (sum) | Slowest ms | Buffers hit | Buffers read | Scans of the big tables |
|---|---:|---:|---:|---:|---:|---|
| H1-history-first-page | 4 | 1.97 | 1.46 | 73 | 16 | Index Scan workout_entries_user_id_performed_at_id_idx (est 49972 / actual 21)<br>Bitmap Heap Scan workout_sets (est 94 / actual 88)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 88) |
| H2-history-deep-cursor | 4 | 0.72 | 0.59 | 83 | 8 | Index Scan workout_entries_user_id_performed_at_id_idx (est 12 / actual 20)<br>Bitmap Heap Scan workout_sets (est 94 / actual 92)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 92) |
| H3-history-partial-name | 5 | 1.67 | 0.98 | 82 | 44 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1514 / actual 17 x5)<br>Bitmap Heap Scan workout_sets (est 94 / actual 87)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 87) |
| H4-history-broad-name | 5 | 2.83 | 2.65 | 485 | 72 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1514 / actual 12 x51)<br>Bitmap Heap Scan workout_sets (est 94 / actual 89)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 89) |
| H5-history-old-exercise | 5 | 3.25 | 3.16 | 63 | 27 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1514 / actual 21)<br>Bitmap Heap Scan workout_sets (est 94 / actual 90)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 90) |
| H6-history-muscle-group | 6 | 0.54 | 0.2 | 190 | 4 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 1514 / actual 11 x11)<br>Bitmap Heap Scan workout_sets (est 94 / actual 86)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 86) |
| H7-history-range-and-name | 5 | 0.41 | 0.22 | 110 | 4 | Index Scan workout_entries_user_id_exercise_id_performed_at_id_idx (est 43 / actual 14 x5)<br>Bitmap Heap Scan workout_sets (est 94 / actual 87)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 94 / actual 87) |
| H8-history-100-in-lb | 4 | 1.19 | 1.03 | 310 | 8 | Index Scan workout_entries_user_id_performed_at_id_idx (est 49972 / actual 101)<br>Bitmap Heap Scan workout_sets (est 471 / actual 442)<br>Bitmap Index Scan workout_sets_entry_id_set_number_key (est 471 / actual 442) |
| P1-records-largest-exercise | 7 | 241.19 | 84.06 | 3016 | 1425 | Parallel Index Only Scan workout_sets_pr_covering_idx (est 38106 / actual 17712 x3, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Bitmap Heap Scan workout_entries (est 6 / actual 6)<br>Bitmap Index Scan workout_entries_pkey (est 6 / actual 6) |
| P2-records-typical-exercises | 7 | 19.01 | 6.55 | 347 | 171 | Index Only Scan workout_sets_pr_covering_idx (est 4526 / actual 5905, heap 0)<br>Index Scan workout_sets_pkey (est 5 / actual 5)<br>Index Scan workout_entries_pkey (est 5 / actual 5) |
| P3-records-one-month | 7 | 1.72 | 0.58 | 155 | 1 | Index Only Scan workout_sets_pr_covering_idx (est 2470 / actual 1415, heap 0)<br>Index Scan workout_sets_pkey (est 4 / actual 4)<br>Index Scan workout_entries_pkey (est 4 / actual 4) |
| P4-records-plateau | 10 | 11.84 | 7.13 | 603 | 168 | Index Only Scan workout_sets_pr_covering_idx (est 49 / actual 174, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 1 / actual 174, heap 0)<br>Bitmap Heap Scan workout_sets (est 174 / actual 174)<br>Bitmap Index Scan workout_sets_pkey (est 174 / actual 174)<br>Bitmap Heap Scan workout_entries (est 174 / actual 40)<br>Bitmap Index Scan workout_entries_pkey (est 174 / actual 40) |
| P5-records-natural-ties | 8 | 20.28 | 8.3 | 636 | 286 | Index Only Scan workout_sets_pr_covering_idx (est 2385 / actual 3347, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 29 / actual 53, heap 0)<br>Bitmap Heap Scan workout_sets (est 86 / actual 86)<br>Bitmap Index Scan workout_sets_pkey (est 86 / actual 86)<br>Bitmap Heap Scan workout_entries (est 86 / actual 63)<br>Bitmap Index Scan workout_entries_pkey (est 86 / actual 63) |
| P6-records-bodyweight-only | 8 | 4.62 | 1.56 | 133 | 59 | Index Only Scan workout_sets_pr_covering_idx (est 686 / actual 0, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 39 / actual 1, heap 0) |
| P7-records-typical-user | 7 | 9.7 | 2.97 | 149 | 69 | Index Only Scan workout_sets_pr_covering_idx (est 3748 / actual 2147, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Bitmap Heap Scan workout_entries (est 6 / actual 6)<br>Bitmap Index Scan workout_entries_pkey (est 6 / actual 6) |
| P8-records-unknown-name | 3 | 0.3 | 0.29 | 13 | 0 | - |
| C1-compare-months | 10 | 5.58 | 2.03 | 414 | 36 | Index Only Scan workout_sets_pr_covering_idx (est 2470 / actual 1415, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 2478 / actual 1565, heap 0)<br>Index Scan workout_sets_pkey (est 26 / actual 26)<br>Bitmap Heap Scan workout_entries (est 26 / actual 26)<br>Bitmap Index Scan workout_entries_pkey (est 26 / actual 26) |
| W1-post-one-entry | 4 | 1.38 | 0.74 | 52 | 22 | - |
| W2-post-max-bulk | 5 | 102.44 | 53.44 | 33870 | 2536 | - |
| S1-records-single-exercise-user | 7 | 326.34 | 108.63 | 6146 | 2977 | Parallel Index Only Scan workout_sets_pr_covering_idx (est 38955 / actual 71106 x3, heap 0)<br>Index Scan workout_sets_pkey (est 6 / actual 6)<br>Bitmap Heap Scan workout_entries (est 6 / actual 6)<br>Bitmap Index Scan workout_entries_pkey (est 6 / actual 6) |
| S2-compare-single-exercise-user | 10 | 16.34 | 3.76 | 635 | 39 | Index Only Scan workout_sets_pr_covering_idx (est 2525 / actual 5576, heap 0)<br>Index Only Scan workout_sets_pr_covering_idx (est 2534 / actual 5983, heap 0)<br>Index Scan workout_sets_pkey (est 22 / actual 22)<br>Bitmap Heap Scan workout_entries (est 22 / actual 22)<br>Bitmap Index Scan workout_entries_pkey (est 22 / actual 22) |

## Table sizes

| Table | Rows | Heap | Indexes | Total |
|---|---:|---|---|---|
| workout_entries | 200011 | 20 MB | 62 MB | 82 MB |
| workout_sets | 899858 | 138 MB | 265 MB | 403 MB |

## Index usage during this pass (idx_scan since reset)

| Table | Index | Scans | Size |
|---|---|---:|---|
| exercise_muscle_groups | exercise_muscle_groups_muscle_group_code_exercise_id_idx | 1 | 16 kB |
| exercise_muscle_groups | exercise_muscle_groups_pkey | 0 | 16 kB |
| exercise_names | exercise_names_exercise_id_idx | 2 | 16 kB |
| exercise_names | exercise_names_name_key_trgm_idx | 0 | 96 kB |
| exercise_names | exercise_names_pkey | 0 | 16 kB |
| exercises | exercises_name_key | 0 | 16 kB |
| exercises | exercises_pkey | 2 | 16 kB |
| idempotency_keys | idempotency_keys_created_at_idx | 0 | 8192 bytes |
| idempotency_keys | idempotency_keys_pkey | 0 | 8192 bytes |
| muscle_groups | muscle_groups_pkey | 1 | 16 kB |
| workout_entries | workout_entries_pkey | 5155 | 6856 kB |
| workout_entries | workout_entries_user_id_exercise_id_performed_at_id_idx | 73 | 29 MB |
| workout_entries | workout_entries_user_id_performed_at_id_idx | 5 | 26 MB |
| workout_sets | workout_sets_entry_id_set_number_key | 240 | 50 MB |
| workout_sets | workout_sets_pkey | 307 | 38 MB |
| workout_sets | workout_sets_pr_covering_idx | 46 | 177 MB |
