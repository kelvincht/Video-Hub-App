import { Injectable } from '@angular/core';

/**
 * Concurrency-limited admission gate shared by every view that mounts clip
 * videos (Clips, Segments -- each Segments row shares one clip file across
 * all its tiles, so admission is per-row there, not per-tile). Unlike
 * `VideoAutoplaySchedulerService` (which only staggers *when* an already-
 * admitted video starts playing and never denies anything), this caps how
 * many components may have `[src]` bound -- i.e. actually loading/decoding --
 * at once, persistently, not just during initial load.
 *
 * A component holds its slot for as long as it's mounted; released on
 * `ngOnDestroy`. Combined with the gallery's virtual-scroller running with
 * `[bufferAmount]="0"`, that keeps the "currently loading" set close to "what's
 * actually on screen" without needing any separate visibility tracking here.
 */
@Injectable({ providedIn: 'root' })
export class ClipLoadQueueService {

  // ~6 keeps total concurrent decode/network load in a reasonable range
  // regardless of view; tune if needed.
  private readonly maxConcurrent = 6;

  private activeCount = 0;
  private queue: Array<() => void> = [];

  /**
   * @param onAdmitted called once a slot is available (immediately, if one
   *        already is)
   * @returns a release function -- call it when the slot is no longer needed
   *          (component destroyed), whether or not `onAdmitted` ever fired
   */
  request(onAdmitted: () => void): () => void {
    let admitted = false;
    let queuedEntry: (() => void) | undefined;

    const admit = () => {
      this.activeCount++;
      admitted = true;
      onAdmitted();
    };

    if (this.activeCount < this.maxConcurrent) {
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
   * deliberate user action (hover) that must never wait on the budget.
   * Temporarily allowed to exceed `maxConcurrent` by design.
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
