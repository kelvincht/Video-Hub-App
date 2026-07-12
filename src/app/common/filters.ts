import { Colors } from './colors';

export interface FilterObject {
  uniqueKey: string;
  string: string;  // search string
  array: string[]; // container for all search strings
  bool: boolean;   // dummy to flip the trigger pipe
  placeholder: string;
  conjunction: string;
  color: string;
  recursive?: boolean; // folder filters only: match subfolders too, not just the exact folder
  strict?: boolean; // folder filters only: match the whole folder name exactly, rather than as a substring
}

export const FilterKeyNames: string[] = [
  'folderUnion',        // [0]
  'folderIntersection', // [1]
  'folderExclusion',    // [2]
  'fileUnion',          // [3]
  'fileIntersection',   // [4]
  'exclude',            // [5]
  'tagUnion',           // [6]
  'tagIntersection',    // [7]
  'tagExclusion',       // [8]
  'videoNotes',         // [9]
];

export const Filters: FilterObject[] = [
  {
    uniqueKey: 'folderUnion',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.folderUnion',
    conjunction: 'SIDEBAR.or',
    color: Colors.folderUnion,
    recursive: true,
    strict: false
  }, {
    uniqueKey: 'folderIntersection',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.folder',
    conjunction: 'SIDEBAR.and',
    color: Colors.folderIntersection,
    recursive: true,
    strict: false
  }, {
    uniqueKey: 'folderExclusion',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.folderExclusion',
    conjunction: 'SIDEBAR.or',
    color: Colors.folderExclusion,
    recursive: true,
    strict: false
  }, {
    uniqueKey: 'fileUnion',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.fileUnion',
    conjunction: 'SIDEBAR.or',
    color: Colors.fileUnion
  }, {
    uniqueKey: 'fileIntersection',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.file',
    conjunction: 'SIDEBAR.and',
    color: Colors.fileIntersection
  }, {
    uniqueKey: 'exclude',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.exclude',
    conjunction: 'SIDEBAR.or',
    color: Colors.exclude
  }, {
    uniqueKey: 'tagUnion',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.tagUnion',
    conjunction: 'SIDEBAR.or',
    color: Colors.tagUnion
  }, {
    uniqueKey: 'tagIntersection',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.tagIntersection',
    conjunction: 'SIDEBAR.and',
    color: Colors.tagIntersection
  }, {
    uniqueKey: 'tagExclusion',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.tagExclusion',
    conjunction: 'SIDEBAR.or',
    color: Colors.tagExclusion
  }, {
    uniqueKey: 'videoNotes',
    string: '',
    array: [],
    bool: true,
    placeholder: 'SIDEBAR.videoNotes',
    conjunction: 'SIDEBAR.and',
    color: Colors.videoNotes
  }
];

export const filterKeyToIndex = {
  folderUnion:        0,
  folderIntersection: 1,
  folderExclusion:    2,
  fileUnion:          3,
  fileIntersection:   4,
  exclude:            5,
  tagUnion:           6,
  tagIntersection:    7,
  tagExclusion:       8,
  videoNotes:         9,
};
