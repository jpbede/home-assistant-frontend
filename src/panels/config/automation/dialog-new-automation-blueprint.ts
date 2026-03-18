import { mdiAccount, mdiFile, mdiOpenInNew, mdiWeb } from "@mdi/js";
import Fuse from "fuse.js";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../common/dom/fire_event";
import { shouldHandleRequestSelectedEvent } from "../../../common/mwc/handle-request-selected-event";
import { stringCompare } from "../../../common/string/compare";
import "../../../components/ha-adaptive-dialog";
import "../../../components/ha-icon-next";
import "../../../components/ha-list";
import "../../../components/ha-list-item";
import "../../../components/ha-spinner";
import "../../../components/ha-tip";
import "../../../components/search-input";
import { showAutomationEditor } from "../../../data/automation";
import type {
  Blueprint,
  BlueprintDomain,
  BlueprintSourceType,
  Blueprints,
} from "../../../data/blueprint";
import {
  fetchBlueprints,
  getBlueprintSourceType,
} from "../../../data/blueprint";
import {
  type FuseWeightedKey,
  multiTermSearch,
} from "../../../resources/fuseMultiTerm";
import { showScriptEditor } from "../../../data/script";
import { mdiHomeAssistant } from "../../../resources/home-assistant-logo-svg";
import { haStyle, haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import type { NewAutomationBlueprintDialogParams } from "./show-dialog-new-automation-blueprint";

const SOURCE_TYPE_ICONS: Record<BlueprintSourceType, string> = {
  local: mdiFile,
  community: mdiAccount,
  homeassistant: mdiHomeAssistant,
};

const BLUEPRINT_SEARCH_KEYS: FuseWeightedKey[] = [
  { name: "name", weight: 10 },
  { name: "description", weight: 7 },
  { name: "author", weight: 5 },
  { name: "sourceType", weight: 3 },
];

@customElement("ha-dialog-new-automation-blueprint")
class DialogNewAutomationBlueprint extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _params?: NewAutomationBlueprintDialogParams;

  @state() private _mode: BlueprintDomain = "automation";

  @state() private _blueprints?: Blueprints;

  @state() private _loadingBlueprints = false;

  @state() private _filter = "";

  public showDialog(params: NewAutomationBlueprintDialogParams): void {
    this._params = params;
    this._open = true;
    this._mode = params.mode || "automation";
    this._filter = "";
    this._blueprints = undefined;
    this._loadingBlueprints = true;

    const mode = this._mode;
    fetchBlueprints(this.hass, mode)
      .then((blueprints) => {
        if (mode === this._mode) {
          this._blueprints = blueprints;
        }
      })
      .finally(() => {
        if (mode === this._mode) {
          this._loadingBlueprints = false;
        }
      });
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    this._blueprints = undefined;
    this._loadingBlueprints = false;
    this._filter = "";
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _processedBlueprints = memoizeOne((blueprints?: Blueprints) => {
    if (!blueprints) {
      return [];
    }

    return Object.entries(blueprints)
      .filter((entry): entry is [string, Blueprint] => !("error" in entry[1]))
      .map(([path, blueprint]) => ({
        ...blueprint.metadata,
        sourceType: getBlueprintSourceType(blueprint),
        path,
      }))
      .sort((a, b) => stringCompare(a.name, b.name, this.hass.locale.language));
  });

  private _blueprintFuseIndex = memoizeOne(
    (
      blueprints: ReturnType<
        DialogNewAutomationBlueprint["_processedBlueprints"]
      >
    ) => Fuse.createIndex(BLUEPRINT_SEARCH_KEYS, blueprints)
  );

  private _filteredBlueprints = memoizeOne(
    (
      blueprints: ReturnType<
        DialogNewAutomationBlueprint["_processedBlueprints"]
      >,
      filter: string
    ) =>
      multiTermSearch(
        blueprints,
        filter,
        BLUEPRINT_SEARCH_KEYS,
        this._blueprintFuseIndex(blueprints)
      )
  );

  protected render() {
    if (!this._params) {
      return nothing;
    }

    const processedBlueprints = this._processedBlueprints(this._blueprints);
    const filteredBlueprints = this._filteredBlueprints(
      processedBlueprints,
      this._filter
    );

    return html`
      <ha-adaptive-dialog
        .hass=${this.hass}
        .open=${this._open}
        flexcontent
        header-title=${this.hass.localize(
          `ui.panel.config.${this._mode}.dialog_new.create_blueprint`
        )}
        @closed=${this._dialogClosed}
      >
        <div class="content-wrapper">
          <search-input
            autofocus
            .hass=${this.hass}
            .filter=${this._filter}
            .label=${this.hass.localize("ui.common.search")}
            @value-changed=${this._handleSearchChange}
          ></search-input>
          <div class="blueprints-list ha-scrollbar">
            ${this._loadingBlueprints
              ? html`<div class="spinner">
                  <ha-spinner active></ha-spinner>
                </div>`
              : html`
                  <ha-list>
                    ${filteredBlueprints.map(
                      (blueprint) => html`
                        <ha-list-item
                          hasmeta
                          twoline
                          graphic="icon"
                          @request-selected=${this._blueprint}
                          .path=${blueprint.path}
                        >
                          <ha-svg-icon
                            slot="graphic"
                            .path=${SOURCE_TYPE_ICONS[blueprint.sourceType]}
                          ></ha-svg-icon>
                          ${blueprint.name}
                          <span slot="secondary">
                            ${blueprint.author
                              ? this.hass.localize(
                                  `ui.panel.config.${this._mode}.dialog_new.blueprint_source.author`,
                                  { author: blueprint.author }
                                )
                              : this.hass.localize(
                                  `ui.panel.config.${this._mode}.dialog_new.blueprint_source.${blueprint.sourceType}`
                                )}
                          </span>
                          <ha-icon-next slot="meta"></ha-icon-next>
                        </ha-list-item>
                      `
                    )}
                  </ha-list>
                  ${processedBlueprints.length === 0
                    ? html`
                        <a
                          href=${documentationUrl(this.hass, "/get-blueprints")}
                          target="_blank"
                          rel="noreferrer noopener"
                          class="item"
                        >
                          <ha-list-item hasmeta twoline graphic="icon">
                            <ha-svg-icon
                              slot="graphic"
                              .path=${mdiWeb}
                            ></ha-svg-icon>
                            ${this.hass.localize(
                              `ui.panel.config.${this._mode}.dialog_new.create_blueprint`
                            )}
                            <span slot="secondary">
                              ${this.hass.localize(
                                `ui.panel.config.${this._mode}.dialog_new.create_blueprint_description`
                              )}
                            </span>
                            <ha-svg-icon
                              slot="meta"
                              path=${mdiOpenInNew}
                            ></ha-svg-icon>
                          </ha-list-item>
                        </a>
                      `
                    : filteredBlueprints.length === 0
                      ? html`
                          <div class="empty-search">
                            ${this.hass.localize(
                              `ui.panel.config.${this._mode}.dialog_new.no_blueprints_match_search`
                            )}
                          </div>
                        `
                      : nothing}
                `}
          </div>
        </div>
        ${processedBlueprints.length > 0
          ? html`
              <div class="footer-tip" slot="footer">
                <ha-tip .hass=${this.hass}>
                  <a
                    href=${documentationUrl(this.hass, "/get-blueprints")}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    ${this.hass.localize(
                      `ui.panel.config.${this._mode}.dialog_new.discover_blueprint_tip`
                    )}
                  </a>
                </ha-tip>
              </div>
            `
          : nothing}
      </ha-adaptive-dialog>
    `;
  }

  private _handleSearchChange(ev: CustomEvent) {
    this._filter = ev.detail.value;
  }

  private _blueprint(ev) {
    if (!shouldHandleRequestSelectedEvent(ev)) {
      return;
    }

    const path = (ev.currentTarget as any).path;
    this.closeDialog();

    if (this._mode === "script") {
      showScriptEditor({ use_blueprint: { path } });
      return;
    }

    showAutomationEditor({ use_blueprint: { path } });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-adaptive-dialog {
          --dialog-content-padding: 0;
          --mdc-dialog-max-height: 60vh;
          --mdc-dialog-max-height: 60dvh;
          --ha-dialog-min-height: 50vh;
        }

        :host {
          --ha-bottom-sheet-height: min(85vh, 85dvh);
          --ha-bottom-sheet-max-height: min(85vh, 85dvh);
        }

        @media all and (min-width: 550px) {
          ha-adaptive-dialog {
            --mdc-dialog-min-width: 500px;
          }
        }

        .content-wrapper {
          display: flex;
          flex-direction: column;
          min-height: 0;
          height: 100%;
        }

        search-input {
          display: block;
        }

        .blueprints-list {
          overflow-y: auto;
          min-height: 0;
          height: 50vh;
          max-height: 50vh;
          padding-bottom: var(--ha-space-2);
          border-top: 1px solid var(--divider-color);
        }

        .spinner {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-8) 0;
        }

        ha-icon-next {
          width: 24px;
        }

        .footer-tip {
          width: 100%;
          box-sizing: border-box;
          padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-4);
          display: flex;
          justify-content: center;
        }

        ha-tip {
          margin: 0;
          max-width: fit-content;
        }

        .empty-search {
          color: var(--secondary-text-color);
          padding: var(--ha-space-4);
        }

        a.item {
          text-decoration: unset;
        }

        @media all and (max-width: 870px), all and (max-height: 500px) {
          .blueprints-list {
            height: 45vh;
            max-height: 45vh;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-new-automation-blueprint": DialogNewAutomationBlueprint;
  }
}
