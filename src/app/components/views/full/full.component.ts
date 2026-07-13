import type { OnInit, OnDestroy } from '@angular/core';
import { Component, ElementRef, Input, input, output } from '@angular/core';

import { FilePathService } from '../file-path.service';

import { metaAppear, textAppear } from '../../../common/animations';

import type { ImageElement } from '../../../../../interfaces/final-object.interface';
import { ImageElementService } from './../../../services/image-element.service';
import type { RightClickEmit, VideoClickEmit } from '../../../../../interfaces/shared-interfaces';
import { createVisibilityGate } from '../../../common/visibility-gate';

@Component({
  standalone: false,
  selector: 'app-full-item',
  templateUrl: './full.component.html',
  styleUrls: [
      '../time-and-rez.scss',
      '../film-and-full.scss',
      '../selected.scss'
    ],
  animations: [ textAppear, metaAppear ]
})
export class FullViewComponent implements OnInit, OnDestroy {

  readonly videoClick = output<VideoClickEmit>();
  readonly rightClick = output<RightClickEmit>();

  @Input()
  set galleryWidth(galleryWidth: number) {
    this._metaWidth = galleryWidth;
    this.render();
  }

  @Input()
  set imgHeight(imageHeight: number) {
    this._imgHeight = imageHeight;
    this.render();
  }

  readonly video = input<ImageElement>();

  readonly darkMode = input<boolean>();
  readonly elHeight = input<number>();
  readonly folderPath = input<string>();
  readonly hubName = input<string>();
  readonly largerFont = input<boolean>();
  readonly showMeta = input<boolean>();
  readonly showFavorites = input<boolean>();

  _imgHeight: number;
  _metaWidth: number;
  computedWidth: number;
  fullFilePath = '';
  rowOffsets: number[];

  // when false, the background-image binding is unbound in the template --
  // releases the image for a row that's still mounted (e.g. just outside the
  // visible viewport, ahead of virtual-scroller actually destroying it) but
  // not actually on screen. Restores immediately (no idle delay) once visible
  // again, since a fast, always-current image is the entire point of this view.
  rowVisible = true;

  private disconnectVisibilityGate: () => void;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    public filePathService: FilePathService,
    public imageElementService: ImageElementService
  ) { }

  ngOnInit() {
    this.fullFilePath = this.filePathService.createFilePath(this.folderPath(), this.hubName(), 'filmstrips', this.video().hash);
    this.render();
    this.disconnectVisibilityGate = createVisibilityGate(
      this.elementRef.nativeElement,
      () => { this.rowVisible = true; },
      () => { this.rowVisible = false; },
    );
  }

  ngOnDestroy(): void {
    this.disconnectVisibilityGate?.();
  }

  render(): void {
    const imgWidth = this._imgHeight * 16 / 9;
    const imagesPerRow = Math.floor(this._metaWidth / imgWidth) || 1; // never let this be zero
    this.computedWidth = imgWidth * imagesPerRow;
    const numOfRows = Math.ceil((<any>(this.video() || {screens: 0}).screens) / imagesPerRow);
    this.rowOffsets = [];
    for (let i = 0; i < numOfRows; i++) {
      this.rowOffsets.push(i * Math.floor(this._metaWidth / imgWidth));
    }
  }

  toggleHeart(mouseClick: PointerEvent): void {
    mouseClick.stopPropagation();
    this.imageElementService.toggleHeart(this.video().index);
  }
}
