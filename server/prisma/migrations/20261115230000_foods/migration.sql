-- The food catalogue (Inspo N1, Nov 2026).
--
-- The atom a meal is built from. Numbers are PER SERVING, with the serving spelled out in words
-- ("1 roti", "1 cup") AND its weight in grams: a coach thinks in rotis, and a gram figure alone is
-- unusable at the counter.
--
-- `coachId` NULL = a Repsy stock food, shared and read-only, exactly like a stock exercise. Ids are
-- literal and deterministic (fd_roti_whole_wheat), so a replay is a true no-op, a stock food stays
-- referenceable, and nothing depends on a Postgres uuid extension.
--
-- The 80 seeded foods are India-first on purpose: roti, dal, idli, poha, paneer, chaas. A catalogue
-- that opens with "1% Fat Milk" is useless to the coaches Repsy is for.
--
-- These figures are ordinary published food values, rounded, and a coach can edit a copy of any of
-- them. They are a starting point, not a claim of laboratory accuracy.
CREATE TABLE "foods" (
  "id" TEXT NOT NULL,
  "coachId" TEXT,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "servingLabel" TEXT NOT NULL,
  "servingG" DOUBLE PRECISION NOT NULL,
  "calories" INTEGER NOT NULL,
  "proteinG" DOUBLE PRECISION NOT NULL,
  "carbsG" DOUBLE PRECISION NOT NULL,
  "fatG" DOUBLE PRECISION NOT NULL,
  "fiberG" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "foods_coachId_idx" ON "foods"("coachId");
CREATE INDEX "foods_category_idx" ON "foods"("category");
-- A coach cannot have two foods with the same name; stock names are unique among themselves.
CREATE UNIQUE INDEX "foods_coachId_name_key" ON "foods"("coachId", "name");
CREATE UNIQUE INDEX "foods_stock_name_key" ON "foods"("name") WHERE "coachId" IS NULL;

ALTER TABLE "foods" ADD CONSTRAINT "foods_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "foods" ("id", "coachId", "name", "category", "servingLabel", "servingG", "calories", "proteinG", "carbsG", "fatG", "fiberG") VALUES
  ('fd_roti_whole_wheat', NULL, 'Roti (whole wheat)', 'Grains', '1 roti', 40, 104, 3.4, 20.0, 1.0, 2.7)
,  ('fd_chapati_with_ghee', NULL, 'Chapati with ghee', 'Grains', '1 chapati', 45, 140, 3.5, 20.5, 4.5, 2.7)
,  ('fd_paratha_plain', NULL, 'Paratha (plain)', 'Grains', '1 paratha', 60, 210, 5.0, 27.0, 8.5, 3.0)
,  ('fd_white_rice_cooked', NULL, 'White rice, cooked', 'Grains', '1 cup', 158, 205, 4.3, 44.5, 0.4, 0.6)
,  ('fd_brown_rice_cooked', NULL, 'Brown rice, cooked', 'Grains', '1 cup', 195, 216, 5.0, 44.8, 1.8, 3.5)
,  ('fd_idli', NULL, 'Idli', 'Grains', '2 idli', 100, 116, 3.9, 24.0, 0.5, 1.2)
,  ('fd_dosa_plain', NULL, 'Dosa (plain)', 'Grains', '1 dosa', 80, 133, 3.0, 22.0, 3.7, 1.0)
,  ('fd_poha_cooked', NULL, 'Poha, cooked', 'Grains', '1 cup', 180, 250, 4.0, 45.0, 6.0, 2.0)
,  ('fd_upma', NULL, 'Upma', 'Grains', '1 cup', 180, 230, 5.0, 35.0, 8.0, 2.5)
,  ('fd_oats_dry', NULL, 'Oats, dry', 'Grains', '1/2 cup', 40, 150, 5.3, 27.0, 2.6, 4.0)
,  ('fd_bread_whole_wheat', NULL, 'Bread, whole wheat', 'Grains', '1 slice', 28, 69, 3.6, 11.6, 1.1, 1.9)
,  ('fd_quinoa_cooked', NULL, 'Quinoa, cooked', 'Grains', '1 cup', 185, 222, 8.1, 39.4, 3.6, 5.2)
,  ('fd_toor_dal_cooked', NULL, 'Toor dal, cooked', 'Pulses', '1 cup', 200, 210, 12.0, 34.0, 1.0, 10.0)
,  ('fd_moong_dal_cooked', NULL, 'Moong dal, cooked', 'Pulses', '1 cup', 200, 212, 14.2, 38.7, 0.8, 15.4)
,  ('fd_chana_masala', NULL, 'Chana masala', 'Pulses', '1 cup', 240, 270, 13.0, 45.0, 4.0, 12.0)
,  ('fd_rajma_cooked', NULL, 'Rajma, cooked', 'Pulses', '1 cup', 177, 225, 15.3, 40.4, 0.9, 13.1)
,  ('fd_chickpeas_boiled', NULL, 'Chickpeas, boiled', 'Pulses', '1 cup', 164, 269, 14.5, 45.0, 4.2, 12.5)
,  ('fd_sambar', NULL, 'Sambar', 'Pulses', '1 cup', 240, 150, 7.0, 22.0, 3.5, 5.0)
,  ('fd_sprouted_moong', NULL, 'Sprouted moong', 'Pulses', '1 cup', 104, 31, 3.0, 6.0, 0.2, 1.9)
,  ('fd_paneer', NULL, 'Paneer', 'Dairy and eggs', '100 g', 100, 265, 18.3, 1.2, 20.8, 0.0)
,  ('fd_milk_full_fat', NULL, 'Milk, full fat', 'Dairy and eggs', '1 cup', 244, 149, 7.7, 11.7, 8.0, 0.0)
,  ('fd_milk_toned', NULL, 'Milk, toned', 'Dairy and eggs', '1 cup', 244, 122, 8.1, 12.2, 4.8, 0.0)
,  ('fd_curd_dahi_full_fat', NULL, 'Curd (dahi), full fat', 'Dairy and eggs', '1 cup', 245, 149, 8.5, 11.4, 8.0, 0.0)
,  ('fd_greek_yoghurt_plain', NULL, 'Greek yoghurt, plain', 'Dairy and eggs', '1 cup', 245, 146, 20.0, 8.0, 3.8, 0.0)
,  ('fd_egg_whole', NULL, 'Egg, whole', 'Dairy and eggs', '1 egg', 50, 72, 6.3, 0.4, 4.8, 0.0)
,  ('fd_egg_white', NULL, 'Egg white', 'Dairy and eggs', '1 white', 33, 17, 3.6, 0.2, 0.1, 0.0)
,  ('fd_cheese_cheddar', NULL, 'Cheese, cheddar', 'Dairy and eggs', '1 slice', 28, 113, 7.0, 0.4, 9.3, 0.0)
,  ('fd_butter', NULL, 'Butter', 'Dairy and eggs', '1 tsp', 5, 36, 0.0, 0.0, 4.1, 0.0)
,  ('fd_ghee', NULL, 'Ghee', 'Dairy and eggs', '1 tsp', 5, 45, 0.0, 0.0, 5.0, 0.0)
,  ('fd_chicken_breast_cooked', NULL, 'Chicken breast, cooked', 'Meat and fish', '100 g', 100, 165, 31.0, 0.0, 3.6, 0.0)
,  ('fd_chicken_thigh_cooked', NULL, 'Chicken thigh, cooked', 'Meat and fish', '100 g', 100, 209, 26.0, 0.0, 10.9, 0.0)
,  ('fd_chicken_curry', NULL, 'Chicken curry', 'Meat and fish', '1 cup', 240, 290, 27.0, 8.0, 16.0, 1.5)
,  ('fd_mutton_curry', NULL, 'Mutton curry', 'Meat and fish', '1 cup', 240, 340, 25.0, 7.0, 23.0, 1.0)
,  ('fd_fish_rohu_cooked', NULL, 'Fish, rohu, cooked', 'Meat and fish', '100 g', 100, 97, 16.6, 0.0, 3.1, 0.0)
,  ('fd_salmon_cooked', NULL, 'Salmon, cooked', 'Meat and fish', '100 g', 100, 206, 22.1, 0.0, 12.4, 0.0)
,  ('fd_prawns_cooked', NULL, 'Prawns, cooked', 'Meat and fish', '100 g', 100, 99, 24.0, 0.2, 0.3, 0.0)
,  ('fd_tuna_canned_in_water', NULL, 'Tuna, canned in water', 'Meat and fish', '1 can', 142, 128, 28.0, 0.0, 1.3, 0.0)
,  ('fd_mixed_vegetable_sabzi', NULL, 'Mixed vegetable sabzi', 'Vegetables', '1 cup', 200, 140, 4.0, 16.0, 7.0, 5.0)
,  ('fd_palak_paneer', NULL, 'Palak paneer', 'Vegetables', '1 cup', 240, 270, 14.0, 10.0, 20.0, 4.0)
,  ('fd_bhindi_fry', NULL, 'Bhindi fry', 'Vegetables', '1 cup', 160, 160, 3.0, 12.0, 11.0, 4.0)
,  ('fd_spinach_raw', NULL, 'Spinach, raw', 'Vegetables', '1 cup', 30, 7, 0.9, 1.1, 0.1, 0.7)
,  ('fd_broccoli_cooked', NULL, 'Broccoli, cooked', 'Vegetables', '1 cup', 156, 55, 3.7, 11.2, 0.6, 5.1)
,  ('fd_carrot_raw', NULL, 'Carrot, raw', 'Vegetables', '1 medium', 61, 25, 0.6, 5.8, 0.1, 1.7)
,  ('fd_cucumber', NULL, 'Cucumber', 'Vegetables', '1 cup', 104, 16, 0.7, 3.8, 0.1, 0.5)
,  ('fd_tomato', NULL, 'Tomato', 'Vegetables', '1 medium', 123, 22, 1.1, 4.8, 0.2, 1.5)
,  ('fd_potato_boiled', NULL, 'Potato, boiled', 'Vegetables', '1 medium', 173, 161, 4.3, 36.6, 0.2, 3.8)
,  ('fd_sweet_potato_boiled', NULL, 'Sweet potato, boiled', 'Vegetables', '1 medium', 151, 135, 2.5, 31.0, 0.2, 4.8)
,  ('fd_onion_raw', NULL, 'Onion, raw', 'Vegetables', '1 medium', 110, 44, 1.2, 10.3, 0.1, 1.9)
,  ('fd_banana', NULL, 'Banana', 'Fruit', '1 medium', 118, 105, 1.3, 27.0, 0.4, 3.1)
,  ('fd_apple', NULL, 'Apple', 'Fruit', '1 medium', 182, 95, 0.5, 25.1, 0.3, 4.4)
,  ('fd_mango', NULL, 'Mango', 'Fruit', '1 cup', 165, 99, 1.4, 24.7, 0.6, 2.6)
,  ('fd_papaya', NULL, 'Papaya', 'Fruit', '1 cup', 145, 62, 0.7, 15.7, 0.4, 2.5)
,  ('fd_orange', NULL, 'Orange', 'Fruit', '1 medium', 131, 62, 1.2, 15.4, 0.2, 3.1)
,  ('fd_guava', NULL, 'Guava', 'Fruit', '1 fruit', 55, 37, 1.4, 7.9, 0.5, 3.0)
,  ('fd_grapes', NULL, 'Grapes', 'Fruit', '1 cup', 151, 104, 1.1, 27.3, 0.2, 1.4)
,  ('fd_watermelon', NULL, 'Watermelon', 'Fruit', '1 cup', 152, 46, 0.9, 11.5, 0.2, 0.6)
,  ('fd_dates', NULL, 'Dates', 'Fruit', '2 dates', 48, 133, 0.9, 36.0, 0.2, 3.2)
,  ('fd_almonds', NULL, 'Almonds', 'Nuts and fats', '10 almonds', 12, 69, 2.5, 2.6, 6.0, 1.5)
,  ('fd_peanuts_roasted', NULL, 'Peanuts, roasted', 'Nuts and fats', '1/4 cup', 37, 207, 9.4, 5.9, 17.6, 3.1)
,  ('fd_peanut_butter', NULL, 'Peanut butter', 'Nuts and fats', '1 tbsp', 16, 94, 3.6, 3.6, 8.0, 0.9)
,  ('fd_walnuts', NULL, 'Walnuts', 'Nuts and fats', '1/4 cup', 29, 185, 4.3, 3.9, 18.5, 1.9)
,  ('fd_cashews', NULL, 'Cashews', 'Nuts and fats', '10 cashews', 15, 82, 2.7, 4.4, 6.5, 0.5)
,  ('fd_chia_seeds', NULL, 'Chia seeds', 'Nuts and fats', '1 tbsp', 12, 58, 2.0, 5.1, 3.7, 4.1)
,  ('fd_flax_seeds', NULL, 'Flax seeds', 'Nuts and fats', '1 tbsp', 10, 53, 1.8, 2.9, 4.2, 2.7)
,  ('fd_olive_oil', NULL, 'Olive oil', 'Nuts and fats', '1 tbsp', 14, 119, 0.0, 0.0, 13.5, 0.0)
,  ('fd_coconut_oil', NULL, 'Coconut oil', 'Nuts and fats', '1 tbsp', 14, 121, 0.0, 0.0, 13.5, 0.0)
,  ('fd_mustard_oil', NULL, 'Mustard oil', 'Nuts and fats', '1 tbsp', 14, 124, 0.0, 0.0, 14.0, 0.0)
,  ('fd_whey_protein', NULL, 'Whey protein', 'Supplements and drinks', '1 scoop', 30, 120, 24.0, 3.0, 1.5, 0.0)
,  ('fd_plant_protein_powder', NULL, 'Plant protein powder', 'Supplements and drinks', '1 scoop', 30, 110, 21.0, 4.0, 2.0, 2.0)
,  ('fd_black_coffee', NULL, 'Black coffee', 'Supplements and drinks', '1 cup', 240, 2, 0.3, 0.0, 0.0, 0.0)
,  ('fd_tea_with_milk_and_sugar', NULL, 'Tea with milk and sugar', 'Supplements and drinks', '1 cup', 150, 90, 2.0, 12.0, 3.0, 0.0)
,  ('fd_coconut_water', NULL, 'Coconut water', 'Supplements and drinks', '1 cup', 240, 46, 1.7, 8.9, 0.5, 2.6)
,  ('fd_buttermilk_chaas', NULL, 'Buttermilk (chaas)', 'Supplements and drinks', '1 cup', 240, 40, 3.0, 4.5, 0.9, 0.0)
,  ('fd_orange_juice_fresh', NULL, 'Orange juice, fresh', 'Supplements and drinks', '1 cup', 248, 112, 1.7, 25.8, 0.5, 0.5)
,  ('fd_samosa', NULL, 'Samosa', 'Snacks and sweets', '1 samosa', 60, 262, 3.5, 24.0, 17.0, 2.0)
,  ('fd_dark_chocolate_70', NULL, 'Dark chocolate 70%', 'Snacks and sweets', '1 square', 10, 60, 0.8, 4.6, 4.3, 1.1)
,  ('fd_gulab_jamun', NULL, 'Gulab jamun', 'Snacks and sweets', '1 piece', 40, 150, 2.0, 21.0, 7.0, 0.2)
,  ('fd_biscuits_digestive', NULL, 'Biscuits, digestive', 'Snacks and sweets', '2 biscuits', 30, 141, 2.0, 20.0, 6.0, 1.0)
,  ('fd_protein_bar', NULL, 'Protein bar', 'Snacks and sweets', '1 bar', 60, 220, 20.0, 22.0, 7.0, 3.0)
,  ('fd_murmura_puffed_rice', NULL, 'Murmura (puffed rice)', 'Snacks and sweets', '1 cup', 15, 56, 1.0, 12.6, 0.1, 0.2)
ON CONFLICT DO NOTHING;
