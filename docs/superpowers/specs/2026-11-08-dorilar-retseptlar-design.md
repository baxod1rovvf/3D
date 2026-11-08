# Dorilar (medicines) and Retseptlar (recipes) — design

Date: 2026-11-08 · Status: approved in chat, awaiting written-spec review

## Goal
1. Ro'zg'or gets a **💊 Dorilar** category with 20 common medicines in Uzbekistan and an
   **"Agar u yo'q bo'lsa…"** alternative for each medicine the user adds.
2. Taomlar gets **📖 Retseptlar** (photo + ingredients with food emojis + steps) and a
   **"Bugun nima pishiramiz? 🤔"** button that suggests 3 meals not made for the longest time.

## Decisions from chat
- Suggestions come from **saved recipes + every meal ever planned in the menu** (option B).
- "Made" = planned in the weekly menu on that date (the app does not know what was cooked).
- Recipes get their **own table** (one more SQL paste in Supabase); photos reuse the existing
  `photos` table (compressed JPEG data URLs, family-key RLS).

## Part 1 — 💊 Dorilar (Ro'zg'or, no SQL)
- `js/catalog.js`: new category `{ id: "dori", name: "Dorilar", emoji: "💊" }` with exactly 20
  products, each with an emoji: Paratsetamol, Ibuprofen, Analgin, Sitramon, No-shpa, Aspirin,
  Validol, Korvalol, Smekta, Aktivlangan ko'mir, Mezim, Loratadin, Suprastin, Bint, Yod,
  Brilliant yashil, Gidroperit, Termometr, Burun tomchisi, Yo'tal siropi. It is the 10th
  category, placed before "Boshqalar".
- Add form (`openAdder` in `rozgor.html`): when the Dorilar category is selected, or any chosen
  name is a Dorilar product, a second field **"Agar u yo'q bo'lsa…"** appears under the name box.
  Its value is saved in the product's `note` as `yo'q bo'lsa: <alternative>` (the existing
  column; no schema change). It applies to every product added in that save.
- Display: the list row and shopping mode show the note as written; in shopping mode the
  alternative line is shown in larger text with 🔁.
- Notification: the grocery batch message keeps its text; for products whose note starts with
  `yo'q bo'lsa:`, the name in the message reads `Paratsetamol (yo'q bo'lsa — Ibuprofen)`.
- Medicines in Dorilar never get a stock sticker fallback: their emoji comes from the catalogue;
  a typed medicine in that category gets 💊.

## Part 2 — 📖 Retseptlar (Taomlar, SQL needed)
### Data
New table `recipes` (family-key RLS like the others, realtime via the existing broadcast):
`id uuid pk, household_id text, title text not null, photo_path text (id in photos),
ingredients jsonb default '[]', steps text default '', emoji text, created_by uuid,
created_at timestamptz, updated_at timestamptz`.
Delivered as `supabase/recipes.sql` (standalone, safe to re-run) and appended to `schema.sql`.
Demo backend: a `recipes` array in the demo DB. Cloudflare backend: table name allowed in the
worker's TABLES list.
If the table is missing (SQL not run), the Recipes tab shows "Retseptlar uchun serverni
sozlang: supabase/recipes.sql" and nothing else breaks.

### UI
- Taomlar top gets a two-tab switch: **📅 Menyu** (existing planner) | **📖 Retseptlar**.
- Recipes tab: grid of photo cards (photo or big dish emoji, title, "N masalliq"), ➕
  "Retsept qo'shish".
- Add/edit sheet: photo picker (compressed like memories), title, ingredients picked from the
  same product tiles as Ro'zg'or (catalogue emojis) or typed (comma-separated), "Tayyorlash"
  textarea. Dish emoji is chosen automatically from the title (Stickers/Catalog), fallback 🍲.
- Recipe detail sheet: big photo, ingredient chips with emojis, steps, buttons
  **"Bugungi menyuga qo'shish"** (choose nonushta / tushlik / kechki) and
  **"Masalliqlarni Ro'zg'orga"** (existing send-ingredients flow), edit, delete (with undo).
- Adding a recipe to the menu creates a normal meal row (title, ingredients, description =
  first line of steps) and sends the existing `meal_added` notification.

### 🤔 "Bugun nima pishiramiz?"
- Button on the Menyu tab. Pure function `Suggest.meals({ recipes, meals, today })` in new
  `js/suggest.js`:
  - candidates = recipe titles ∪ planned meal titles (case/apostrophe-insensitive merge;
    a recipe and a meal with the same name are one candidate that carries the recipe);
  - last made = latest `day_date ≤ today` among meals with that title; never planned = oldest;
  - exclude anything planned for today or tomorrow;
  - sort: never planned first, then oldest last-made; ties → recipes first, then title;
  - returns the ranked list; the UI shows 3 at a time.
- Sheet with 3 cards (photo or emoji, name, "oxirgi marta 23 kun oldin" / "hali
  pishirilmagan"); tapping one opens the slot choice and adds it to today; **"Boshqalarini
  ko'rsat"** shows the next 3; when fewer than 3 exist, show what there is, or an empty state
  pointing to "Retsept qo'shish".

## Errors
- Recipe photo upload fails: the recipe still saves without a photo, with a toast.
- Missing `recipes` table: friendly message on the Recipes tab; suggestions still work from
  meals alone.

## Testing
- Unit: `Suggest.meals` ordering, exclusion of today/tomorrow, merging, never-planned first;
  catalogue has exactly 20 Dorilar items with emojis.
- E2E (demo): add Paratsetamol with alternative Ibuprofen → row note and notification text;
  add a recipe with a photo and ingredients → card shows; suggestions show 3, tapping one adds
  it to today's menu.
- SQL: `recipes.sql` on local PostgreSQL 16: runs twice, RLS isolates families.

## Out of scope
- Tracking what was actually cooked; recipe sharing outside the family; per-recipe ratings.
