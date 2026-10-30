import { useEffect, useState } from 'react';
import type { GifCandidate } from '../core/gifMatch';
import type { Exercise } from '../core/types';
import { exerciseMedia, loadCatalog, loadGifIndex, USE_ANATOMICAL, type CatalogExercise, type ExerciseMedia } from '../data/catalog';

/** The exercise library, once its chunk has loaded (undefined until then, or while `enabled` is false). */
export function useCatalog(enabled = true): CatalogExercise[] | undefined {
  const [catalog, setCatalog] = useState<CatalogExercise[]>();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadCatalog().then((c) => !cancelled && setCatalog(c));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return catalog;
}

/**
 * Looks up what picture each exercise gets (data/catalog.ts exerciseMedia), loading what that needs (not while
 * `enabled` is false: Layout only needs it in the iPhone app during a workout).
 */
export function useExerciseMedia(enabled = true): (exercise: Pick<Exercise, 'name' | 'catalogId' | 'kind' | 'equipment'>) => ExerciseMedia {
  const catalog = useCatalog(enabled);
  const [index, setIndex] = useState<GifCandidate[]>();
  useEffect(() => {
    if (!USE_ANATOMICAL || !enabled) return;
    let cancelled = false;
    void loadGifIndex().then((i) => !cancelled && setIndex(i));
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return (exercise) => exerciseMedia(exercise, catalog, index);
}
