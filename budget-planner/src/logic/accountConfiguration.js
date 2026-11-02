// Configuration policy only: never remap imported or historical references.
export const activeSavingsAccounts = (accounts = []) => accounts.filter((account) =>
  account.type === 'savings' && account.active !== false);
export function soleAccountId(accounts = []) {
  return accounts.length === 1 ? accounts[0].id : '';
}
export const defaultScheduledAccountId = (accounts = []) => soleAccountId(accounts.filter((account) =>
  account.type === 'chequing' && account.active !== false));
export const bucketRevision = (bucket) => JSON.stringify(bucket ?? null);
export function bucketAccountStatus(bucket, accounts = []) {
  const id = bucket.linkedAccountId;
  const account = accounts.find((value) => value.id === id);
  if (!id) return 'No linked account — needs review';
  if (!account) return `Missing account (${id}) — needs review`;
  return `${account.name} (${id})${account.type !== 'savings' ? ' — not a savings account; needs review' : ''}${account.active === false ? ' — inactive; retained association' : ''}`;
}
export function assertNewBucketAccount(bucket, accounts) {
  if (!activeSavingsAccounts(accounts).some((account) => account.id === bucket.linkedAccountId)) {
    throw new Error('Choose an existing active savings account. Reopen the editor if accounts changed.');
  }
}
