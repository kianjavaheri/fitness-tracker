// Keeps what you're typing in above the on-screen keyboard on iPhones.
//
// iOS doesn't shrink the page for the keyboard: it shrinks the *visual* viewport and leaves fixed elements attached to
// the full-height layout viewport, so a sheet pinned to the bottom of the screen (a dialog with a text field that
// focuses as it opens) ends up behind the keyboard. Only a later tap, which makes iOS scroll to the field, fixed it.
//
// So the visible area is published as CSS variables (--vv-top, --vv-height) that dialog overlays size themselves to,
// html gets .keyboard-open while the keyboard is up, and a focused field that's still covered is scrolled into view.

const KEYBOARD_MIN_PX = 120;

export function trackKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;

  const update = () => {
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.style.setProperty('--vv-height', `${vv.height}px`);
    const open = window.innerHeight - vv.height > KEYBOARD_MIN_PX;
    root.classList.toggle('keyboard-open', open);
    if (open) revealFocused();
  };

  /** A text field covered by the keyboard (in the page, not a dialog, which follows the viewport) scrolls into view. */
  const revealFocused = () => {
    const field = document.activeElement;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || (field as HTMLElement | null)?.isContentEditable)) return;
    const box = (field as HTMLElement).getBoundingClientRect();
    const visibleBottom = vv.offsetTop + vv.height;
    if (box.bottom > visibleBottom - 12 || box.top < vv.offsetTop) {
      (field as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  // A field focused while the keyboard is already up (moving between fields) doesn't resize the viewport.
  document.addEventListener('focusin', () => setTimeout(() => root.classList.contains('keyboard-open') && revealFocused(), 300));
  update();
}
