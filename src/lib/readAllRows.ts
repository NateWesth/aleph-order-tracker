/** Stable, bounded pages avoid Supabase's default row cap silently hiding records. */
export async function readAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  signal?: AbortSignal,
): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0; ; from += 500) {
    signal?.throwIfAborted();
    const page = await fetchPage(from, from + 499);
    if (page.error) throw new Error(page.error.message);
    signal?.throwIfAborted();
    result.push(...(page.data || []));
    if ((page.data?.length || 0) < 500) return result;
  }
}
