import type { PipeTransform } from '@angular/core';
import { Pipe } from '@angular/core';

import type { ImageElement } from '../../../interfaces/final-object.interface';

type SearchType = 'folder' | 'file' | 'tag' | 'notes';

@Pipe({
  standalone: false,
  name: 'fileSearchPipe'
})
export class FileSearchPipe implements PipeTransform {

  /**
   * Return only items that match search string
   * @param finalArray
   * @param arrOfStrings    {string}  the search string array
   * @param renderTrigger   {boolean} that is flipped just to trigger an pipe update
   * @param union           {boolean} whether it's a union or intersection
   * @param searchType      {SearchType}
   * @param exclude         {boolean} whether excluding results that contain the word
   * @param manualTags      {boolean}
   * @param autoFileTags    {boolean}
   * @param autoFolderTags  {boolean}
   * @param recursive       {boolean} folder search only: match subfolders too, not just the exact folder
   */
  transform(
    finalArray: ImageElement[],
    arrOfStrings?: string[],
    renderTrigger?: boolean,
    union?: boolean,
    searchType?: SearchType,
    exclude?: boolean,
    manualTags?: boolean,
    autoFileTags?: boolean,
    autoFolderTags?: boolean,
    recursive?: boolean
  ): ImageElement[] {

    if (arrOfStrings.length === 0) {
      return finalArray;
    } else {

      return finalArray.filter((item) => {

        // exact prefix match -- used by the "view folder" right-click action
        // (`showOnlyThisFolderNow`), which passes the video's full `partialPath`
        // as a single term; unrelated to the `recursive` flag below
        if (arrOfStrings[0].startsWith('/')) {
          return item.partialPath.startsWith(arrOfStrings[0]);
        }

        let matchFound = 0;

        arrOfStrings.forEach(element => {

          let searchString = '';
          if (searchType === 'folder') {
            // exact whole-segment match, not a blind substring check --
            // "abc" only matches a folder literally named "abc", not "xabcx".
            // Recursive: "abc" anywhere in the path (an ancestor at any
            // depth). Non-recursive: "abc" must be the direct parent folder.
            const segments = item.partialPath.split('/').filter(Boolean);
            const term = element.toLowerCase();
            const isMatch = recursive
              ? segments.some((s) => s.toLowerCase() === term)
              : segments.length > 0 && segments[segments.length - 1].toLowerCase() === term;
            if (isMatch) {
              matchFound++;
            }
            return;

          } else if (searchType === 'file') {
            searchString = item.fileName;

          } else if (searchType === 'notes') {
            searchString = item.notes || '';

          } else if (searchType === 'tag') {
            if (manualTags && item.tags) {
              searchString += item.tags.join(' ');
            }
            if (autoFileTags) {
              searchString += ' ' + item.cleanName;
            }
            if (autoFolderTags) {
              searchString += ' ' + item.partialPath.replace(/(\/)/, ' ');
            }
          }

          if (searchString.toLowerCase().indexOf(element.toLowerCase()) !== -1) {
            matchFound++;
          }
        });

        if (exclude) {
          return matchFound === 0;
        } else if (union) {
          // at least one filter exists in searched string
          return matchFound > 0;
        } else {
          // every filter exits in searched string
          return matchFound === arrOfStrings.length;
        }

      });
    }
  }

}
