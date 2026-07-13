import type { PipeTransform } from '@angular/core';
import { Pipe } from '@angular/core';

import type { ImageElement } from '../../../interfaces/final-object.interface';

import Fuse from 'fuse.js';

@Pipe({
  standalone: false,
  name: 'fuzzySearchPipe'
})
export class FuzzySearchPipe implements PipeTransform {

  options = {
    threshold: 0.4, // 0 => perfect match, 1 => match anything
    shouldSort: true, // note we disable sorting when fuzzySearchPipe is engaged (searchString > 2)
    minMatchCharLength: 2,
    keys: ['cleanName'],
  };

  // Cache the Fuse index -- rebuilding it is the expensive part, and the
  // source array only changes when the library is rescanned/filtered upstream,
  // not on every keystroke of the search box.
  private cachedArray: ImageElement[] | undefined;
  private cachedFuse: Fuse<ImageElement> | undefined;

  /**
   * Return only items that ~fuzzy~ match search string
   * @param finalArray
   * @param searchString  the search string
   */
  transform(finalArray: ImageElement[], searchString?: string): ImageElement[] {

    if (searchString === '' || searchString.length < 3) {
      return finalArray;
    } else {
      if (finalArray !== this.cachedArray) {
        this.cachedArray = finalArray;
        this.cachedFuse = new Fuse(finalArray, this.options);
      }

      return this.cachedFuse.search(searchString).map((element) => element.item);
    }
  }

}
