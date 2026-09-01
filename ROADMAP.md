# Next up

## Editing recipes

Every recipe editable, seeded ones included, with two ways to save:

- **Save as a copy.** Leaves the original untouched and adds a modified
  duplicate to the library. Badged as a copy, the same way a liked recipe
  carries its heart.
- **Save over it.** Changes the recipe in place, badged as modified, with a
  button to put the original back.

The data model already supports this without a migration. Seeded recipes live
in `frontend/public/recipes.json` and are never written to, and local changes
sit in IndexedDB (`frontend/src/store/`), so a per-recipe override map alongside
`images` would carry the edits and restoring the default is just deleting the
override. Copies are ordinary custom recipes: `addRecipe()` already assigns them
ids from 1,000,000 up, which is why they can never collide with the shipped
library however much it grows.

Worth deciding before building: whether an edited recipe keeps the taste
signal attached to the original, or starts clean.
