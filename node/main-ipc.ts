import { app, dialog, shell, BrowserWindow } from 'electron';

import * as path from 'path';
const fs = require('fs');
const trash = require('trash');
const exec = require('child_process').exec;

import { GLOBALS } from './main-globals';
import { ImageElement, FinalObject, InputSources } from '../interfaces/final-object.interface';
import { SettingsObject } from '../interfaces/settings-object.interface';
import { createDotPlsFile, writeVhaFileToDisk } from './main-support';
import { replaceThumbnailWithNewImage } from './main-extract';
import { closeWatcher, startWatcher, extractAnyMissingThumbs, removeThumbnailsNotInHub } from './main-extract-async';

/**
 * Set up the listeners
 * @param ipc
 * @param win
 * @param pathToAppData
 * @param systemMessages
 */
export function setUpIpcMessages(ipc, win, pathToAppData, systemMessages) {

  /**
   * Un-Maximize the window
   */
  ipc.on('un-maximize-window', (event) => {
    if (BrowserWindow.getFocusedWindow()) {
      BrowserWindow.getFocusedWindow().unmaximize();
    }
  });

  /**
   * Minimize the window
   */
  ipc.on('minimize-window', (event) => {
    if (BrowserWindow.getFocusedWindow()) {
      BrowserWindow.getFocusedWindow().minimize();
    }
  });

  /**
   * Open the explorer to the relevant file
   */
  ipc.on('open-in-explorer', (event, fullPath: string) => {
    shell.showItemInFolder(fullPath);
  });

  /**
   * Open a URL in system's default browser
   */
  ipc.on('please-open-url', (event, urlToOpen: string): void => {
    shell.openExternal(urlToOpen, { activate: true });
  });

  /**
   * Maximize the window
   */
  ipc.on('maximize-window', (event) => {
    if (BrowserWindow.getFocusedWindow()) {
      BrowserWindow.getFocusedWindow().maximize();
    }
  });

  /**
   * Open a particular video file clicked inside Angular
   */
  ipc.on('open-media-file', (event, fullFilePath) => {
    fs.access(fullFilePath, fs.constants.F_OK, (err: any) => {
      if (!err) {
        shell.openPath(path.normalize(fullFilePath));
      } else {
        event.sender.send('file-not-found');
      }
    });
  });

  /**
   * Open a particular video file clicked inside Angular at particular timestamp
   */
  ipc.on('open-media-file-at-timestamp', (event, executablePath, fullFilePath: string, args: string, reuseInstance: boolean) => {
    fs.access(fullFilePath, fs.constants.F_OK, (err: any) => {
      if (!err) {
        let cmdline: string;

        if (GLOBALS.macVersion && reuseInstance) {
          // Launching the raw binary inside `Contents/MacOS/` directly (as done
          // below) bypasses macOS's own single-instance app tracking -- every
          // click becomes a fully independent process, so they pile up and have
          // to be killed one by one. Routing through `open -a` with the
          // containing `.app` bundle reuses an already-running instance instead
          // (confirmed: same PID across repeated launches with different files,
          // vs. a new PID each time via raw exec). Only requested for players
          // this is known to work with (VLC/IINA) and only when the user hasn't
          // unchecked the Settings checkbox for it.
          const appBundlePath: string = path.normalize(executablePath).replace(/\/Contents\/MacOS\/.*$/, '');
          cmdline = `open -a "${appBundlePath}" "${path.normalize(fullFilePath)}" --args ${args}`;
        } else {
          cmdline = `"${path.normalize(executablePath)}" "${path.normalize(fullFilePath)}" ${args}`;
        }

        console.log(cmdline);
        exec(cmdline);
      } else {
        event.sender.send('file-not-found');
      }
    });
  });

  /**
   * Handle dragging a file out of VHA into a video editor (e.g. Vegas or Premiere)
   * if `imgPath` points to a file that does not exist, replace with default image
   */
  ipc.on('drag-video-out-of-electron', (event, filePath, imgPath): void => {
    fs.access(imgPath, fs.constants.F_OK, (err: any) => {
      if (!err) {
        event.sender.startDrag({
          file: filePath,
          icon: imgPath,
        });
      } else {
        const tempIcon: string = app.isPackaged ? './resources/assets/logo.png' : './src/assets/logo.png';
        event.sender.startDrag({
          file: filePath,
          icon: tempIcon,
        });
      }
    });
  });

  /**
   * Select default video player
   */
  ipc.on('select-default-video-player', (event) => {
    console.log('asking for default video player');
    dialog.showOpenDialog(win, {
      title: systemMessages.selectDefaultPlayer, // TODO: check if errors out now that this is in `main-ipc.ts`
      filters: [
        {
          name: 'Executable', // TODO: i18n fixme
          extensions: ['exe', 'app']
        }, {
          name: 'All files', // TODO: i18n fixme
          extensions: ['*']
        }
      ],
      properties: ['openFile']
    }).then(result => {
      const executablePath: string = result.filePaths[0];
      if (executablePath) {
        event.sender.send('preferred-video-player-returning', executablePath);
      }
    }).catch(err => {});
  });

  /**
   * Create and play the playlist
   * 1. filter out *FOLDER*
   * 2. save .pls file
   * 3. ask OS to open the .pls file
   */
  ipc.on('please-create-playlist', (event, playlist: ImageElement[], sourceFolderMap: InputSources, execPath: string) => {

    const cleanPlaylist: ImageElement[] = playlist.filter((element: ImageElement) => {
      return element.cleanName !== '*FOLDER*';
    });

    const savePath: string = path.join(GLOBALS.settingsPath, 'temp.pls');

    if (cleanPlaylist.length) {
      createDotPlsFile(savePath, cleanPlaylist, sourceFolderMap, () => {

        if (execPath) { // if `preferredVideoPlayer` is sent
          const cmdline: string = `"${path.normalize(execPath)}" "${path.normalize(savePath)}"`;
          console.log(cmdline);
          exec(cmdline);
        } else {
          shell.openPath(savePath);
        }
      });
    }
  });

  /**
   * Delete file from computer (send to recycling bin / trash) or dangerously delete (bypass trash)
   */
  ipc.on('delete-video-file', (event, basePath: string, item: ImageElement, dangerousDelete: boolean): void => {
    const fileToDelete = path.join(basePath, item.partialPath, item.fileName);

    if (dangerousDelete) {

      fs.unlink(fileToDelete, (err) => {
        if (err) {
          console.log('ERROR:', fileToDelete + ' was NOT deleted');
        } else {
          notifyFileDeleted(event, fileToDelete, item);
        }
      });

    } else {

      (async () => {
        await trash(fileToDelete);
        notifyFileDeleted(event, fileToDelete, item);
      })();

    }
  });

  /**
   * Helper function for `delete-video-file`
   * @param event
   * @param fileToDelete
   * @param item
   */
  function notifyFileDeleted(event, fileToDelete, item) {
    fs.access(fileToDelete, fs.constants.F_OK, (err: any) => {
      if (err) {
        console.log('FILE DELETED SUCCESS !!!');
        event.sender.send('file-deleted', item);
      }
    });
  }

  /**
   * Method to replace thumbnail of a particular item
   */
  ipc.on('replace-thumbnail', (event, pathToIncomingJpg: string, item: ImageElement) => {
    const fileToReplace: string = path.join(
        GLOBALS.selectedOutputFolder,
        'vha-' + GLOBALS.hubName,
        'thumbnails',
        item.hash + '.jpg'
      );

    const height: number = GLOBALS.screenshotSettings.height;

    replaceThumbnailWithNewImage(fileToReplace, pathToIncomingJpg, height)
      .then(success => {
        if (success) {
          event.sender.send('thumbnail-replaced');
        }
      })
      .catch((err) => {});

  });

  /**
   * Summon system modal to choose INPUT directory
   * where all the videos are located
   */
  ipc.on('choose-input', (event) => {
    dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    }).then(result => {
      const inputDirPath: string = result.filePaths[0];
      if (inputDirPath) {
        event.sender.send('input-folder-chosen', inputDirPath);
      }
    }).catch(err => {});
  });

  /**
   * Summon system modal to choose NEW input directory for a now-disconnected folder
   * where all the videos are located
   */
  ipc.on('reconnect-this-folder', (event, inputSource: number) => {
    dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    }).then(result => {
      const inputDirPath: string = result.filePaths[0];
      if (inputDirPath) {
        event.sender.send('old-folder-reconnected', inputSource, inputDirPath);
      }
    }).catch(err => {});
  });

  /**
   * Snapshot the current .vha2 file before a rescan that will remove missing
   * entries from the index -- a defensive backup, since that removal is
   * permanent once saved. One timestamped file per call (never overwritten),
   * stored alongside the hub's other generated data rather than next to the
   * .vha2 file itself.
   */
  ipc.on('backup-vha-before-rescan', (event) => {
    try {
      const backupsFolder = path.join(GLOBALS.selectedOutputFolder, 'vha-' + GLOBALS.hubName, 'backups');
      if (!fs.existsSync(backupsFolder)) {
        fs.mkdirSync(backupsFolder, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupsFolder, GLOBALS.hubName + '-' + timestamp + '.vha2.bak');
      fs.copyFileSync(GLOBALS.currentlyOpenVhaFile, backupPath);
    } catch (err) {
      console.log('WARNING -- failed to back up .vha2 before rescan:', err);
    }
  });

  /**
   * Stop watching a particular folder
   */
  ipc.on('stop-watching-folder', (event, watchedFolderIndex: number) => {
    console.log('stop watching:', watchedFolderIndex);
    closeWatcher(watchedFolderIndex);
  });

  /**
   * Stop watching a particular folder
   */
  ipc.on('start-watching-folder', (event, watchedFolderIndex: string, path2: string, persistent: boolean) => {
    // annoyingly it's not a number :     ^^^^^^^^^^^^^^^^^^ -- because object keys are strings :(
    console.log('start watching:', watchedFolderIndex, path2, persistent);
    startWatcher(parseInt(watchedFolderIndex, 10), path2, persistent);
  });

  /**
   * extract any missing thumbnails
   */
  ipc.on('add-missing-thumbnails', (event, finalArray: ImageElement[], extractClips: boolean) => {
    extractAnyMissingThumbs(finalArray);
  });

  /**
   * Save the current index to disk immediately, without closing the window --
   * used by the "remove missing on rescan" feature so the removal is safely
   * persisted BEFORE its generated cache files (thumbnails/filmstrips/clips)
   * are deleted, rather than leaving that removal unsaved indefinitely (the
   * app otherwise only ever saves on close).
   */
  ipc.on('save-vha-file-now', (event, finalObjectToSave: FinalObject) => {
    writeVhaFileToDisk(finalObjectToSave, GLOBALS.currentlyOpenVhaFile, () => {
      event.sender.send('vha-file-saved-now');
    });
  });

  /**
   * Remove any thumbnails for files no longer present in the hub
   */
  ipc.on('clean-old-thumbnails', (event, finalArray: ImageElement[]) => {
    // !!! WARNING
    const screenshotOutputFolder: string = path.join(GLOBALS.selectedOutputFolder, 'vha-' + GLOBALS.hubName);
    // !! ^^^^^^^^^^^^^^^^^^^^^^ - make sure this points to the folder with screenshots only!

    const allHashes: Map<string, 1> = new Map();

    finalArray
      .filter((element: ImageElement) => { return !element.deleted; })
      .forEach((element: ImageElement) => {
        allHashes.set(element.hash, 1);
      });
    removeThumbnailsNotInHub(allHashes, screenshotOutputFolder); // WARNING !!! this function will delete stuff
  });

  /**
   * Summon system modal to choose OUTPUT directory
   * where the final .vha2 file, vha-folder, and all screenshots will be saved
   */
  ipc.on('choose-output', (event) => {
    dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    }).then(result => {
      const outputDirPath: string = result.filePaths[0];
      if (outputDirPath) {
        event.sender.send('output-folder-chosen', outputDirPath);
      }
    }).catch(err => {});
  });

  /**
   * Try to rename the particular file
   */
  ipc.on('try-to-rename-this-file', (event, sourceFolder: string, relPath: string, file: string, renameTo: string, index: number): void => {
    console.log('renaming file:');

    const original: string = path.join(sourceFolder, relPath, file);
    const newName: string = path.join(sourceFolder, relPath, renameTo);

    console.log(original);
    console.log(newName);

    let success = true;
    let errMsg: string;

    // check if already exists first
    if (fs.existsSync(newName)) {
      console.log('some file already EXISTS WITH THAT NAME !!!');
      success = false;
      errMsg = 'RIGHTCLICK.errorFileNameExists';
    } else {
      try {
        fs.renameSync(original, newName);
      } catch (err) {
        success = false;
        console.log(err);
        if (err.code === 'ENOENT') {
          // const pathObj = path.parse(err.path);
          // console.log(pathObj);
          errMsg = 'RIGHTCLICK.errorFileNotFound';
        } else {
          errMsg = 'RIGHTCLICK.errorSomeError';
        }
      }
    }

    event.sender.send('rename-file-response', index, success, renameTo, file, errMsg);
  });

  /**
   * Close the window / quit / exit the app
   */
  ipc.on('close-window', (event, settingsToSave: SettingsObject, finalObjectToSave: FinalObject) => {
    // convert shortcuts map to object
    settingsToSave.shortcuts = <any>Object.fromEntries(settingsToSave.shortcuts);

    const json = JSON.stringify(settingsToSave);

    try {
      fs.statSync(path.join(pathToAppData, 'video-hub-app-2'));
    } catch (e) {
      fs.mkdirSync(path.join(pathToAppData, 'video-hub-app-2'));
    }

    // TODO -- catch bug if user closes before selecting the output folder ?!??
    fs.writeFile(path.join(GLOBALS.settingsPath, 'settings.json'), json, 'utf8', () => {
      if (finalObjectToSave !== null) {

        writeVhaFileToDisk(finalObjectToSave, GLOBALS.currentlyOpenVhaFile, () => {
          try {
            GLOBALS.readyToQuit = true;
            BrowserWindow.getFocusedWindow().close();
          } catch {}
        });

      } else {
        try {
          GLOBALS.readyToQuit = true;
          BrowserWindow.getFocusedWindow().close();
        } catch {}
      }
    });
  });

}
