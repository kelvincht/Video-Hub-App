import type { OnInit, OnDestroy } from '@angular/core';
import { Component, ElementRef, Input, input, output, viewChild } from '@angular/core';

import { FilePathService } from '../file-path.service';

import { metaAppear, textAppear } from '../../../common/animations';

import { ImageElementService } from './../../../services/image-element.service';
import type { ImageElement } from '../../../../../interfaces/final-object.interface';
import type { VideoClickEmit, RightClickEmit } from '../../../../../interfaces/shared-interfaces';
import { createVisibilityGate } from '../../../common/visibility-gate';

@Component({
  standalone: false,
  selector: 'app-thumbnail',
  templateUrl: './thumbnail.component.html',
  styleUrls: [
    '../clip-and-preview.scss',
    '../time-and-rez.scss',
    './thumbnail.component.scss',
    '../selected.scss'
  ],
  animations: [textAppear, metaAppear]
})
export class ThumbnailComponent implements OnInit, OnDestroy {

  readonly filmstripHolder = viewChild<ElementRef>('filmstripHolder');

  readonly refreshPlaylist = output<void>();
  readonly rightClick = output<RightClickEmit>();
  readonly sheetClick = output<void>();
  readonly videoClick = output<VideoClickEmit>();

  readonly heartPressed = output<void>();

  @Input() video: ImageElement;

  // when `true`, clicking always opens the video from the start regardless of
  // which screenshot is currently showing/hover-scrubbed (used by the main
  // thumbnail grid only -- the Details tray/view usages of this component
  // leave this at its default `false` to keep their existing timestamp-click
  // support)
  readonly alwaysPlayFromStart = input<boolean>(false);
  readonly compactView = input<boolean>();
  readonly connected = input<boolean>();
  readonly darkMode = input<boolean>();
  readonly elHeight = input<number>();
  readonly elWidth = input<number>();
  readonly folderPath = input<string>();
  readonly hoverScrub = input<boolean>();
  readonly hubName = input<string>();
  readonly imgHeight = input<number>();
  readonly largerFont = input<boolean>();
  readonly returnToFirstScreenshot = input<boolean>();
  readonly showFavorites = input<boolean>();
  readonly showMeta = input<boolean>();
  readonly thumbAutoAdvance = input<boolean>();

  containerWidth = 100; // arbitrary rather than undefined
  firstFilePath = '';
  folderThumbPaths: string[] = [];
  fullFilePath = '';
  hover = false;
  indexToShow = 1;
  percentOffset = 0;
  scrollInterval: any = null;

  // when false, [src]/background-image bindings are unbound in the template --
  // releases the image for a row that's still mounted (e.g. just outside the
  // visible viewport, ahead of virtual-scroller actually destroying it) but
  // not actually on screen. Restores immediately (no idle delay) once visible
  // again, since a fast, always-current thumbnail is the entire point of this view.
  rowVisible = true;

  private disconnectVisibilityGate: () => void;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    public filePathService: FilePathService,
    public imageElementService: ImageElementService,
  ) { }

  ngOnInit() {
    // multiple hashes == folder view
    if (this.video.hash.indexOf(':') !== -1) {
      const hashes = this.video.hash.split(':');
      hashes.slice(0, 4).forEach((hash) => {
        this.folderThumbPaths.push(this.filePathService.createFilePath(this.folderPath(), this.hubName(), 'thumbnails', hash));
      });
    } else {
      this.firstFilePath = this.filePathService.createFilePath(this.folderPath(), this.hubName(), 'thumbnails', this.video.hash);
      this.fullFilePath = this.filePathService.createFilePath(this.folderPath(), this.hubName(), 'filmstrips', this.video.hash);
      this.folderThumbPaths.push(this.firstFilePath);
    }

    if (this.video.defaultScreen) {
      this.hover = true;
      this.percentOffset = this.defaultScreenOffset(this.video);
    }

    this.disconnectVisibilityGate = createVisibilityGate(
      this.elementRef.nativeElement,
      () => { this.rowVisible = true; },
      () => { this.rowVisible = false; },
    );
  }

  defaultScreenOffset(video: ImageElement): number {
    return 100 * video.defaultScreen / video.screens;
  }

  mouseEntered() {
    this.containerWidth = this.filmstripHolder().nativeElement.getBoundingClientRect().width;

    if (this.thumbAutoAdvance()) {
      this.hover = true;

      this.scrollInterval = setInterval(() => {
        this.percentOffset = this.indexToShow * (100 / this.video.screens);
        this.indexToShow++;
      }, 750);

    } else if (this.hoverScrub()) {
      this.hover = true;
    }
  }

  mouseLeft() {
    if (this.thumbAutoAdvance()) {
      clearInterval(this.scrollInterval);
    }

    if (this.returnToFirstScreenshot()) {
      if (this.video.defaultScreen !== undefined) {
        this.percentOffset = this.defaultScreenOffset(this.video);
      } else {
        this.hover = false;
        this.percentOffset = 0;
      }
    }
  }

  mouseIsMoving($event: any) {
    if (this.hoverScrub()) {
      const cursorX = $event.layerX;
      this.indexToShow = Math.floor(cursorX * (this.video.screens / this.containerWidth));
      this.percentOffset = this.indexToShow * (100 / this.video.screens);
    }
  }

  ngOnDestroy() {
    clearInterval(this.scrollInterval);
    this.disconnectVisibilityGate?.();
  }

  openDetailsView(leftClick: PointerEvent): void {
    leftClick.stopPropagation()

    this.sheetClick.emit();
  }

  toggleHeart(leftClick: PointerEvent): void {
    leftClick.stopPropagation();

    this.imageElementService.toggleHeart(this.video.index);
    this.heartPressed.emit();
  }

  togglePlaylist(leftClick: PointerEvent): void {
    leftClick.stopPropagation();

    this.imageElementService.updatePlaylist(this.video.index);
    this.refreshPlaylist.emit();
  }

}
