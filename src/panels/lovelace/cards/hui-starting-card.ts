import { STATE_NOT_RUNNING } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-card";
import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import type { HomeAssistant } from "../../../types";
import type { LovelaceCard } from "../types";

@customElement("hui-starting-card")
export class HuiStartingCard extends LitElement implements LovelaceCard {
  @property({ attribute: false }) public hass?: HomeAssistant;

  public getCardSize(): number {
    return 2;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public setConfig(_config: LovelaceCardConfig): void {}

  protected updated(changedProperties: PropertyValues) {
    super.updated(changedProperties);
    if (!changedProperties.has("hass") || !this.hass!.config) {
      return;
    }

    if (this.hass!.config.state !== STATE_NOT_RUNNING) {
      fireEvent(this, "config-refresh");
    }
  }

  protected render() {
    if (!this.hass) {
      return nothing;
    }

    return html`
      <ha-card>
        <span class="visually-hidden">
          ${this.hass.localize("ui.panel.lovelace.cards.starting.description")}
        </span>
        <div class="skeleton skeleton-header"></div>
        <div class="skeleton skeleton-line-1"></div>
        <div class="skeleton skeleton-line-2"></div>
        <div class="skeleton skeleton-line-3"></div>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      padding: var(--ha-space-4);
    }

    .skeleton {
      position: relative;
      display: block;
      animation-fill-mode: forwards;
      animation-iteration-count: infinite;
      animation-name: loading;
      animation-timing-function: linear;
      animation-duration: 1.2s;
      border-radius: var(--ha-border-radius-sm);
      height: 16px;
      margin: var(--ha-space-1) 0;
      background: linear-gradient(
          to right,
          var(--card-background-color) 8%,
          var(--secondary-background-color) 18%,
          var(--card-background-color) 33%
        )
        0% 0% / 936px 104px;
    }

    .skeleton-header {
      width: 60%;
      height: 20px;
      margin-bottom: var(--ha-space-3);
    }

    .skeleton-line-1 {
      width: 90%;
    }

    .skeleton-line-2 {
      width: 75%;
    }

    .skeleton-line-3 {
      width: 50%;
    }

    @keyframes loading {
      0% {
        background-position: -468px 0;
      }
      100% {
        background-position: 468px 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton {
        animation: none;
      }
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-starting-card": HuiStartingCard;
  }
}
