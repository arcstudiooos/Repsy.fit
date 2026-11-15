-- More stock exercises and foods (Nov 2026).
--
-- Takes the shared catalogues past 100 each: 65 -> 117 exercises, 80 -> 101 foods.
--
-- WHY ON CONFLICT DO NOTHING: "exercises" has @@unique([coachId, name]), and these rows are seeded
-- by id. If a later migration or a re-run ever touches the same row, the deploy must not die - a
-- failed migration stops the server entirely, because the start command is
-- `prisma migrate deploy && node dist/index.js`.
--
-- Four exercises and eleven foods from the first draft of this batch were DROPPED before committing
-- because they duplicated rows that already existed (Pull-Up, Chin-Up, Hanging Leg Raise, Russian
-- Twist; Ghee, Samosa, Guava, Almonds and others). The unique index would have rejected them.
--
-- Every food's macros were checked arithmetically: protein*4 + carbs*4 + fat*9 is within 20% of the
-- stated calories for all 21 rows.

INSERT INTO "exercises" ("id", "name", "equipment", "muscleGroup", "instructions") VALUES
  ('stk_inverted_row', 'Inverted Row', 'Barbell', 'Back', 'Set the bar at hip height, keep a straight line from heel to head, pull your sternum to the bar and squeeze 1 second.'),
  ('stk_t_bar_row', 'T-Bar Row', 'Barbell', 'Back', 'Hinge to about 45 degrees, row to your lower ribs with elbows tucked, lower slowly; do not jerk with the lower back.'),
  ('stk_pendlay_row', 'Pendlay Row', 'Barbell', 'Back', 'Reset the bar on the floor each rep, keep the torso parallel, row explosively to the belly without lifting the chest.'),
  ('stk_straight_arm_pulldown', 'Straight Arm Pulldown', 'Cable', 'Back', 'Hinge slightly, arms long, sweep the bar to your thighs using the lats only; keep the elbows locked soft, not bent.'),
  ('stk_band_pull_apart', 'Band Pull-Apart', 'Resistance band', 'Back', 'Arms straight at chest height, pull the band apart until it touches your chest, squeeze the shoulder blades, return slowly.'),
  ('stk_dead_hang', 'Dead Hang', 'Pull up bar', 'Back', 'Hang with shoulders slightly packed, not fully loose, breathe through the nose and hold for time without swinging.'),
  ('stk_barbell_shrug', 'Barbell Shrug', 'Barbell', 'Back', 'Shrug straight up to the ears, pause 1 second at the top, lower under control; never roll the shoulders backwards.'),
  ('stk_good_morning', 'Good Morning', 'Barbell', 'Legs', 'Bar on the upper back, push hips back with soft knees until hamstrings stretch, stand tall; stop if the spine rounds.'),
  ('stk_hack_squat', 'Hack Squat', 'Machine', 'Legs', 'Feet shoulder width on the platform, descend until thighs pass parallel, drive through mid-foot; keep the hips on the pad.'),
  ('stk_sissy_squat', 'Sissy Squat', 'Bodyweight', 'Legs', 'Hold support, rise onto the balls of your feet and lean back lowering the knees forward; stop before any knee pinching.'),
  ('stk_nordic_hamstring_curl', 'Nordic Hamstring Curl', 'Bodyweight', 'Legs', 'Anchor the ankles, lower the torso as slowly as possible staying in one line, catch with the hands and push back up.'),
  ('stk_pistol_squat', 'Pistol Squat', 'Bodyweight', 'Legs', 'Stand on one leg, other leg forward, sit down slowly to full depth and stand without letting the knee cave inward.'),
  ('stk_seated_calf_raise', 'Seated Calf Raise', 'Machine', 'Legs', 'Knees under the pad, drop the heels for a full stretch, press up onto the toes, pause 2 seconds; no bouncing.'),
  ('stk_reverse_lunge', 'Reverse Lunge', 'Bodyweight', 'Legs', 'Step straight back, drop the back knee to just above the floor, drive through the front heel; keep the torso upright.'),
  ('stk_wall_sit', 'Wall Sit', 'Bodyweight', 'Legs', 'Back flat on the wall, thighs parallel to the floor, knees over the ankles, hold for time and breathe steadily.'),
  ('stk_hip_abduction_machine', 'Hip Abduction Machine', 'Machine', 'Glutes', 'Sit tall, push the knees out against the pads, pause 1 second at the end range, return slowly without slamming the stack.'),
  ('stk_clamshell', 'Clamshell', 'Resistance band', 'Glutes', 'Band above the knees, lie on your side with heels together, open the top knee only; keep the hips stacked and still.'),
  ('stk_monster_walk', 'Monster Walk', 'Resistance band', 'Glutes', 'Band above the knees, quarter squat, step wide side to side keeping tension; do not let the knees collapse inwards.'),
  ('stk_single_leg_glute_bridge', 'Single Leg Glute Bridge', 'Bodyweight', 'Glutes', 'One foot planted, other knee hugged in, drive the hips up until the body is level, squeeze 2 seconds at the top.'),
  ('stk_pallof_press', 'Pallof Press', 'Cable', 'Core', 'Stand side on to the cable, press the handle straight out and resist the rotation for 2 seconds; keep the ribs down.'),
  ('stk_bird_dog', 'Bird Dog', 'Bodyweight', 'Core', 'From all fours extend the opposite arm and leg long, hold 2 seconds; keep the hips level and the lower back quiet.'),
  ('stk_hollow_hold', 'Hollow Hold', 'Bodyweight', 'Core', 'Press the low back into the floor, lift the shoulders and legs, arms overhead; lower the legs if the back arches.'),
  ('stk_flutter_kick', 'Flutter Kick', 'Bodyweight', 'Core', 'Low back pressed down, hands under the hips, alternate small fast kicks with straight legs; keep the heels off the floor.'),
  ('stk_preacher_curl', 'Preacher Curl', 'Barbell', 'Arms', 'Chest on the pad, curl with the upper arms fixed, lower to near full extension over 3 seconds; do not lift off the pad.'),
  ('stk_concentration_curl', 'Concentration Curl', 'Dumbbell', 'Arms', 'Elbow braced inside the thigh, curl slowly to a hard squeeze, lower fully; no swinging and no shoulder movement.'),
  ('stk_reverse_curl', 'Reverse Curl', 'Barbell', 'Arms', 'Palms down shoulder width, curl with the wrists straight and elbows pinned to the ribs, lower over 3 seconds.'),
  ('stk_wrist_curl', 'Wrist Curl', 'Dumbbell', 'Arms', 'Forearms on the thighs palms up, let the wrists drop fully, curl the weight up and pause 1 second; small range, slow tempo.'),
  ('stk_overhead_triceps_extension', 'Overhead Triceps Extension', 'Dumbbell', 'Arms', 'Elbows pointing forward and close, lower the weight behind the head until the triceps stretch, press up without flaring.'),
  ('stk_dumbbell_triceps_kickback', 'Dumbbell Triceps Kickback', 'Dumbbell', 'Arms', 'Hinge over, upper arm locked parallel to the floor, straighten the elbow and squeeze 1 second; keep the shoulder still.'),
  ('stk_diamond_push_up', 'Diamond Push-Up', 'Bodyweight', 'Arms', 'Hands together under the chest forming a diamond, elbows brushing the ribs, lower to touch the hands, press up strong.'),
  ('stk_upright_row', 'Upright Row', 'Barbell', 'Shoulders', 'Grip just outside the hips, pull the bar to the lower chest leading with the elbows; stop at chest height, no higher.'),
  ('stk_landmine_press', 'Landmine Press', 'Barbell', 'Shoulders', 'Stagger the stance, press the barbell end up and slightly forward, brace the ribs down; avoid leaning back to finish.'),
  ('stk_push_press', 'Push Press', 'Barbell', 'Shoulders', 'Dip the knees a few inches, drive the legs and punch the bar overhead, lock it behind the ears; one dip only per rep.'),
  ('stk_pike_push_up', 'Pike Push-Up', 'Bodyweight', 'Shoulders', 'Hips high, head between the hands, lower the crown towards the floor and press back up; keep the legs straight.'),
  ('stk_dumbbell_pullover', 'Dumbbell Pullover', 'Dumbbell', 'Chest', 'Lie on a bench, lower one dumbbell behind the head with soft elbows until the chest stretches, pull it back over the face.'),
  ('stk_machine_chest_press', 'Machine Chest Press', 'Machine', 'Chest', 'Set the handles at nipple height, press until the elbows are nearly straight, return slowly to a light chest stretch.'),
  ('stk_decline_push_up', 'Decline Push-Up', 'Bodyweight', 'Chest', 'Feet elevated on a bench or chair, body in one line, lower the chest to the floor and press up; keep the hips from sagging.'),
  ('stk_squat_jump', 'Squat Jump', 'Bodyweight', 'Full body', 'Quarter squat then jump as high as you can, land softly on the mid-foot with bent knees; reset fully between reps.'),
  ('stk_broad_jump', 'Broad Jump', 'Bodyweight', 'Full body', 'Swing the arms, jump forward for distance, stick the landing with hips back and knees soft; quality over number of reps.'),
  ('stk_bear_crawl', 'Bear Crawl', 'Bodyweight', 'Full body', 'Knees an inch off the floor, move opposite hand and foot together in small steps; keep the hips low and level.'),
  ('stk_sled_push', 'Sled Push', 'Machine', 'Full body', 'Low body lean with straight arms, drive short powerful steps, keep the hips below the shoulders and never stop mid-length.'),
  ('stk_dumbbell_snatch', 'Dumbbell Snatch', 'Dumbbell', 'Full body', 'Hinge to the floor, drive the hips and punch one dumbbell overhead in one motion, lock the elbow; lower under control.'),
  ('stk_stair_climber', 'Stair Climber', 'Machine', 'Cardio', 'Stand tall off the rails, take full steps on the whole foot, keep a conversational pace; do not lean on the handles.'),
  ('stk_elliptical_trainer', 'Elliptical Trainer', 'Machine', 'Cardio', 'Stand upright, push and pull through the handles, keep the heels down and a steady cadence for the full interval.'),
  ('stk_high_knees', 'High Knees', 'Bodyweight', 'Cardio', 'Run in place driving the knees to hip height on the balls of the feet, arms pumping; stay tall, do not lean back.'),
  ('stk_skater_hops', 'Skater Hops', 'Bodyweight', 'Cardio', 'Bound side to side landing on one leg, touch down softly and hold balance a beat before the next jump.'),
  ('stk_pigeon_pose', 'Pigeon Pose', 'Bodyweight', 'Mobility', 'Front shin across the mat, hips square, fold forward and breathe into the glute for 60 seconds per side; no knee pain.'),
  ('stk_childs_pose', 'Child''s Pose', 'Bodyweight', 'Mobility', 'Knees wide, hips to the heels, arms long, let the chest sink and take slow deep breaths for 60 seconds.'),
  ('stk_downward_dog', 'Downward Dog', 'Bodyweight', 'Mobility', 'Hips high, hands pressing away, pedal the heels towards the floor with straight legs; keep the back long, not rounded.'),
  ('stk_90_90_hip_switch', '90/90 Hip Switch', 'Bodyweight', 'Mobility', 'Sit with both knees bent at 90 degrees, rotate the knees to the other side without using the hands, pause each end range.'),
  ('stk_ankle_dorsiflexion_stretch', 'Ankle Dorsiflexion Stretch', 'Bodyweight', 'Mobility', 'Knee over the toes against a wall with the heel glued down, press forward 20 slow reps per side; no heel lifting.'),
  ('stk_standing_hamstring_stretch', 'Standing Hamstring Stretch', 'Bodyweight', 'Mobility', 'Heel on a low step, hinge from the hips with a flat back until the hamstring pulls, hold 30 seconds per side.')
ON CONFLICT DO NOTHING;

INSERT INTO "foods" ("id", "coachId", "name", "category", "servingLabel", "servingG", "calories", "proteinG", "carbsG", "fatG", "fiberG") VALUES
  ('fd_upma_rava', NULL, 'Upma (rava)', 'Grains', '1 bowl', 200, 250, 6.0, 36.0, 9.0, 2.5),
  ('fd_khichdi_moong_dal', NULL, 'Khichdi (moong dal)', 'Grains', '1 bowl', 250, 255, 9.0, 40.0, 6.0, 4.0),
  ('fd_bajra_roti', NULL, 'Bajra roti', 'Grains', '1 roti', 45, 120, 3.5, 22.0, 1.6, 2.6),
  ('fd_jowar_roti', NULL, 'Jowar roti', 'Grains', '1 roti', 45, 115, 3.2, 22.5, 1.0, 2.2),
  ('fd_lemon_rice', NULL, 'Lemon rice', 'Grains', '1 bowl', 180, 300, 5.2, 47.0, 10.0, 1.8),
  ('fd_curd_rice', NULL, 'Curd rice', 'Grains', '1 bowl', 200, 240, 7.0, 38.0, 6.0, 1.0),
  ('fd_besan_chilla', NULL, 'Besan chilla', 'Pulses', '1 chilla', 90, 160, 7.0, 17.0, 7.0, 3.0),
  ('fd_chole_chickpea_curry', NULL, 'Chole (chickpea curry)', 'Pulses', '1 bowl', 200, 250, 11.0, 30.0, 9.0, 9.0),
  ('fd_masoor_dal', NULL, 'Masoor dal', 'Pulses', '1 bowl', 180, 145, 9.0, 19.0, 3.5, 5.0),
  ('fd_chana_dal', NULL, 'Chana dal', 'Pulses', '1 bowl', 180, 165, 10.0, 22.0, 4.0, 6.0),
  ('fd_soya_chunks_cooked', NULL, 'Soya chunks (cooked)', 'Pulses', '1 bowl', 150, 165, 25.0, 10.0, 1.5, 4.0),
  ('fd_sprouts_moong', NULL, 'Sprouts (moong)', 'Pulses', '1 bowl', 100, 100, 8.0, 14.0, 0.5, 4.5),
  ('fd_tofu', NULL, 'Tofu', 'Pulses', '100 g', 100, 145, 15.0, 4.0, 8.0, 1.0),
  ('fd_rohu_fish_curry', NULL, 'Rohu fish curry', 'Meat and fish', '1 bowl', 150, 205, 20.0, 5.0, 11.0, 1.0),
  ('fd_bhindi_sabzi', NULL, 'Bhindi sabzi', 'Vegetables', '1 bowl', 150, 120, 2.5, 9.0, 8.0, 4.0),
  ('fd_baingan_bharta', NULL, 'Baingan bharta', 'Vegetables', '1 bowl', 150, 130, 2.2, 10.0, 9.0, 4.5),
  ('fd_papaya_cubes', NULL, 'Papaya (cubes)', 'Fruit', '1 bowl', 150, 65, 0.7, 16.0, 0.4, 2.5),
  ('fd_pomegranate_seeds', NULL, 'Pomegranate seeds', 'Fruit', '1 bowl', 150, 125, 2.5, 29.0, 1.8, 6.0),
  ('fd_whey_protein_scoop', NULL, 'Whey protein (1 scoop)', 'Supplements and drinks', '1 scoop', 30, 120, 24.0, 3.0, 1.5, 0.0),
  ('fd_peanut_chikki', NULL, 'Peanut chikki', 'Snacks and sweets', '1 piece', 25, 120, 3.5, 13.0, 6.0, 1.2),
  ('fd_jaggery', NULL, 'Jaggery', 'Snacks and sweets', '1 tbsp', 15, 57, 0.1, 14.0, 0.1, 0.0)
ON CONFLICT DO NOTHING;
