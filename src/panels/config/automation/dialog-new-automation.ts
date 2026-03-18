import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-adaptive-dialog";
import { showAutomationEditor } from "../../../data/automation";
import { haStyleScrollbar } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showScriptEditor } from "../../../data/script";
import type { NewAutomationDialogParams } from "./show-dialog-new-automation";
import { showNewAutomationBlueprintDialog } from "./show-dialog-new-automation-blueprint";
import "../dashboard/dashboard-card";

@customElement("ha-dialog-new-automation")
class DialogNewAutomation extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _params?: NewAutomationDialogParams;

  public showDialog(params: NewAutomationDialogParams): void {
    this._params = params;
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    const mode = this._params.mode;
    const createFromScratchImage = this.hass.themes.darkMode
      ? "/static/images/automation-options/dark/icon-automation-new.svg"
      : "/static/images/automation-options/light/icon-automation-new.svg";
    const useBlueprintImage = this.hass.themes.darkMode
      ? "/static/images/automation-options/dark/icon-automation-blueprint.svg"
      : "/static/images/automation-options/light/icon-automation-blueprint.svg";

    return html`
      <ha-adaptive-dialog
        .hass=${this.hass}
        .open=${this._open}
        flexcontent
        width="medium"
        header-title=${this.hass.localize(
          `ui.panel.config.${mode}.dialog_new.header`
        )}
        @closed=${this._dialogClosed}
      >
        <div class="content-wrapper">
          <div class="content ha-scrollbar">
            <div class="cards-container">
              <dashboard-card
                .name=${this.hass.localize(
                  `ui.panel.config.${mode}.dialog_new.create_empty`
                )}
                .description=${this.hass.localize(
                  `ui.panel.config.${mode}.dialog_new.create_empty_description`
                )}
                .img=${createFromScratchImage}
                .alt=${this.hass.localize(
                  `ui.panel.config.${mode}.dialog_new.create_empty`
                )}
                @click=${this._createEmpty}
              ></dashboard-card>
              <dashboard-card
                .name=${this.hass.localize(
                  `ui.panel.config.${mode}.dialog_new.create_blueprint`
                )}
                .description=${this.hass.localize(
                  `ui.panel.config.${mode}.dialog_new.create_blueprint_description`
                )}
                .img=${useBlueprintImage}
                .alt=${this.hass.localize(
                  `ui.panel.config.${mode}.dialog_new.create_blueprint`
                )}
                @click=${this._useBlueprint}
              ></dashboard-card>
            </div>
          </div>
        </div>
      </ha-adaptive-dialog>
    `;
  }

  private _createEmpty = () => {
    this.closeDialog();

    if (this._params?.mode === "script") {
      showScriptEditor();
      return;
    }

    showAutomationEditor();
  };

  private _useBlueprint = () => {
    if (!this._params) {
      return;
    }

    this.closeDialog();
    showNewAutomationBlueprintDialog(this, { mode: this._params.mode });
  };

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      css`
        ha-adaptive-dialog {
          --dialog-content-padding: 0;
          --ha-dialog-min-height: 34vh;
        }

        :host {
          --ha-bottom-sheet-height: min(62vh, 62dvh);
          --ha-bottom-sheet-max-height: min(62vh, 62dvh);
        }

        @media all and (min-width: 550px) {
          ha-adaptive-dialog {
            --mdc-dialog-min-width: 560px;
          }
        }

        .content-wrapper {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }

        .content {
          padding: var(--ha-space-4);
          flex: 1;
          min-height: 0;
          overflow: auto;
        }

        .cards-container {
          display: grid;
          gap: var(--ha-space-3);
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        }

        @media all and (max-width: 600px) {
          .content {
            padding: var(--ha-space-3);
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-new-automation": DialogNewAutomation;
  }
}
