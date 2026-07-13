import { Injectable } from '@angular/core';

/**
 * Concurrency-limited admission gate shared by every view that mounts clip
 * videos (Clips, Segments -- each Segments row shares one clip file across
 * all its tiles, so admission is per-row there, not per-tile). Unlike
 * `VideoAutoplaySchedulerService` (which only staggers *when* an already-
 * admitted video starts playing and never denies anything), this caps how
 * many components may be actively *loading* -- i.e. have `[src]` bound and
 * are fetching/decoding -- at once.
 *
 * This is a worker-pool, not a visibility cap: a slot is released as soon as
 * the caller's load finishes (its video fires `loadeddata`/`loadedmetadata`),
 * not when the component is destroyed. That's the important part -- tying
 * release to "mounted" rather than "done loading" was tried first and starves
 * anything past the first `maxConcurrent` components whenever enough of them
 * stay visible/mounted at once (which is the common case, not an edge case).
 * With release-on-load-complete, every component gets its turn quickly
 * regardless of how many are on screen, since each slot only holds for the
 * duration of one load, not indefinitely. `ngOnDestroy` still calls release
 * too, as a fallback for a component that's abandoned (scrolled away) before
 * it ever finished loading -- calling an already-released release fn is a
 * safe no-op (see below).
 */
@Injectable({ providedIn: 'root' })
export class ClipLoadQueueService {

  // Bounds simultaneous in-flight network/decode operations, not how much can
  // ever be displayed -- since slots free up as soon as each load finishes
  // (not when a component leaves the screen), this only affects how many
  // loads race each other at once, not whether something eventually loads.
  private readonly steadyStateMax = 10;
  // A big, sudden burst (fresh search/hub load rendering dozens of rows at
  // once) drains much faster with a temporarily wider gate -- reverts to
  // steadyStateMax automatically once the backlog clears, so this doesn't
  // loosen the steady-state (scrolling) protection at all.
  private readonly burstMax = 30;
  private readonly burstThreshold = 15; // queue depth that switches into burst mode

  // Caps how many components may hold an already-*loaded* clip resident at
  // once, independent of the above -- once a load finishes, its component
  // moves from "loading" (bounded above) to "resident" (bounded here). This
  // is what lets a large `[bufferAmount]` stay mounted for a long time
  // without unbounded memory growth: the oldest resident gets evicted (video
  // paused/unbound, but its component is NOT destroyed) to make room, and
  // will simply re-request a load if it's still relevant later. ~80 is a
  // rough stand-in for "a few hundred MB of resident clip data", not a
  // precise measurement (the browser doesn't expose real decoder memory use).
  private readonly residentCap = 80;

  private activeCount = 0;
  private queue: Array<() => void> = [];
  private residentOrder: Array<{ evict: () => void }> = [];

  private get effectiveMax(): number {
    return this.queue.length > this.burstThreshold ? this.burstMax : this.steadyStateMax;
  }

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

    if (this.activeCount < this.effectiveMax) {
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
   * Register a component as holding a fully-loaded (not just admitted-to-load)
   * clip, once it's done loading -- separate from and after `request()`'s
   * slot. If the resident count exceeds `residentCap`, the oldest registered
   * entry is evicted (its `evict` callback fires) to make room; the evicted
   * component is expected to release its own decoder and re-`request()` if
   * it's still relevant, not be destroyed.
   * @returns an unregister function -- call it if the component goes away
   *          (destroyed, or evicted through some other path) so a stale
   *          entry doesn't linger
   */
  markResident(evict: () => void): () => void {
    const entry = { evict };
    this.residentOrder.push(entry);
    while (this.residentOrder.length > this.residentCap) {
      const oldest = this.residentOrder.shift();
      if (oldest && oldest !== entry) {
        oldest.evict();
      }
    }
    return () => {
      const index = this.residentOrder.indexOf(entry);
      if (index !== -1) {
        this.residentOrder.splice(index, 1);
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
