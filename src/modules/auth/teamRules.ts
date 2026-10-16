// src/modules/auth/teamRules.ts
// Pure team-safety rules, split from usersApi.ts so they're testable.

/**
 * True if applying `after` to `userId` would leave the company with no
 * active Owner. `activeOwners` = user ids of currently active owners.
 */
export function wouldRemoveLastOwner(
  activeOwners: readonly string[],
  userId: string,
  after: { role: string; is_active: boolean },
): boolean {
  if (!activeOwners.includes(userId)) return false; // not an owner now — can't reduce the count
  const stillOwner = after.role === "owner" && after.is_active;
  return !stillOwner && activeOwners.length <= 1;
}
