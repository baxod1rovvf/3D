# Dorilar and Retseptlar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 💊 Dorilar category with replacement alternatives in Ro'zg'or, and 📖 Retseptlar plus a "Bugun nima pishiramiz?" suggester in Taomlar.

**Architecture:**
- Medicines are catalogue data plus a note convention (`yo'q bo'lsa: X`) on grocery rows, so they need no schema change.
- Recipes are a new family-scoped `recipes` table, available in all three backends, and reuse the `photos` table.
- Suggestions come from a pure function in `js/suggest.js`. It is unit-tested and used by a sheet in Taomlar.

**Tech Stack:**
- Static HTML/CSS/JS with the in-page section switcher (each page script runs in its own scope, using `App.$`).
- Supabase (PostgreSQL + RLS keyed on `x-family-key`).
- Tests: Node test runner and Playwright e2e in demo mode.

**Spec:** `docs/superpowers/specs/2026-11-08-dorilar-retseptlar-design.md`

## Global Constraints

- **Dorilar:**
  - Category id `dori`, name "Dorilar", emoji 💊.
  - It is the 10th category, placed immediately before "Boshqalar".
  - It holds exactly these 20 products: Paratsetamol, Ibuprofen, Analgin, Sitramon, No-shpa, Aspirin, Validol, Korvalol, Smekta, Aktivlangan ko'mir, Mezim, Loratadin, Suprastin, Bint, Yod, Brilliant yashil, Gidroperit, Termometr, Burun tomchisi, Yo'tal siropi.
  - A typed medicine in this category gets 💊.
- **Alternative note format:** `yo'q bo'lsa: <alternative>`, stored in `grocery_items.note`. Field label: "Agar u yo'q bo'lsa…".
- **Notification name:** `<name> (yo'q bo'lsa — <alternative>)`.
- **`recipes` table columns:** id, household_id, title, photo_path, ingredients (jsonb array of strings), steps, emoji, created_by, created_at, updated_at.
- **Suggestions:**
  - Candidates are recipes ∪ planned meal titles, merged case- and apostrophe-insensitively.
  - Exclude anything planned for today or tomorrow.
  - Never-planned candidates come first, then the oldest last-made. Ties go to recipes first, then by title.
  - Show 3 at a time; "Boshqalarini ko'rsat" shows the next 3.
  - Labels: "oxirgi marta N kun oldin" or "hali pishirilmagan".
- **Copy and names:** all UI copy is in Uzbek Latin. Taomlar tabs are "📅 Menyu" and "📖 Retseptlar".
- **Tests:**
  - Unit tests run with `node --test tests/*.test.js`.
  - E2E scripts are `node tests/e2e/<name>.spec.js`. They need `python3 -m http.server 8765` running from the repo root, and they route `js/config.js` to demo mode.

## Review Focus

1. **The user types an alternative but picks a non-medicine as well.** The alternative applies only to medicines in that save, not to "Non". → Task 2 e2e.
2. **A medicine is un-X'd and X'd again.** Queue and unqueue must use the same notification name, otherwise a ghost notification is sent. → Task 2 e2e.
3. **A recipe and a planned meal differ only in case or apostrophe** ("Mol go‘shti palov" vs "mol go'shti palov"). They must count as one suggestion. → Task 3 unit test.
4. **The `recipes` table is missing on Supabase** because the SQL hasn't been run. The Recipes tab shows the setup message and suggestions still work from meals. → Task 5 e2e, with the demo backend made to throw for `recipes`.
5. **Saving a recipe whose photo upload fails.** The recipe still saves, without a photo, and a toast is shown. → Task 5 e2e (upload stubbed to throw).

---

### Task 1: Dorilar in the catalogue

**Files:**
- Modify: `js/catalog.js`
- Test: `tests/catalog.test.js` (new)

**Interfaces:**
- Produces:
  - `Catalog.category("dori")`, which returns the Dorilar category.
  - `Catalog.find(name).category === "dori"` for each of the 20 products.
  - `Catalog.isMedicine(name: string) → boolean`: true for catalogue Dorilar products. Typed names are not catalogue medicines.

- [ ] **Step 1: Write a failing test.** Load `js/stickers.js` and then `js/catalog.js`. Assert:
  - `Catalog.CATEGORIES.map(c => c.id)` ends with `["dori", "boshqa"]`;
  - `Catalog.category("dori").products.length === 20`, with names exactly the 20 in Global Constraints, in that order;
  - every product has a non-empty emoji;
  - `Catalog.isMedicine("paratsetamol") === true` and `Catalog.isMedicine("Non") === false`.
- [ ] **Step 2:** Run `node --test tests/*.test.js` and expect FAIL.
- [ ] **Step 3: Implement.** Add the category and `isMedicine` to `js/catalog.js`.
- [ ] **Step 4:** Run the tests and expect PASS.
- [ ] **Step 5:** Commit `feat: Dorilar category`.

### Task 2: Alternative field and how it is shown (Ro'zg'or)

**Files:**
- Modify: `rozgor.html` (`openAdder`, `metaFor`, the X / ✓ queue calls, shopping mode row)
- Test: `tests/e2e/dorilar.spec.js` (new)

**Interfaces:**
- Consumes: `Catalog.isMedicine`, `Catalog.category("dori")`.
- Produces, inside `rozgor.html`:
  - `altOf(item) → string|null`, parsed from `note`;
  - `notifName(item) → string`.
  - Use `notifName` in every `App.queueGrocery` and `App.unqueueGrocery` call for groceries.

- [ ] **Step 1: Write a failing e2e** (demo mode; wife plus husband page).
  1. Open ➕ and choose 💊 Dorilar; assert the "Agar u yo'q bo'lsa…" field is visible.
  2. Pick Paratsetamol and Non, type "Ibuprofen" in the alternative field, and save.
  3. Assert:
     - Paratsetamol's note is "yo'q bo'lsa: Ibuprofen";
     - Non's note is "" (Review Focus 1);
     - the Paratsetamol row shows "yo'q bo'lsa: Ibuprofen".
  4. Leave the page so the batch flushes. The husband's newest `grocery_need` body contains "Paratsetamol (yo'q bo'lsa — Ibuprofen)".
  5. Un-X then X Paratsetamol, then leave. Exactly one new notification is sent, containing the same name (Review Focus 2).
  6. Shopping mode shows "🔁 Ibuprofen" under Paratsetamol.
  7. Choosing the Sabzavotlar category with no medicine picked hides the alternative field.
- [ ] **Step 2:** Run the e2e and expect FAIL.
- [ ] **Step 3: Implement.**
  - The alternative field (`#a-alt`, label "Agar u yo'q bo'lsa…") sits under the name box. It shows when `cat === "dori"` or any name in the box `Catalog.isMedicine`.
  - On save, medicines (catalogue medicines, or any typed name while `cat === "dori"`) get `note: "yo'q bo'lsa: " + alt` when alt is non-empty.
  - A typed name saved under `dori` gets category `dori` and the 💊 emoji through `emojiFor`.
- [ ] **Step 4:** Run this e2e plus `rozgor.spec.js`, `batch.spec.js` and `convenience.spec.js`. Expect PASS.
- [ ] **Step 5:** Commit `feat: medicine alternatives in Ro'zg'or`.

### Task 3: Suggestion engine

**Files:**
- Create: `js/suggest.js` (plain script, `globalThis.Suggest`)
- Test: `tests/suggest.test.js`

**Interfaces:**
- Produces: `Suggest.meals({ recipes: Recipe[], meals: Meal[], today: "YYYY-MM-DD" }) → Array<{ title, recipe: Recipe|null, lastMade: "YYYY-MM-DD"|null, daysAgo: number|null }>`.
  - `Recipe` is `{ id, title, photo_path, ingredients, emoji }`.
  - `Meal` is `{ title, day_date, ingredients }`.
  - `daysAgo` is a whole number of days from `lastMade` to `today`.

- [ ] **Step 1: Write failing tests.**
  - A recipe never planned ranks above a meal last made 30 days ago, which ranks above one made 2 days ago.
  - A title planned tomorrow is excluded, and so is one planned today.
  - The recipe "Mol go‘shti palov" and the meal "mol go'shti palov" merge into one candidate with `recipe` set and `lastMade` from the meal (Review Focus 3).
  - Tie (both never planned): the recipe comes before the plain meal, then by title.
  - Future meals beyond tomorrow don't count as "made".
  - Empty input returns `[]`.
- [ ] **Step 2:** Run the tests and expect FAIL.
- [ ] **Step 3: Implement.**
  - Normalise titles with `Stickers.normalize` when available, else lower-case plus apostrophe unification.
  - Only `day_date <= today` counts as made.
- [ ] **Step 4:** Run the tests and expect PASS.
- [ ] **Step 5:** Commit `feat: meal suggestion engine`.

### Task 4: `recipes` storage in every backend

**Files:**
- Create: `supabase/recipes.sql` (standalone, idempotent)
- Modify:
  - `supabase/schema.sql`: append the same block;
  - `js/store.js`: add `recipes` to `TABLES`, and seed demo `recipes: []` (keep existing demo DBs working: treat a missing key as `[]`);
  - `cloudflare/worker.js`: add `recipes` to `TABLES`.
- Test: `tests/sql/recipes.sql`, plus a runner line in `tests/sql/run.sh`.

**Interfaces:**
- Produces: `Store.list("recipes")`, `Store.insert("recipes", row)`, `Store.update("recipes", id, patch)` and `Store.remove("recipes", id)` in every backend.

- [ ] **Step 1: Write the failing SQL test.**
  - Running it twice succeeds.
  - Anon with key A inserts and reads a recipe; key B sees 0 rows.
  - Anon without a key sees 0 rows.
  - Inserting with another family's household_id is refused.
- [ ] **Step 2:** Run `bash tests/sql/run.sh` (starting the local PG16 cluster if needed) and expect FAIL.
- [ ] **Step 3: Implement** the table, the "family key" policy and the grants, matching the existing tables. Add an index on `household_id`.
- [ ] **Step 4:** Run the SQL tests plus `node --test tests/*.test.js`. Expect PASS.
- [ ] **Step 5:** Commit `feat: recipes table`.

### Task 5: 📖 Retseptlar tab (Taomlar)

**Files:**
- Modify: `taomlar.html` (tab switch, recipe grid, add/edit sheet, detail sheet)
- Test: `tests/e2e/recipes.spec.js` (new)

**Interfaces:**
- Consumes:
  - `Store.*("recipes")`, `Store.uploadPhoto(blob)`, `Store.photoUrls(ids)`, `Store.compressImage(file)`;
  - `Catalog.CATEGORIES` and `Catalog.find` for the ingredient tiles and emojis;
  - the existing `sendToGrocery(ings, title)` and meal insert / `Store.notify("meal_added", …)` flow.
- Produces, inside `taomlar.html`:
  - `addMealToday(recipeOrTitle, slot)`, used by Task 6;
  - `recipes` (the loaded list).

- [ ] **Step 1: Write a failing e2e** (demo mode).
  1. Taomlar shows the tabs "📅 Menyu" and "📖 Retseptlar".
  2. In Retseptlar, ➕ opens the sheet.
  3. Set a photo (`setInputFiles` with a PNG), title "Tovuq sho'rva", and ingredients via tiles: Tovuq, Kartoshka, Sabzi. Type steps and save.
  4. A card appears with an image and "3 masalliq".
  5. Open it: the chips show 🍗 🥔 🥕 and the steps text.
  6. "Bugungi menyuga qo'shish" with Kechki ovqat creates a meal for today in the kechki slot, titled "Tovuq sho'rva", with those ingredients.
  7. Edit the title, then confirm the delete with undo, which restores it.
  8. Review Focus 4: a fresh page with `Store.list` throwing for `recipes` shows "Retseptlar uchun serverni sozlang" while the Menyu tab still works.
  9. Review Focus 5: with `Store.uploadPhoto` stubbed to throw, the recipe is still saved without a photo, and a toast appears.
- [ ] **Step 2:** Run the e2e and expect FAIL.
- [ ] **Step 3: Implement.**
  - Follow `xotiralar.html` for the photo handling and `rozgor.html`'s `openAdder` tiles for ingredients. Copy the tile markup and CSS into Taomlar.
  - The dish emoji is `Stickers.forName(title)`; if that returns a category fallback or 🛒, use 🍲.
- [ ] **Step 4:** Run this e2e plus `spa.spec.js` and `design.spec.js`. Expect PASS.
- [ ] **Step 5:** Commit `feat: recipes in Taomlar`.

### Task 6: "Bugun nima pishiramiz? 🤔"

**Files:**
- Modify: `taomlar.html` (a button on the Menyu tab, the suggestion sheet); add `<script src="js/suggest.js">` to every page head, after `js/catalog.js` (the section switcher needs it everywhere).
- Test: extend `tests/e2e/recipes.spec.js`.

**Interfaces:**
- Consumes: `Suggest.meals` (Task 3), `addMealToday` (Task 5).

- [ ] **Step 1: Write a failing e2e.** With the demo seed meals plus 2 saved recipes:
  1. Tap "Bugun nima pishiramiz? 🤔". Exactly 3 cards are shown; the first is a never-planned recipe with the text "hali pishirilmagan".
  2. A meal from the seed planned 3 days ago shows "oxirgi marta 3 kun oldin" when it is visible.
  3. "Boshqalarini ko'rsat" shows the next cards.
  4. Tapping a card, then choosing Tushlik, adds it to today's menu.
  5. With no recipes and no meals, an empty state shows a "Retsept qo'shish" button.
- [ ] **Step 2:** Run the e2e and expect FAIL.
- [ ] **Step 3: Implement** the sheet. Cards show the photo, or the emoji when there is no photo.
- [ ] **Step 4:** Run all e2e specs and unit tests. Expect PASS.
- [ ] **Step 5:** Commit `feat: meal suggestions`.

### Task 7: Docs, verification, ship

- [ ] **Step 1:** README: add Dorilar, Retseptlar and suggestions to the features list. Add a setup note to run `supabase/recipes.sql`, or the whole `schema.sql`, before using recipes.
- [ ] **Step 2: Run everything.**
  - `node --test tests/*.test.js`
  - `node tools/build-push.mjs --check`
  - `bash tests/sql/run.sh`
  - every `tests/e2e/*.spec.js`

  All must PASS.
- [ ] **Step 3:** Commit `docs: dorilar and retseptlar`, push the branch, and fast-forward `main` (the user approved merging these features).
