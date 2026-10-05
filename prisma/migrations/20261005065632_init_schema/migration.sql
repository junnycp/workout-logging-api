-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "MuscleRole" AS ENUM ('primary', 'secondary');

-- CreateTable
CREATE TABLE "muscle_groups" (
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,

    CONSTRAINT "muscle_groups_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exercises" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercise_names" (
    "name_key" VARCHAR(100) NOT NULL,
    "exercise_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "exercise_names_pkey" PRIMARY KEY ("name_key")
);

-- CreateTable
CREATE TABLE "exercise_muscle_groups" (
    "exercise_id" UUID NOT NULL,
    "muscle_group_code" VARCHAR(32) NOT NULL,
    "role" "MuscleRole" NOT NULL,

    CONSTRAINT "exercise_muscle_groups_pkey" PRIMARY KEY ("exercise_id","muscle_group_code")
);

-- CreateTable
CREATE TABLE "workout_entries" (
    "id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "exercise_id" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ(3) NOT NULL,
    "utc_offset_minutes" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_sets" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "set_number" SMALLINT NOT NULL,
    "reps" INTEGER NOT NULL,
    "weight" DECIMAL(8,3) NOT NULL,
    "unit" VARCHAR(16) NOT NULL,
    "weight_kg" DECIMAL(10,4) NOT NULL,
    "volume_kg" DECIMAL(12,4) NOT NULL,
    "e1rm_kg" DECIMAL(10,4) NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "exercise_id" UUID NOT NULL,
    "performed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "workout_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "user_id" VARCHAR(64) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_status" SMALLINT NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercises_name_key" ON "exercises"("name");

-- CreateIndex
CREATE INDEX "exercise_names_exercise_id_idx" ON "exercise_names"("exercise_id");

-- CreateIndex
CREATE INDEX "exercise_names_name_key_trgm_idx" ON "exercise_names" USING GIN ("name_key" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "exercise_muscle_groups_muscle_group_code_exercise_id_idx" ON "exercise_muscle_groups"("muscle_group_code", "exercise_id");

-- CreateIndex
CREATE INDEX "workout_entries_user_id_performed_at_id_idx" ON "workout_entries"("user_id", "performed_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "workout_entries_user_id_exercise_id_performed_at_id_idx" ON "workout_entries"("user_id", "exercise_id", "performed_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "workout_sets_pr_covering_idx" ON "workout_sets"("user_id", "exercise_id", "performed_at", "weight_kg", "reps", "volume_kg", "e1rm_kg");

-- CreateIndex
CREATE UNIQUE INDEX "workout_sets_entry_id_set_number_key" ON "workout_sets"("entry_id", "set_number");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- AddForeignKey
ALTER TABLE "exercise_names" ADD CONSTRAINT "exercise_names_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_muscle_groups" ADD CONSTRAINT "exercise_muscle_groups_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_muscle_groups" ADD CONSTRAINT "exercise_muscle_groups_muscle_group_code_fkey" FOREIGN KEY ("muscle_group_code") REFERENCES "muscle_groups"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_entries" ADD CONSTRAINT "workout_entries_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "workout_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added before first apply (Prisma cannot express CHECK constraints; it ignores them when diffing).
-- Last line of defence: the API validates the same rules first and returns field-level errors.
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_reps_positive" CHECK ("reps" > 0);
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_weight_non_negative" CHECK ("weight" >= 0 AND "weight_kg" >= 0);
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_set_number_positive" CHECK ("set_number" > 0);
ALTER TABLE "workout_entries" ADD CONSTRAINT "workout_entries_utc_offset_range" CHECK ("utc_offset_minutes" BETWEEN -840 AND 840);
