-- The exercise catalogue (Inspo W1, Nov 2026).
--
-- coachId NULL = a Repsy stock exercise, shared by every coach and read-only to them. A row with a
-- coachId belongs to that coach.
--
-- Two unique indexes on purpose:
--   exercises_coachId_name_key  is the @@unique([coachId, name]) the Prisma schema declares, so the
--                               schema and the database agree. In Postgres NULL != NULL, so it does
--                               NOT constrain stock rows.
--   exercises_stock_name_key    a partial index Prisma cannot express, which stops the stock
--                               catalogue ever holding the same movement twice.
CREATE TABLE "exercises" (
  "id" TEXT NOT NULL,
  "coachId" TEXT,
  "name" TEXT NOT NULL,
  "equipment" TEXT NOT NULL DEFAULT 'Bodyweight',
  "muscleGroup" TEXT NOT NULL DEFAULT 'Full body',
  "mediaUrl" TEXT NOT NULL DEFAULT '',
  "instructions" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exercises_coachId_idx" ON "exercises"("coachId");
CREATE UNIQUE INDEX "exercises_coachId_name_key" ON "exercises"("coachId", "name");
CREATE UNIQUE INDEX "exercises_stock_name_key" ON "exercises"("name") WHERE "coachId" IS NULL;

ALTER TABLE "exercises" ADD CONSTRAINT "exercises_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The seeded catalogue: 65 movements, so a new coach is never looking at an empty library.
--
-- Ids are literal and deterministic ("stk_back_squat") rather than generated: it keeps this file
-- free of any dependency on a Postgres version or extension for uuid generation, makes a stock
-- movement stably referenceable, and means ON CONFLICT DO NOTHING really is a no-op on a replay.
INSERT INTO "exercises" ("id", "name", "equipment", "muscleGroup", "instructions") VALUES
  ('stk_barbell_bench_press', 'Barbell Bench Press', 'Barbell', 'Chest', 'Lie flat, lower the bar to mid-chest, press up without flaring the elbows past 60 degrees.'),
  ('stk_incline_dumbbell_press', 'Incline Dumbbell Press', 'Dumbbell', 'Chest', 'Bench at 30 degrees. Press the dumbbells up and slightly together.'),
  ('stk_dumbbell_fly', 'Dumbbell Fly', 'Dumbbell', 'Chest', 'Soft elbows, open wide until you feel the stretch, squeeze back together.'),
  ('stk_push_up', 'Push-Up', 'Bodyweight', 'Chest', 'Body in one line from head to heel. Chest to the floor, elbows at 45 degrees.'),
  ('stk_cable_chest_fly', 'Cable Chest Fly', 'Cable', 'Chest', 'Step forward, bring both handles together in front of the chest, control the return.'),
  ('stk_chest_dip', 'Chest Dip', 'Bodyweight', 'Chest', 'Lean the torso forward, lower until the shoulders are level with the elbows.'),
  ('stk_deadlift', 'Deadlift', 'Barbell', 'Back', 'Bar over mid-foot, flat back, push the floor away. Lock out hips and knees together.'),
  ('stk_pull_up', 'Pull-Up', 'Pull up bar', 'Back', 'Hang from a full stretch, pull until the chin clears the bar, lower under control.'),
  ('stk_chin_up', 'Chin-Up', 'Pull up bar', 'Back', 'Underhand grip, shoulder width. Pull the elbows down to the ribs.'),
  ('stk_bent_over_barbell_row', 'Bent Over Barbell Row', 'Barbell', 'Back', 'Hinge to 45 degrees, flat back, row to the lower ribs.'),
  ('stk_lat_pulldown', 'Lat Pulldown', 'Machine', 'Back', 'Pull the bar to the collarbone, chest tall, elbows driving down.'),
  ('stk_seated_cable_row', 'Seated Cable Row', 'Cable', 'Back', 'Tall chest, pull to the belly button, squeeze the shoulder blades.'),
  ('stk_single_arm_dumbbell_row', 'Single Arm Dumbbell Row', 'Dumbbell', 'Back', 'One hand on the bench, flat back, row the dumbbell to the hip.'),
  ('stk_face_pull', 'Face Pull', 'Cable', 'Back', 'Rope to eye height, pull to the forehead, elbows high.'),
  ('stk_overhead_press', 'Overhead Press', 'Barbell', 'Shoulders', 'Brace the ribs down, press overhead, finish with the bar over the mid-foot.'),
  ('stk_seated_dumbbell_shoulder_press', 'Seated Dumbbell Shoulder Press', 'Dumbbell', 'Shoulders', 'Back supported, press up without banging the dumbbells together.'),
  ('stk_lateral_raise', 'Lateral Raise', 'Dumbbell', 'Shoulders', 'Raise to shoulder height with a soft elbow, lead with the elbow not the hand.'),
  ('stk_rear_delt_fly', 'Rear Delt Fly', 'Dumbbell', 'Shoulders', 'Hinge forward, open the arms wide, thumbs down.'),
  ('stk_arnold_press', 'Arnold Press', 'Dumbbell', 'Shoulders', 'Start palms facing you, rotate out as you press overhead.'),
  ('stk_barbell_curl', 'Barbell Curl', 'Barbell', 'Arms', 'Elbows pinned to the ribs, curl without swinging the hips.'),
  ('stk_dumbbell_hammer_curl', 'Dumbbell Hammer Curl', 'Dumbbell', 'Arms', 'Neutral grip throughout, no swing.'),
  ('stk_incline_dumbbell_curl', 'Incline Dumbbell Curl', 'Dumbbell', 'Arms', 'Bench at 45 degrees, arms hanging behind the body for a full stretch.'),
  ('stk_triceps_rope_pushdown', 'Triceps Rope Pushdown', 'Cable', 'Arms', 'Elbows locked at the sides, split the rope at the bottom.'),
  ('stk_skull_crusher', 'Skull Crusher', 'Barbell', 'Arms', 'Lower to the forehead, only the forearms move.'),
  ('stk_close_grip_bench_press', 'Close Grip Bench Press', 'Barbell', 'Arms', 'Hands shoulder width, elbows tucked, press.'),
  ('stk_back_squat', 'Back Squat', 'Barbell', 'Legs', 'Bar on the upper back, break at the hips and knees together, thighs to parallel or below.'),
  ('stk_front_squat', 'Front Squat', 'Barbell', 'Legs', 'Elbows high, bar on the front delts, stay upright.'),
  ('stk_goblet_squat', 'Goblet Squat', 'Dumbbell', 'Legs', 'Hold one dumbbell at the chest, sit between the knees.'),
  ('stk_romanian_deadlift', 'Romanian Deadlift', 'Barbell', 'Legs', 'Soft knees, push the hips back, feel the hamstrings, stop at mid-shin.'),
  ('stk_bulgarian_split_squat', 'Bulgarian Split Squat', 'Dumbbell', 'Legs', 'Rear foot on a bench, drop the back knee straight down.'),
  ('stk_walking_lunge', 'Walking Lunge', 'Dumbbell', 'Legs', 'Long step, back knee to just above the floor, drive through the front heel.'),
  ('stk_leg_press', 'Leg Press', 'Machine', 'Legs', 'Feet shoulder width, lower until the knees reach 90 degrees, do not lock out hard.'),
  ('stk_leg_extension', 'Leg Extension', 'Machine', 'Legs', 'Squeeze at the top for a beat, lower slowly.'),
  ('stk_lying_leg_curl', 'Lying Leg Curl', 'Machine', 'Legs', 'Curl the heels to the glutes, control the negative.'),
  ('stk_standing_calf_raise', 'Standing Calf Raise', 'Machine', 'Legs', 'Full stretch at the bottom, pause at the top.'),
  ('stk_hip_thrust', 'Hip Thrust', 'Barbell', 'Glutes', 'Shoulders on the bench, drive through the heels, squeeze at the top, ribs down.'),
  ('stk_glute_bridge', 'Glute Bridge', 'Bodyweight', 'Glutes', 'Heels close to the glutes, push the hips to the ceiling.'),
  ('stk_cable_kickback', 'Cable Kickback', 'Cable', 'Glutes', 'Hinge slightly, drive the heel back, do not arch the lower back.'),
  ('stk_step_up', 'Step-Up', 'Dumbbell', 'Glutes', 'Box at knee height, drive through the top foot, control the way down.'),
  ('stk_plank', 'Plank', 'Bodyweight', 'Core', 'Elbows under the shoulders, squeeze the glutes, do not let the hips sag.'),
  ('stk_side_plank', 'Side Plank', 'Bodyweight', 'Core', 'Stack the feet and hips, push the floor away.'),
  ('stk_hanging_leg_raise', 'Hanging Leg Raise', 'Pull up bar', 'Core', 'Hang still, raise the legs without swinging.'),
  ('stk_cable_crunch', 'Cable Crunch', 'Cable', 'Core', 'Kneel, crunch the ribs to the hips, hips stay put.'),
  ('stk_russian_twist', 'Russian Twist', 'Medicine ball', 'Core', 'Feet off the floor, rotate the ribs not just the arms.'),
  ('stk_dead_bug', 'Dead Bug', 'Bodyweight', 'Core', 'Lower back glued to the floor, opposite arm and leg.'),
  ('stk_ab_wheel_rollout', 'Ab Wheel Rollout', 'Other', 'Core', 'Roll out only as far as you can keep the lower back flat.'),
  ('stk_mountain_climber', 'Mountain Climber', 'Bodyweight', 'Core', 'Plank position, drive the knees in fast, hips stay low.'),
  ('stk_burpee', 'Burpee', 'Bodyweight', 'Full body', 'Chest to the floor, jump the feet in, jump up with a clap overhead.'),
  ('stk_kettlebell_swing', 'Kettlebell Swing', 'Kettlebell', 'Full body', 'Hinge not squat, snap the hips, the bell floats to chest height.'),
  ('stk_thruster', 'Thruster', 'Barbell', 'Full body', 'Front squat into an overhead press in one movement.'),
  ('stk_clean_and_press', 'Clean and Press', 'Barbell', 'Full body', 'Pull from the floor to the shoulders, then press overhead.'),
  ('stk_turkish_get_up', 'Turkish Get-Up', 'Kettlebell', 'Full body', 'Slow and deliberate, eyes on the bell the whole way up.'),
  ('stk_farmer_s_carry', 'Farmer''s Carry', 'Dumbbell', 'Full body', 'Tall posture, shoulders back, walk without leaning.'),
  ('stk_battle_ropes', 'Battle Ropes', 'Other', 'Full body', 'Athletic stance, fast alternating waves.'),
  ('stk_box_jump', 'Box Jump', 'Bodyweight', 'Full body', 'Land soft with bent knees, step back down.'),
  ('stk_treadmill_run', 'Treadmill Run', 'Machine', 'Cardio', 'Hold the target pace. Note the distance and time.'),
  ('stk_stationary_bike', 'Stationary Bike', 'Machine', 'Cardio', 'Hold the target cadence or watts.'),
  ('stk_rowing_machine', 'Rowing Machine', 'Machine', 'Cardio', 'Legs, then back, then arms. Reverse on the way in.'),
  ('stk_jump_rope', 'Jump Rope', 'Other', 'Cardio', 'Small bounces off the balls of the feet, wrists do the work.'),
  ('stk_incline_walk', 'Incline Walk', 'Machine', 'Cardio', 'Set the incline, no holding the handles.'),
  ('stk_jumping_jacks', 'Jumping Jacks', 'Bodyweight', 'Cardio', 'Full range, arms all the way overhead.'),
  ('stk_cat_cow', 'Cat Cow', 'Bodyweight', 'Mobility', 'Move slowly with the breath through the full spine.'),
  ('stk_world_s_greatest_stretch', 'World''s Greatest Stretch', 'Bodyweight', 'Mobility', 'Lunge, elbow to instep, then rotate open to the ceiling.'),
  ('stk_couch_stretch', 'Couch Stretch', 'Bodyweight', 'Mobility', 'Back foot elevated, squeeze the glute, stay tall.'),
  ('stk_thoracic_rotation', 'Thoracic Rotation', 'Bodyweight', 'Mobility', 'On all fours, hand behind the head, rotate open and follow with the eyes.')
ON CONFLICT DO NOTHING;
