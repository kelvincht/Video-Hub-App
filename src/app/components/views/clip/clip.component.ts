import { ChangeDetectorRef, ElementRef, input, output } from '@angular/core';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component, HostListener, Input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

import { FilePathService } from '../file-path.service';
import { ImageElementService } from './../../../services/image-element.service';

import type { ImageElement } from '../../../../../interfaces/final-object.interface';
import type { RightClickEmit, VideoClickEmit } from '../../../../../interfaces/shared-interfaces';

import { metaAppear, textAppear } from '../../../common/animations';
import { createVisibilityGate } from '../../../common/visibility-gate';

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
export class ClipComponent implements OnInit, OnDestroy {

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

  // when false, [src] is unbound in the template -- releases the decoder for a
  // row that's still mounted (e.g. just outside the visible viewport, ahead of
  // virtual-scroller actually destroying it) but not actually on screen.
  rowVisible = true;

  private disconnectVisibilityGate: () => void;

  constructor(
    public cd: ChangeDetectorRef,
    private elementRef: ElementRef<HTMLElement>,
    public filePathService: FilePathService,
    public imageElementService: ImageElementService,
    public sanitizer: DomSanitizer
  ) { }

  @HostListener('mouseenter') onMouseEnter() {
    this.hover = true;
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

    this.disconnectVisibilityGate = createVisibilityGate(
      this.elementRef.nativeElement,
      () => { this.rowVisible = true; },
      () => {
        this.rowVisible = false;
        this.elementRef.nativeElement.querySelectorAll('video').forEach((v: HTMLVideoElement) => v.pause());
      },
    );
  }

  ngOnDestroy(): void {
    this.disconnectVisibilityGate?.();
  }

  toggleHeart(mouseClick: PointerEvent): void {
    mouseClick.stopPropagation();
    this.imageElementService.toggleHeart(this.video.index);
  }

}
