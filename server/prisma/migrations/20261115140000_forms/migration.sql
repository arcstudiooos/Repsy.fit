-- Intake and assessment forms (Inspo C1/C2, Nov 2026).
--
-- `questions` and `answers` are JSONB, not tables: a form is read and written whole, never queried
-- by question, and a question's shape differs by type (only a choice has options). zod validates
-- the shape on the way in (src/forms/schema.ts), so the JSON is never trusted on the way out.
--
-- `coachId` NULL = a Repsy sample form, shared and read-only, exactly like a stock exercise. Four
-- are seeded below so a coach is never looking at an empty Forms page on day one.
--
-- A submission snapshots the questions it was `asked`, so answers stay readable years later even
-- after the coach has edited or deleted the form they came from.
CREATE TABLE "forms" (
  "id" TEXT NOT NULL,
  "coachId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "questions" JSONB NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "forms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_submissions" (
  "id" TEXT NOT NULL,
  "formId" TEXT NOT NULL,
  "coachId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "answers" JSONB NOT NULL DEFAULT '{}',
  "asked" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "forms_coachId_idx" ON "forms"("coachId");
CREATE INDEX "form_submissions_formId_createdAt_idx" ON "form_submissions"("formId", "createdAt");
CREATE INDEX "form_submissions_clientId_idx" ON "form_submissions"("clientId");
CREATE INDEX "form_submissions_coachId_idx" ON "form_submissions"("coachId");

ALTER TABLE "forms" ADD CONSTRAINT "forms_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Deleting a form takes its submissions with it. The coach is warned how many first.
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The four seeded samples. Ids are literal so a replay is a no-op and a sample is referenceable.
INSERT INTO "forms" ("id", "coachId", "name", "description", "questions") VALUES
  ('frm_client_intake', NULL, 'Client intake', 'The first form a new client fills in: goals, history, diet and what they can train with.', '[{"id": "age", "type": "single", "label": "What is your age?", "required": true, "options": ["Under 18", "18-24", "25-34", "35-44", "45-54", "55+"]}, {"id": "goals", "type": "multi", "label": "What are your primary fitness goals? (Select all that apply)", "required": true, "options": ["Fat loss", "Build muscle", "Get stronger", "Improve fitness", "Sport performance", "Health and energy", "Rehab or injury recovery"]}, {"id": "activity", "type": "single", "label": "How would you describe your current activity level?", "required": true, "options": ["Barely active", "Lightly active", "Moderately active", "Very active"]}, {"id": "occupation", "type": "text", "label": "What is your occupation?", "required": true}, {"id": "diet", "type": "multi", "label": "Do you have any dietary preference? (Select all that apply)", "required": true, "options": ["No preference", "Vegetarian", "Eggetarian", "Vegan", "Jain", "Halal", "No beef", "No pork", "Gluten free", "Lactose free"]}, {"id": "injuries", "type": "longtext", "label": "Please list any current or past injuries", "required": true}, {"id": "equipment", "type": "multi", "label": "What equipment can you train with?", "required": true, "options": ["Full gym", "Home dumbbells", "Resistance bands", "Pull up bar", "Bodyweight only"]}, {"id": "days", "type": "single", "label": "How many days a week can you train?", "required": true, "options": ["2", "3", "4", "5", "6+"]}, {"id": "heard", "type": "single", "label": "How did you hear about us?", "required": false, "options": ["Instagram", "A friend", "Google", "Walked past the gym", "Somewhere else"]}, {"id": "start", "type": "date", "label": "When do you want to get started?", "required": true}]'::jsonb)
,  ('frm_weekly_progress_check', NULL, 'Weekly progress check', 'A short weekly check on adherence, energy, sleep and how the body feels.', '[{"id": "weight", "type": "text", "label": "What is your weight this week?", "required": true}, {"id": "adherence", "type": "single", "label": "How closely did you follow the plan?", "required": true, "options": ["All of it", "Most of it", "About half", "Less than half"]}, {"id": "energy", "type": "single", "label": "How were your energy levels?", "required": true, "options": ["Great", "Good", "Up and down", "Low"]}, {"id": "sleep", "type": "single", "label": "How well did you sleep, on average?", "required": true, "options": ["7+ hours, well", "Enough, but broken", "Under 6 hours", "Badly"]}, {"id": "soreness", "type": "single", "label": "Any soreness or niggles?", "required": true, "options": ["None", "A little", "Quite sore", "Something hurts"]}, {"id": "wins", "type": "longtext", "label": "What went well this week?", "required": false}, {"id": "blockers", "type": "longtext", "label": "What got in the way?", "required": false}]'::jsonb)
,  ('frm_nutrition_assessment', NULL, 'Nutrition assessment', 'How a client eats day to day, before writing them a plan.', '[{"id": "meals", "type": "single", "label": "How many meals a day do you usually eat?", "required": true, "options": ["1-2", "3", "4", "5+"]}, {"id": "cooks", "type": "single", "label": "Who cooks most of your food?", "required": true, "options": ["I do", "Family at home", "A cook or tiffin service", "Mostly eating out"]}, {"id": "water", "type": "single", "label": "Roughly how much water a day?", "required": true, "options": ["Under 1 litre", "1-2 litres", "2-3 litres", "Over 3 litres"]}, {"id": "restrictions", "type": "longtext", "label": "Any allergies or foods you cannot eat?", "required": false}, {"id": "supplements", "type": "longtext", "label": "What supplements do you take, if any?", "required": false}, {"id": "alcohol", "type": "single", "label": "How often do you drink alcohol?", "required": false, "options": ["Never", "Occasionally", "Weekly", "Most days"]}, {"id": "eatingout", "type": "single", "label": "How often do you eat out or order in?", "required": true, "options": ["Rarely", "Once a week", "2-3 times a week", "Most days"]}]'::jsonb)
,  ('frm_fitness_assessment', NULL, 'Fitness assessment', 'A simple starting-point assessment, no equipment needed.', '[{"id": "experience", "type": "single", "label": "How long have you been training?", "required": true, "options": ["Never trained", "Under 6 months", "6 months to 2 years", "Over 2 years"]}, {"id": "squat", "type": "text", "label": "Deepest comfortable squat: can you reach parallel?", "required": false}, {"id": "pushups", "type": "text", "label": "How many push-ups can you do in one set?", "required": false}, {"id": "plank", "type": "text", "label": "How long can you hold a plank?", "required": false}, {"id": "cardio", "type": "single", "label": "Can you walk briskly for 30 minutes without stopping?", "required": true, "options": ["Easily", "With effort", "Not yet"]}, {"id": "pain", "type": "longtext", "label": "Does any movement cause pain? Which, and where?", "required": false}, {"id": "medical", "type": "longtext", "label": "Anything medical your coach should know about?", "required": false}]'::jsonb)
ON CONFLICT DO NOTHING;
