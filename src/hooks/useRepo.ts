import { useEffect, useState, type DependencyList } from 'react';
import type { Repository } from '../core/repository';
import { repo, repoGeneration } from '../data';

/** Last result of each cached query (see `cacheKey`), with the repository generation it was read from. */
const cache = new Map<string, { generation: number; data: unknown }>();

function cached<T>(key: string | undefined): T | undefined {
  const hit = key ? cache.get(key) : undefined;
  return hit && hit.generation === repoGeneration() ? (hit.data as T) : undefined;
}

/**
 * Runs an async repository read and re-runs it whenever the repository reports a write.
 * Returns undefined while the first load is in flight — unless `cacheKey` is given and the same query ran before: then
 * the page starts from that last result (and refreshes it), so switching tabs draws the content straight away instead
 * of a blank page that pops in a moment later.
 */
export function useRepoQuery<T>(query: (r: Repository) => Promise<T>, deps: DependencyList = [], cacheKey?: string): T | undefined {
  const [data, setData] = useState<T | undefined>(() => cached<T>(cacheKey));

  useEffect(() => {
    let cancelled = false;
    // Reads can finish out of order when writes land close together; only the latest one may set the data,
    // or an older result can overwrite a newer one and stick until the next write.
    let latest = 0;
    const run = () => {
      const call = ++latest;
      query(repo)
        .then((result) => {
          if (cancelled || call !== latest) return;
          if (cacheKey) cache.set(cacheKey, { generation: repoGeneration(), data: result });
          setData(result);
        })
        // Keep showing what we had; the sync indicator explains a cloud problem.
        .catch((err) => console.error('Read failed', err));
    };
    run();
    const unsubscribe = repo.subscribe(run);
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}

export const useExercises = () => useRepoQuery((r) => r.listExercises(), [], 'exercises');
export const useWorkouts = () => useRepoQuery((r) => r.listWorkouts(), [], 'workouts');
export const useRoutines = () => useRepoQuery((r) => r.listRoutines(), [], 'routines');
export const useSessions = () => useRepoQuery((r) => r.listSessions(), [], 'sessions');
