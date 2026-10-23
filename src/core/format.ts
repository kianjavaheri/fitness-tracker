export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
  return new Date(iso).toLocaleDateString(undefined, opts);
}

export function formatDateLong(iso: string) {
  return formatDate(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatNumber(n: number) {
  return Math.round(n).toLocaleString();
}

/** "Today", "Yesterday", "3 days ago", else a short date. `inSentence` lowercases the words but not month names. */
export function relativeDay(iso: string, inSentence = false) {
  const word = (w: string) => (inSentence ? w.toLowerCase() : w);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(new Date(iso))) / 86_400_000);
  if (diff === 0) return word('Today');
  if (diff === 1) return word('Yesterday');
  if (diff < 7) return `${diff} days ago`;
  return formatDate(iso);
}

export function pluralize(n: number, word: string, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}

/** ISO timestamp → value for an <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
