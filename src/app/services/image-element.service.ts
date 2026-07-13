import { Injectable } from '@angular/core';

import type { DefaultScreenEmission, StarEmission } from '../components/sheet/sheet.component';
import type { ImageElement } from './../../../interfaces/final-object.interface';
import type { TagEmission } from './../../../interfaces/shared-interfaces';
import type { YearEmission} from './../components/views/details/details.component';

@Injectable({ providedIn: 'root' })
export class ImageElementService {

  public finalArrayNeedsSaving = false;
  public forceStarFilterUpdate = true;
  public imageElements: ImageElement[] = [];

  constructor() { }

  /**
   * Replace `imageElements[index]` with a new object (shallow clone + patch)
   * rather than mutating the existing object in place.
   *
   * This matters for `OnPush` leaf components (thumbnail/file/full/etc.):
   * they read `video` via `@Input`, and `OnPush` only re-renders when that
   * reference changes. In-place mutation left the reference identical, so
   * changes triggered from elsewhere (Details panel, bulk actions, keyboard
   * shortcuts) would not repaint the grid row for that item.
   */
  private patchElement(index: number, patch: Partial<ImageElement>): void {
    this.imageElements[index] = { ...this.imageElements[index], ...patch };
  }

  /**
   * Update imageElements with emission of element
   * @param emission
   */
  HandleEmission(emission: YearEmission | StarEmission | TagEmission | DefaultScreenEmission): void {
    const index: number = emission.index;

    if (       'year' in emission) {

      this.patchElement(index, { year: (emission as YearEmission).year });

    } else if ('stars' in emission) {

      this.patchElement(index, { stars: (emission as StarEmission).stars });
      this.forceStarFilterUpdate = !this.forceStarFilterUpdate;

    } else if ('defaultScreen' in emission) {

      this.patchElement(index, { defaultScreen: (emission as DefaultScreenEmission).defaultScreen });

    } else if ('tag' in emission) {

      this.handleTagEmission(emission as TagEmission);

    } else {
      console.log('THIS SHOULD NOT HAPPEN!');
    }

    this.finalArrayNeedsSaving = true;
  }

  /**
   * Searches through the `finalArray` and updates the file name and display name
   * Should not error out if two files have the same name
   */
  replaceFileNameInFinalArray(renameTo: string, oldFileName: string, index: number): void {

    if (this.imageElements[index].fileName === oldFileName) {
      this.patchElement(index, {
        fileName: renameTo,
        cleanName: renameTo.slice().substr(0, renameTo.lastIndexOf('.')),
      });
    }

    this.finalArrayNeedsSaving = true;
  }

  /**
   * update number of times played & the `lastPlayed` date
   * @param index
   */
  updateNumberOfTimesPlayed(index: number): void {

    this.patchElement(index, {
      lastPlayed: Date.now(), // update `lastPlayed`
      timesPlayed: this.imageElements[index].timesPlayed
        ? this.imageElements[index].timesPlayed + 1
        : 1,                  // update `timesPlayed`
    });

    this.finalArrayNeedsSaving = true;
  }

  /**
   * Toggle heart
   */
  toggleHeart(index: number): void {
    if (this.imageElements[index].stars == 5.5) { // "un-favorite" the video
      this.HandleEmission({
        index: index,
        stars: 0.5
      });
    } else { // "favorite" the video
      this.HandleEmission({
        index: index,
        stars: 5.5
      });
    }
  }

  /**
   * Update playlist field
   */
  updatePlaylist(index: number): void {

    if (this.imageElements[index].playlist) {
      const { playlist, ...rest } = this.imageElements[index];
      this.imageElements[index] = rest as ImageElement;
    } else {
      this.patchElement(index, { playlist: Date.now() });
    }

    this.finalArrayNeedsSaving = true;
  }

  /**
   * Clear out the playlist
   */
  emptyPlaylist(): void {
    this.imageElements = this.imageElements.map((element) => {
      if (!element.playlist) {
        return element;
      }
      const { playlist, ...rest } = element;
      return rest as ImageElement;
    });

    this.finalArrayNeedsSaving = true;
  }

  private handleTagEmission(emission: TagEmission): void {
    const position: number = emission.index;
    if (emission.type === 'add') {
      const tags: string[] = this.imageElements[position].tags
        ? [...this.imageElements[position].tags, emission.tag]
        : [emission.tag];
      this.patchElement(position, { tags });
    } else {
      const tags: string[] = this.imageElements[position].tags.filter((tag) => tag !== emission.tag);
      this.patchElement(position, { tags });
    }
  }

}
