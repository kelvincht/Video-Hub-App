import type { VideoAutoplaySchedulerService } from '../services/video-autoplay-scheduler.service';

/**
 * Per-component bookkeeping for scheduled-but-not-yet-started autoplay begins,
 * keyed by the `<video>` they belong to. Wraps `VideoAutoplaySchedulerService`
 * so `clip.component` and `segments.component` don't each hand-roll the same
 * Map + schedule/cancel pattern.
 *
 * Hover-triggered playback always bypasses this entirely (calls `.play()`
 * directly) -- a deliberate user action must never wait on a video that's
 * still in its idle-scheduled holding period.
 */
export function createAutoplayStartTracker(scheduler: VideoAutoplaySchedulerService) {
  const pending = new Map<HTMLVideoElement, () => void>();

  return {
    /** Idempotent -- a video already scheduled is left alone. */
    start(video: HTMLVideoElement, onStart: () => void): void {
      if (pending.has(video)) {
        return;
      }
      const cancel = scheduler.schedule(() => {
        pending.delete(video);
        onStart();
      });
      pending.set(video, cancel);
    },

    /** No-op if `video` has no pending start. */
    cancel(video: HTMLVideoElement): void {
      pending.get(video)?.();
      pending.delete(video);
    },

    cancelAll(): void {
      pending.forEach((cancel) => cancel());
      pending.clear();
    },
  };
}
