import { Component, Input, input, output, viewChild } from '@angular/core';

import { TranslateService } from '@ngx-translate/core';

import { ElectronService } from './../../providers/electron.service';
import { ModalService } from './../modal/modal.service';

import { SettingsMetaGroup, SettingsMetaGroupLabels } from '../../common/settings-buttons';

import type { OnChanges, SimpleChanges } from '@angular/core';
import type { OnInit } from '@angular/core';
import type { SettingsButtonsType } from '../../common/settings-buttons';

@Component({
  standalone: false,
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: [
    '../buttons.scss',
    '../settings.scss',
    '../search-input.scss',
    './settings.component.scss'
  ]
})
export class SettingsComponent implements OnInit, OnChanges {

  readonly changeLanguage = output<string>();
  readonly checkForNewVersion = output<any>();
  readonly chooseDefaultVideoPlayer = output<any>();
  readonly decreaseZoomLevel = output<any>();
  readonly goDownloadNewVersion = output<any>();
  readonly increaseZoomLevel = output<any>();
  readonly openOnlineHelp = output<any>();
  readonly resetZoomLevel = output<any>();
  readonly scrollSettingsToTop = output<void>();
  readonly toggleButton = output<string>();
  readonly toggleHideButton = output<string>();

  @Input() appState;
  readonly demo = input();
  readonly latestVersionAvailable = input();
  readonly settingTabToShow = input();
  @Input() settingsButtons: SettingsButtonsType;
  readonly versionNumber = input();

  readonly settingsModal = viewChild('settingsModal');

  additionalInput = '';
  editAdditional = false;
  settingsMetaGroup = SettingsMetaGroup;
  settingsMetaGroupLabels = SettingsMetaGroupLabels;

  constructor(
    private electronService: ElectronService,
    private modalService: ModalService,
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.additionalInput = this.appState.addtionalExtensions;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.settingTabToShow) {
      this.scrollSettingsToTop.emit();
    }
  }

  /**
   * `true` when the chosen player path looks like VLC or IINA -- the only two
   * players the "reuse existing window" checkbox applies to
   * @param playerPath  full path to user's preferred video player
   */
  isSpecialPlayer(playerPath: string): boolean {
    const lowerPath = playerPath.toLowerCase();

    return lowerPath.includes('vlc') || lowerPath.includes('iina');
  }

  editAdditionalExtensions() {
    this.editAdditional = !this.editAdditional;
    this.additionalInput = this.appState.addtionalExtensions;
  }

  applyAdditionalExtensions() {
    if (this.isAdditionalInputValid(this.additionalInput)) {
      this.appState.addtionalExtensions = this.additionalInput;
      this.electronService.ipcRenderer.send('update-additional-extensions', this.additionalInput);
      this.editAdditional = false;
    } else {
      this.modalService.openSnackbar(this.translate.instant('SETTINGS.extensionsInputError'));
    }
  }

  private isAdditionalInputValid(input: string): boolean {
    let valid = true;
    input.split(',').forEach(element => {
      if (/[^A-Za-z0-9]/.test(element.trim())) {
        valid = false;
      }
    });

    return valid;
  }

}
