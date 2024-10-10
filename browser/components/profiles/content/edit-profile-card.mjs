/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-env mozilla/remote-page */

import { MozLitElement } from "chrome://global/content/lit-utils.mjs";
import { html } from "chrome://global/content/vendor/lit.all.mjs";

// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-card.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://global/content/elements/moz-button-group.mjs";

const SAVE_NAME_TIMEOUT = 2000;
const SAVED_MESSAGE_TIMEOUT = 5000;

/**
 * Element used for updating a profile's name, theme, and avatar.
 */
export class EditProfileCard extends MozLitElement {
  static properties = {
    profile: { type: Object },
    profiles: { type: Array },
  };

  static queries = {
    mozCard: "moz-card",
    nameInput: "#profile-name",
    errorMessage: "#error-message",
    savedMessage: "#saved-message",
  };

  connectedCallback() {
    super.connectedCallback();

    this.init();
  }

  async init() {
    if (this.initialized) {
      return;
    }

    let { currentProfile, profiles } = await RPMSendQuery(
      "Profiles:GetEditProfileContent"
    );
    this.profile = currentProfile;
    this.profiles = profiles;

    this.initialized = true;
  }

  debounce(callback) {
    return () => {
      clearTimeout(this.timeoutID);
      this.timeoutID = setTimeout(() => {
        callback();
      }, SAVE_NAME_TIMEOUT);
    };
  }

  updateName() {
    this.savedMessage.parentElement.hidden = false;
    if (this.saveMessageTimeoutId) {
      clearTimeout(this.saveMessageTimeoutId);
    }
    this.saveMessageTimeoutId = setTimeout(() => {
      this.savedMessage.parentElement.hidden = true;
    }, SAVED_MESSAGE_TIMEOUT);
    let newName = this.nameInput.value.trim();
    if (!newName) {
      return;
    }

    this.profile.name = newName;
    RPMSendAsyncMessage("Profiles:UpdateProfileName", this.profile);
  }

  isDuplicateName(newName) {
    return !!this.profiles.find(
      p => p.id !== this.profile.id && p.name === newName
    );
  }

  async handleInputEvent() {
    let newName = this.nameInput.value.trim();
    if (newName === "") {
      this.showErrorMessage("edit-profile-page-no-name");
    } else if (this.isDuplicateName(newName)) {
      this.showErrorMessage("edit-profile-page-duplicate-name");
    } else {
      this.hideErrorMessage();
      this.debounce(() => {
        this.updateName();
      })();
    }
  }

  showErrorMessage(l10nId) {
    clearTimeout(this.timeoutID);
    document.l10n.setAttributes(this.errorMessage, l10nId);
    this.errorMessage.parentElement.hidden = false;
  }

  hideErrorMessage() {
    this.errorMessage.parentElement.hidden = true;
  }

  profilesNameTemplate() {
    return html`<div id="profile-name-area">
      <label
        data-l10n-id="edit-profile-page-profile-name-label"
        for="profile-name"
      ></label>
      <input
        type="text"
        id="profile-name"
        size="64"
        aria-errormessage="error-message"
        value=${this.profile.name}
        @input=${this.handleInputEvent}
      />
      <div class="message-parent">
        <span class="message" hidden
          ><img
            class="message-icon"
            id="error-icon"
            src="chrome://global/skin/icons/info.svg"
          />
          <span id="error-message"></span>
        </span>
        <span class="message" hidden
          ><img
            class="message-icon"
            id="saved-icon"
            src="chrome://global/skin/icons/check-filled.svg"
          />
          <span
            id="saved-message"
            data-l10n-id="edit-profile-page-profile-saved"
          ></span>
        </span>
      </div>
    </div>`;
  }

  themesTemplate() {
    // TODO: bug 1886005 will implement the theme cards
    let themes = [
      "Light",
      "Marigold",
      "Lichen",
      "Magnolia",
      "Lavendar",
      "Dark",
      "Ocean",
      "Terracotta",
      "Moss",
      "System",
    ];

    return themes.map(s => html`<moz-card>${s}</moz-card>`);
  }

  avatarsTemplate() {
    // TODO: bug 1886007 will implement the avatars
    let avatars = ["star", "flower", "briefcase", "book", "heart", "shopping"];

    return avatars.map(s => html`<div class="avatar">${s}</div>`);
  }

  onDeleteClick() {
    RPMSendAsyncMessage("Profiles:OpenDeletePage");
  }

  render() {
    if (!this.profile) {
      return null;
    }

    return html`<link
        rel="stylesheet"
        href="chrome://browser/content/profiles/edit-profile-card.css"
      />
      <link
        rel="stylesheet"
        href="chrome://global/skin/in-content/common.css"
      />
      <moz-card
        ><div id="edit-profile-card">
          <img width="80" height="80" src="${this.profile.avatar}" />
          <div id="profile-content">
            <h1 data-l10n-id="edit-profile-page-header"></h1>

            ${this.profilesNameTemplate()}

            <h3 data-l10n-id="edit-profile-page-theme-header"></h3>
            <div id="themes">${this.themesTemplate()}</div>
            <a href="" data-l10n-id="edit-profile-page-explore-themes"></a>

            <h3 data-l10n-id="edit-profile-page-avatar-header"></h3>
            <div id="avatars">${this.avatarsTemplate()}</div>

            <moz-button-group>
              <moz-button
                data-l10n-id="edit-profile-page-delete-button"
                @click=${this.onDeleteClick}
                type="destructive"
              ></moz-button>
            </moz-button-group>
          </div></div
      ></moz-card>`;
  }
}

customElements.define("edit-profile-card", EditProfileCard);
