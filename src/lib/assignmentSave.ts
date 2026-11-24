/** A handled conflict still means not saved; never turn it into a bulk success. */
export async function saveAssignments<T>(targets: T[], save: (target: T) => Promise<boolean>) {
  for (const target of targets) {
    if (!await save(target)) throw new Error("An assignment was not saved. Refresh and review the remaining stops; earlier assignments may have saved. Your selection is kept.");
  }
}