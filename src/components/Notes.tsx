import { ExternalLink, Link2, NotebookPen, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { now } from '../core/ids';
import { linkLabel, normalizeLink } from '../core/links';
import type { Exercise, Workout } from '../core/types';
import { repo } from '../data';

/** Notes toggle. Tinted with a dot when there's something saved, so you know to look. */
export function NotesButton({ hasNotes, open, onClick, label }: { hasNotes: boolean; open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      className={`icon-btn notes-btn${hasNotes ? ' has-notes' : ''}${open ? ' open' : ''}`}
      onClick={onClick}
      aria-expanded={open}
      aria-label={hasNotes ? `${label} (has notes)` : label}
      title={label}
    >
      <NotebookPen size={15} />
    </button>
  );
}

/** Textarea that grows with its content, so notes never scroll inside a tiny box. */
function NoteText({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="notepad-text"
      rows={2}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Saved links with an "add" field. Only http(s) links are accepted. */
export function LinksEditor({ links, onChange }: { links: string[]; onChange: (links: string[]) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);

  const add = () => {
    const href = normalizeLink(text);
    if (!href) return setError(true);
    if (!links.includes(href)) onChange([...links, href]);
    setText('');
  };

  return (
    <div className="links">
      {links.map((href) => (
        <div key={href} className="link-row">
          <a href={href} target="_blank" rel="noopener noreferrer" className="link-chip" title={href}>
            <ExternalLink size={13} />
            <span>{linkLabel(href)}</span>
          </a>
          <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => onChange(links.filter((l) => l !== href))} aria-label={`Remove ${linkLabel(href)}`}>
            <X size={13} />
          </button>
        </div>
      ))}
      <div className="link-add">
        <Link2 size={14} className="muted" />
        <input
          className="link-input"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Add a link (form video, article…)"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          aria-invalid={error}
        />
        {text.trim() && (
          <button className="chip" onClick={add}>
            Add
          </button>
        )}
      </div>
      {error && <div className="small" style={{ color: 'var(--danger)' }}>That doesn't look like a web address.</div>}
    </div>
  );
}

/**
 * Note pad for an exercise: notes and links are stored on the exercise, so they show in every workout.
 * Local state is the source of truth while open (the exercise list re-queries on every save).
 */
export function ExerciseNotepad({ exercise }: { exercise: Exercise }) {
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const [links, setLinks] = useState(exercise.links ?? []);

  // Always writes both from local state, so a save based on a slightly older `exercise` can't undo the other field.
  const save = (next: { notes: string; links: string[] }) => void repo.saveExercise({ ...exercise, ...next, updatedAt: now() });

  return (
    <div className="notepad">
      <NoteText
        value={notes}
        autoFocus={!notes && links.length === 0}
        placeholder={`Notes for ${exercise.name}: cues, seat height, anything to remember`}
        onChange={(v) => {
          setNotes(v);
          save({ notes: v, links });
        }}
      />
      <LinksEditor
        links={links}
        onChange={(next) => {
          setLinks(next);
          save({ notes, links: next });
        }}
      />
    </div>
  );
}

/** Note pad for a workout template, shown whenever it's logged. */
export function WorkoutNotepad({ workout, onChange }: { workout: Workout; onChange?: (notes: string) => void }) {
  const [notes, setNotes] = useState(workout.notes ?? '');

  return (
    <div className="notepad">
      <NoteText
        value={notes}
        autoFocus={!notes}
        placeholder={`Notes for ${workout.name}: warm-up, order, anything to remember`}
        onChange={(v) => {
          setNotes(v);
          // Editors that already persist the workout pass onChange; elsewhere save it directly.
          if (onChange) onChange(v);
          else void repo.saveWorkout({ ...workout, notes: v, updatedAt: now() });
        }}
      />
    </div>
  );
}
