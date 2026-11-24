import { readAllRows } from '@/lib/readAllRows';

/** Bound URL lengths as well as page sizes; a large .in() can fail before pagination starts. */
export async function readRowsByIds<T>(ids: string[], fetchPage: (batch: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const unique = [...new Set(ids)];
  const result: T[] = [];
  for (let start = 0; start < unique.length; start += 100) {
    result.push(...await readAllRows((from, to) => fetchPage(unique.slice(start, start + 100), from, to)));
  }
  return result;
}