import { Injectable } from '@angular/core';

/**
 * Concurrency-limited admission gate for the Segments view, where every row's
 * `clipSnippets` tiles share one underlying clip file -- unlike
 * `VideoAutoplaySchedulerService` (which only staggers *when* an already-
 * admitted video starts playing and never denies anything), this actually
 * caps how many rows may be decoding/playing at once, persistently -- not
 * just during initial load.
 *
 * Budgeting by ROW (rather than by individual tile) keeps the total
 * concurrently-active `<video>` count in a sane range regardless of
 * `clipSnippets`, since all of a row's tiles come from the same file.
 *
 * A row holds its slot for as long as it's visible; released when it scrolls
 * away or is destroyed (not on `loadedmetadata`) -- that's what keeps this a
 * steady-state cap rather than a one-time load-ramp throttle.
 */
@Injectable({ providedIn: 'root' })
export class SegmentClipLoadQueueService {

  // ~6-8 rows keeps total concurrent tiles in the 100-200 ballpark reported
  // as the realistic target (e.g. 6 rows x ~20-30 snippets); tune if needed.
  private readonly maxConcurrentRows = 6;

  private activeCount = 0;
  private queue: Array<() => void> = [];

  /**
   * @param onAdmitted called once a slot is available (immediately, if one
   *        already is)
   * @returns a release function -- call it when the row stops needing its
   *          slot (no longer visible, or destroyed), whether or not
   *          `onAdmitted` ever actually fired
   */
  request(onAdmitted: () => void): () => void {
    let admitted = false;
    let queuedEntry: (() => void) | undefined;

    const admit = () => {
      this.activeCount++;
      admitted = true;
      onAdmitted();
    };

    if (this.activeCount < this.maxConcurrentRows) {
      admit();
    } else {
      queuedEntry = admit;
      this.queue.push(queuedEntry);
    }

    return () => {
      if (admitted) {
        this.activeCount--;
        admitted = false;
        const next = this.queue.shift();
        if (next) {
          next();
        }
      } else if (queuedEntry) {
        const index = this.queue.indexOf(queuedEntry);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
        queuedEntry = undefined;
      }
    };
  }

  /**
   * Force-admit right away, bypassing the queue entirely -- used for a
   * deliberate user action (hover) that must never wait on the budget, same
   * spirit as hover already bypassing `VideoAutoplaySchedulerService`.
   * Temporarily allowed to exceed `maxConcurrentRows` by design.
   * @returns a release function, same contract as `request()`
   */
  forceAdmit(): () => void {
    this.activeCount++;
    let released = false;

    return () => {
      if (released) {
        return;
      }
      released = true;
      this.activeCount--;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    };
  }

}
