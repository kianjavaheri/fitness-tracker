import { useEffect, useState, type DependencyList } from 'react';
import type { Repository } from '../core/repository';
import { repo } from '../data';

/**
 * Runs an async repository read and re-runs it whenever the repository reports a write.
 * Returns undefined while the first load is in flight.
 */
export function useRepoQuery<T>(query: (r: Repository) => Promise<T>, deps: DependencyList = []): T | undefined {
  const [data, setData] = useState<T>();

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      query(repo).then((result) => {
        if (!cancelled) setData(result);
      });
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

export const useExercises = () => useRepoQuery((r) => r.listExercises());
export const useWorkouts = () => useRepoQuery((r) => r.listWorkouts());
export const useRoutines = () => useRepoQuery((r) => r.listRoutines());
export const useSessions = () => useRepoQuery((r) => r.listSessions());
