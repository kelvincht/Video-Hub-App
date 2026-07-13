import type { OnInit, OnDestroy } from '@angular/core';
import { Component, ElementRef, input, output, viewChild } from '@angular/core';

import { FilePathService } from '../file-path.service';

import { metaAppear, textAppear } from '../../../common/animations';

import type { ImageElement } from '../../../../../interfaces/final-object.interface';
import { ImageElementService } from './../../../services/image-element.service';
import type { RightClickEmit, VideoClickEmit } from '../../../../../interfaces/shared-interfaces';
import { createVisibilityGate } from '../../../common/visibility-gate';

@Component({
  standalone: false,
  selector: 'app-filmstrip-item',
  templateUrl: './filmstrip.component.html',
  styleUrls: [
      '../film-and-full.scss',
      '../time-and-rez.scss',
      '../selected.scss',
      './filmstrip.component.scss'
    ],
  animations: [ textAppear, metaAppear ]
})
export class FilmstripComponent implements OnInit, OnDestroy {

  readonly filmstripHolder = viewChild<ElementRef>('filmstripHolder');

  readonly videoClick = output<VideoClickEmit>();
  readonly rightClick = output<RightClickEmit>();

  readonly video = input<ImageElement>();

  readonly compactView = input<boolean>();
  readonly darkMode = input<boolean>();
  readonly elHeight = input<number>();
  readonly folderPath = input<string>();
  readonly hoverScrub = input<boolean>();
  readonly hubName = input<string>();
  readonly imgHeight = input<number>();
  readonly largerFont = input<boolean>();
  readonly showMeta = input<boolean>();
  readonly showFavorites = input<boolean>();

  fullFilePath = '';
  filmXoffset = 0;
  indexToShow = 1;

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
    this.disconnectVisibilityGate = createVisibilityGate(
      this.elementRef.nativeElement,
      () => { this.rowVisible = true; },
      () => { this.rowVisible = false; },
    );
  }

  ngOnDestroy(): void {
    this.disconnectVisibilityGate?.();
  }

  updateFilmXoffset(mouseMove: PointerEvent) {
    if (this.hoverScrub()) {
      const imgWidth = this.imgHeight() * (16 / 9); // hardcoded aspect ratio
      const containerWidth = this.filmstripHolder().nativeElement.getBoundingClientRect().width;
      const howManyScreensOutsideCutoff = this.video().screens - Math.floor(containerWidth / imgWidth);

      const cursorX = mouseMove.layerX; // cursor's X position inside the filmstrip element
      this.indexToShow = Math.floor(cursorX * (this.video().screens / containerWidth));
      this.filmXoffset = imgWidth * Math.floor(cursorX / (containerWidth / howManyScreensOutsideCutoff));
    }
  }

  toggleHeart(mouseClick: PointerEvent): void {
    mouseClick.stopPropagation();
    this.imageElementService.toggleHeart(this.video().index);
  }
}
