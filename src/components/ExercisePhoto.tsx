import { Dumbbell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { exercisePhotos, type ExerciseMedia } from '../data/catalog';
import { Modal } from './Modal';

/** True when there's a picture to show (data/catalog.ts exerciseMedia). */
export const hasMedia = (media: ExerciseMedia) => !!(media.gif || media.photoId);

/**
 * An exercise's picture as a small square (its anatomical GIF while that's on, else its library photo), or a dumbbell
 * when there's none or it fails to load (offline before it was ever seen).
 */
export function ExerciseThumb({ media, size = 40 }: { media: ExerciseMedia; size?: number | 'fill' }) {
  const [failed, setFailed] = useState<string | null>(null);
  const src = media.gif ?? (media.photoId ? exercisePhotos(media.photoId)[0] : undefined);
  // 'fill': as wide as its box, square (the exercise grid's tiles).
  const style = size === 'fill' ? { width: '100%', height: 'auto', aspectRatio: '1' } : { width: size, height: size };
  if (!src || failed === src) {
    return (
      <span className="exercise-thumb no-picture" style={style} aria-hidden>
        <Dumbbell size={size === 'fill' ? 28 : size * 0.42} />
      </span>
    );
  }
  return (
    <img
      className={`exercise-thumb${media.gif ? ' anatomical' : ''}`}
      style={style}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(src)}
    />
  );
}

/**
 * How the exercise is done: its anatomical GIF, or its two library photos (start and end of the movement) shown in
 * turn so they read like a short clip. Opened from the picture on an exercise card.
 */
export function ExercisePhotos({ name, media, onClose }: { name: string; media: ExerciseMedia; onClose: () => void }) {
  const [shown, setShown] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (media.gif) return;
    const id = setInterval(() => setShown((n) => 1 - n), 1100);
    return () => clearInterval(id);
  }, [media.gif]);
  return (
    <Modal title={name} onClose={onClose}>
      {failed ? (
        <p className="muted small">The pictures couldn’t load. Check your connection and try again.</p>
      ) : media.gif ? (
        <div className="exercise-gif">
          <img src={media.gif} alt={`How to do ${name}`} onError={() => setFailed(true)} />
        </div>
      ) : media.photoId ? (
        <div className="exercise-photos">
          {exercisePhotos(media.photoId).map((src, i) => (
            <img key={src} src={src} alt={i === 0 ? `${name}: start` : `${name}: end`} className={i === shown ? 'on' : ''} onError={() => setFailed(true)} />
          ))}
        </div>
      ) : null}
      <p className="muted small" style={{ marginTop: 10 }}>
        {media.gif ? 'Working muscles in red. Animation from ExerciseDB.' : 'Start and end of the movement. Photos from free-exercise-db.'}
      </p>
    </Modal>
  );
}
