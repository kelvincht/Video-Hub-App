import { ChangeDetectorRef, ElementRef, NgZone, input, output } from '@angular/core';
import type { AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { Component, HostListener, Input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { FilePathService } from '../file-path.service';
import { ImageElementService } from './../../../services/image-element.service';
import { ClipLoadQueueService } from './../../../services/clip-load-queue.service';

import type { ImageElement } from '../../../../../interfaces/final-object.interface';
import type { RightClickEmit, VideoClickEmit } from '../../../../../interfaces/shared-interfaces';

import { metaAppear, textAppear } from '../../../common/animations';
import { releaseVideoDecoders } from '../../../common/release-video-decoders';

@Component({
  standalone: false,
  selector: 'app-clip-item',
  templateUrl: './clip.component.html',
  styleUrls: [
      '../clip-and-preview.scss',
      '../time-and-rez.scss',
      './clip.component.scss',
      '../selected.scss'
    ],
  animations: [ textAppear, metaAppear ]
})
export class ClipComponent implements OnInit, AfterViewInit, OnDestroy {

  readonly rightClick = output<RightClickEmit>();
  readonly sheetClick = output<any>(); // does not emit data of any kind
  readonly videoClick = output<VideoClickEmit>();

  @Input() video: ImageElement;

  readonly autoplay = input<boolean>();
  readonly compactView = input<boolean>();
  readonly darkMode = input<boolean>();
  readonly elHeight = input<number>();
  readonly elWidth = input<number>();
  readonly folderPath = input<string>();
  readonly forceMute = input<boolean>();
  readonly defaultThumbnailMode = input<boolean>();
  readonly returnToFirstScreenshot = input<boolean>();
  readonly hubName = input<string>();
  readonly imgHeight = input<number>();
  readonly largerFont = input<boolean>();
  readonly showMeta = input<boolean>();

  appInFocus = true;
  folderPosterPaths: string[] = [];
  folderThumbPaths: string[] = [];
  hover: boolean;
  noError = true;
  pathToVideo = '';
  poster: string;
  posterFolderType: any = 'clips';

  // when false, [src] is unbound in the template (the existing [poster] frame
  // shows instead, at zero extra cost) -- this component is queued behind the
  // load-concurrency budget rather than actively loading/decoding its clip(s).
  canLoad = false;

  private releaseLoadSlot: (() => void) | undefined;
  private unregisterResident: (() => void) | undefined;
  private residentRegistered = false;
  private cleanupFns: (() => void)[] = [];

  constructor(
    public cd: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
    public filePathService: FilePathService,
    public imageElementService: ImageElementService,
    private loadQueue: ClipLoadQueueService,
    private ngZone: NgZone,
    public sanitizer: DomSanitizer
  ) { }

  @HostListener('mouseenter') onMouseEnter() {
    this.hover = true;
    // a deliberate hover must never wait on the load-concurrency budget
    if (!this.canLoad) {
      this.releaseLoadSlot?.();
      this.releaseLoadSlot = this.loadQueue.forceAdmit();
      this.canLoad = true;
    }
  }
  @HostListener('mouseleave') onMouseLeave() {
    this.hover = false;
  }
  @HostListener('window:blur', ['$event'])
  onBlur(event: any): void {
    this.appInFocus = false;
  }
  @HostListener('window:focus', ['$event'])
  onFocus(event: any): void {
    this.appInFocus = true;
  }

  stopPreview(event): any {
    if (this.defaultThumbnailMode() && this.returnToFirstScreenshot()) {
      event.target.load(); // Reload original thumbnail
    } else {
      event.target.pause();
    }
  }

  ngOnInit() {

    if (this.defaultThumbnailMode()) {
      this.posterFolderType = 'thumbnails';
    }

    // multiple hashes?
    if (this.video.hash.indexOf(':') !== -1) {
      const hashes = this.video.hash.split(':');

      hashes.slice(0, 4).forEach((hash) => {
        const folderPath = this.folderPath();
        const hubName = this.hubName();
        this.folderThumbPaths.push( this.filePathService.createFilePath(folderPath, hubName, 'clips', hash, true));
        this.folderPosterPaths.push(this.filePathService.createFilePath(folderPath, hubName, this.posterFolderType, hash));
      });
    } else {
      if (this.video.hash === undefined) {
        this.noError = false;
      }
      this.pathToVideo = this.filePathService.createFilePath(this.folderPath(), this.hubName(), 'clips', this.video.hash, true);
      this.poster =      this.filePathService.createFilePath(this.folderPath(), this.hubName(), this.posterFolderType, this.video.hash);

      this.folderThumbPaths.push(this.pathToVideo);
      this.folderPosterPaths.push(this.poster);
    }

    // wrapped in ngZone.run: a later (queued, not immediate) admission can be
    // triggered by another component's release happening outside Angular's
    // zone (see ngAfterViewInit below), so this must re-enter the zone itself
    // to make sure the resulting [src] binding update is picked up by CD
    this.releaseLoadSlot = this.loadQueue.request(() => this.ngZone.run(() => { this.canLoad = true; }));
  }

  /**
   * Release the load-queue slot as soon as this component's video has
   * actually finished loading (not when it's destroyed) -- a worker-pool
   * "job done" signal, not a visibility signal. Delegated + outside Angular's
   * zone since `loadeddata` is a media event that doesn't need to trigger
   * change detection itself; only the (rare, one-time) resulting slot
   * hand-off to a queued component needs to run inside the zone, which the
   * release call below re-enters explicitly.
   */
  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      const onLoadedData = () => {
        this.ngZone.run(() => {
          this.releaseLoadSlot?.();
          this.releaseLoadSlot = undefined;
        });
        // register as resident (fully loaded) only once -- folder view has up
        // to 4 videos, each firing this independently
        if (!this.residentRegistered) {
          this.residentRegistered = true;
          this.unregisterResident = this.loadQueue.markResident(() => this.evictLoaded());
        }
      };
      // media events do not bubble -> listen in capture phase on the host
      this.elementRef.nativeElement.addEventListener('loadeddata', onLoadedData, true);
      this.cleanupFns.push(() => this.elementRef.nativeElement.removeEventListener('loadeddata', onLoadedData, true));
    });
  }

  /**
   * Called when this component is the oldest resident and the load-queue
   * needs its slot back. Releases the decoder but does NOT destroy the
   * component -- just re-requests a load, same as the initial ngOnInit
   * request, so it picks back up quickly if it's still relevant.
   */
  private evictLoaded(): void {
    this.ngZone.run(() => { this.canLoad = false; });
    releaseVideoDecoders(this.elementRef.nativeElement);
    this.residentRegistered = false;
    this.releaseLoadSlot = this.loadQueue.request(() => this.ngZone.run(() => { this.canLoad = true; }));
  }

  ngOnDestroy(): void {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.releaseLoadSlot?.(); // no-op if already released via loadeddata
    this.unregisterResident?.();
    releaseVideoDecoders(this.elementRef.nativeElement);
  }

  toggleHeart(mouseClick: PointerEvent): void {
    mouseClick.stopPropagation();
    this.imageElementService.toggleHeart(this.video.index);
  }

}
