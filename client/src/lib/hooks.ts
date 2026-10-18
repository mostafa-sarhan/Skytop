import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ApiError } from '../api/client';
import { useDebouncedValue } from '../ui/primitives';

export interface ListState {
  page: number;
  pageSize: number;
  search: string;
  debouncedSearch: string;
  setPage: (page: number) => void;
  setSearch: (value: string) => void;
  reset: () => void;
}

export const useListState = (initialPageSize = 20): ListState => {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(initialPageSize);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const reset = useCallback(() => {
    setSearch('');
    setPage(1);
  }, []);

  return { page, pageSize, search, debouncedSearch, setPage, setSearch, reset };
};

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
}

export interface AsyncResource<T> extends AsyncState<T> {
  reload: () => void;
}

export const useAsync = <T,>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AsyncResource<T> => {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, loading: true, error: undefined });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((current) => ({ ...current, loading: true, error: undefined }));

    loader(controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: undefined });
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setState({ data: undefined, loading: false, error });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  return { ...state, reload };
};

export const validationMessages = (error: unknown): Record<string, string> => {
  if (!(error instanceof ApiError)) return {};
  const details = error.details;
  const map: Record<string, string> = {};
  // Single-field business error, e.g. { field: 'receiptNumber' } on a conflict.
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const field = (details as { field?: unknown }).field;
    if (typeof field === 'string') map[field] = error.message;
    return map;
  }
  if (!Array.isArray(details)) return map;
  for (const item of details) {
    if (item && typeof item === 'object') {
      // The API sends { field: 'a.b', message }; older shape used { path: [] }.
      const record = item as { path?: unknown; field?: unknown; message?: unknown };
      if (typeof record.message !== 'string') continue;
      if (typeof record.field === 'string') map[record.field] = record.message;
      else if (Array.isArray(record.path)) map[record.path.join('.')] = record.message;
    }
  }
  return map;
};

/** True while the media query matches (e.g. phones: '(max-width: 640px)'). */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );

/** Tablets and phones: lists with many columns switch to cards. */
export const CARDS_QUERY = '(max-width: 900px)';
