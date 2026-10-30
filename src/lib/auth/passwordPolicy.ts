/**
 * One floor and one cost for every path that stores a password: registration,
 * profile update, seed. Keeping them apart is how a minimum ends up enforced
 * in one place and bypassable in another.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const PASSWORD_HASH_ROUNDS = 12;
