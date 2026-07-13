/**
 * Deterministically releases every `<video>` decoder under `element`, rather
 * than relying solely on Angular's DOM removal (which can lag behind an
 * `ngOnDestroy` by a tick, keeping the decoder alive longer than needed).
 */
export function releaseVideoDecoders(element: HTMLElement): void {
  element.querySelectorAll('video').forEach((v: HTMLVideoElement) => {
    v.pause();
    v.removeAttribute('src');
    v.load();
  });
}
