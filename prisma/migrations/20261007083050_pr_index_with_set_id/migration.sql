-- DropIndex
DROP INDEX "workout_sets_pr_covering_idx";

-- CreateIndex
CREATE INDEX "workout_sets_pr_covering_idx" ON "workout_sets"("user_id", "exercise_id", "performed_at", "weight_kg", "reps", "volume_kg", "e1rm_kg", "id");
