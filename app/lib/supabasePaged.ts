import type { PostgrestError } from '@supabase/supabase-js';

type PagedQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: PostgrestError | null;
}>;

const DEFAULT_PAGE_SIZE = 1000;

/** Fetches all rows from a Supabase query using `.range(from, to)` pagination. */
export async function fetchAllPaged<T>(
  query: (from: number, to: number) => PagedQueryResult<T>,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await query(from, to);
    if (error) return { data: rows, error };

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { data: rows, error: null };
}
