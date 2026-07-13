/**
 * Watches `element` for viewport intersection and invokes `onVisible`/`onHidden`
 * as it enters/leaves -- used to gate `[src]`/background-image bindings so a
 * row that's still mounted but scrolled off-screen (ahead of virtual-scroller's
 * own `[bufferAmount]="0"` culling actually catching up) stops fetching/decoding
 * immediately, instead of continuing in the background until Angular destroys it.
 *
 * `root` must be the nearest `<virtual-scroller>` ancestor, not the default
 * (browser viewport) -- `<virtual-scroller>` scrolls internally (overflow-y:
 * auto) rather than scrolling the page, so with the default root these rows
 * would never be reported as non-intersecting no matter how far they scroll past.
 *
 * @returns a disconnect function -- call it in `ngOnDestroy`
 */
export function createVisibilityGate(
  element: HTMLElement,
  onVisible: () => void,
  onHidden: () => void,
): () => void {
  const root = element.closest('virtual-scroller');
  const observer = new IntersectionObserver((entries) => {
    if (entries[entries.length - 1].isIntersecting) {
      onVisible();
    } else {
      onHidden();
    }
  }, { root, threshold: 0 });
  observer.observe(element);
  return () => observer.disconnect();
}
