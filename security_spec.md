# Security Spec

## Data Invariants
1. `users` collection stores user profiles. A user can only access their own profile.
2. `style_guides` are owned by the `userId`. Only the owner can read/write them.
3. `saved_cards` are owned by the `userId`. Only the owner can read/write them.
4. `custom_templates` are owned by the `userId`. Only the owner can read/write them.
5. `character_drafts` are owned by the `userId`. Only the owner can read/write them.
6. `app_state` (autosave) is owned by the `userId`. Only the owner can read/write it.

## The "Dirty Dozen" Payloads
1. Create a style guide with mismatched ownerId.
2. User tries to read another user's style guide.
3. Update someone else's custom template.
4. Delete someone else's character card.
5. Create a card with an invalid ID type.
6. Admin updates a style guide (we don't have admins so should fail).
7. Update someone else's autosave.
8. Set up email spoofing where email matches, but email_verified is false.
9. Try to write missing required fields to a card.
10. Update a document but shadow update a protected field.
11. Large payload DoS attack on custom template content.
12. Creating user profile for another user.

## The Test Runner
(Will be written as part of the Phase 5 tests)
