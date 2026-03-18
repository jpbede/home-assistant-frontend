import { load } from "js-yaml";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { computeDomain } from "../../../common/entity/compute_domain";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-dialog";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-textarea";
import type { GenDataTask } from "../../../data/ai_task";
import { generateDataAITask } from "../../../data/ai_task";
import type {
  AutomationConfig,
  Condition,
  Trigger,
} from "../../../data/automation";
import { showAutomationEditor } from "../../../data/automation";
import { validateConfig } from "../../../data/config";
import type { DeviceRegistryEntry } from "../../../data/device/device_registry";
import { fetchDeviceRegistry } from "../../../data/device/device_registry";
import type { Action } from "../../../data/script";
import type { HassDialog } from "../../../dialogs/make-dialog-manager";
import { haStyle, haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import {
  type Areas,
  type Floors,
  type Labels,
  fetchAreas,
  fetchFloors,
  fetchLabels,
} from "../common/suggest-metadata-helpers";

interface GeneratedAutomationDraft {
  alias: string;
  description?: string;
  triggers: unknown;
  conditions?: unknown;
  actions: unknown;
}

interface ExtractedAutomationReferences {
  entities?: string[];
  devices?: string[];
  areas?: string[];
  floors?: string[];
  labels?: string[];
}

interface MatchedTargets {
  areas: string[];
  floors: string[];
  labels: string[];
  devices: string[];
}

@customElement("ha-dialog-new-automation-ai")
class DialogNewAutomationAI extends LitElement implements HassDialog {
  private static _ENTITY_DOMAINS = new Set([
    "alarm_control_panel",
    "binary_sensor",
    "button",
    "calendar",
    "climate",
    "cover",
    "fan",
    "input_boolean",
    "input_button",
    "input_datetime",
    "light",
    "lock",
    "media_player",
    "person",
    "scene",
    "script",
    "sensor",
    "sun",
    "switch",
    "timer",
    "weather",
    "zone",
  ]);

  private static _FALLBACK_DOMAIN_HINTS: Record<string, string[]> = {
    light: ["light", "lights", "lamp", "lamps", "lighting"],
    scene: ["scene", "scenes"],
    cover: ["blind", "blinds", "shade", "shades", "cover", "covers"],
    climate: ["climate", "heating", "heater", "cooling", "thermostat"],
    fan: ["fan", "fans"],
    lock: ["lock", "locks", "unlock", "door lock"],
    media_player: ["media", "speaker", "tv", "music", "audio"],
    timer: ["timer", "timers"],
    weather: ["weather", "outside temperature", "outdoor temperature"],
    sensor: [
      "temperature",
      "temp",
      "temperatur",
      "outdoor",
      "outside",
      "exterior",
      "aussen",
      "außen",
    ],
    person: ["person", "people", "home", "away", "arrive", "leave", "presence"],
    sun: ["sun", "sunset", "sunrise", "dawn", "dusk"],
    alarm_control_panel: ["alarm", "security", "arm", "disarm"],
  };

  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _error?: string;

  @state() private _prompt = "";

  @state() private _generating = false;

  public showDialog(): void {
    this._open = true;
    this._error = undefined;
    this._prompt = "";
    this._generating = false;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._open) {
      return nothing;
    }

    return html`
      <ha-dialog
        .hass=${this.hass}
        .open=${this._open}
        @closed=${this._dialogClosed}
        header-title=${this.hass.localize(
          "ui.panel.config.automation.dialog_new.ai_dialog.header"
        )}
      >
        ${this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing}
        <p>
          ${this.hass.localize(
            "ui.panel.config.automation.dialog_new.ai_dialog.description"
          )}
        </p>
        <ha-textarea
          autofocus
          required
          autogrow
          .disabled=${this._generating}
          .label=${this.hass.localize(
            "ui.panel.config.automation.dialog_new.ai_dialog.prompt_label"
          )}
          .placeholder=${this.hass.localize(
            "ui.panel.config.automation.dialog_new.ai_dialog.prompt_placeholder"
          )}
          .value=${this._prompt}
          @input=${this._valueChanged}
        ></ha-textarea>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            .disabled=${this._generating}
            @click=${this.closeDialog}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            .disabled=${this._generating || !this._prompt.trim()}
            @click=${this._generate}
          >
            ${this.hass.localize(
              this._generating
                ? "ui.panel.config.automation.dialog_new.ai_dialog.generating"
                : "ui.panel.config.automation.dialog_new.ai_dialog.generate"
            )}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _valueChanged(ev: InputEvent) {
    this._prompt = (ev.target as HTMLTextAreaElement).value;
    this._error = undefined;
  }

  private async _generate() {
    const prompt = this._prompt.trim();

    if (!prompt || this._generating) {
      return;
    }

    this._generating = true;
    this._error = undefined;

    try {
      const extractedReferences =
        await generateDataAITask<ExtractedAutomationReferences>(
          this.hass,
          this._buildReferenceExtractionTask(prompt)
        );

      const availableEntities = this._buildAvailableEntities(
        prompt,
        extractedReferences.data
      );
      const availableTargets = await this._buildAvailableTargets(
        prompt,
        extractedReferences.data
      );

      const result = await generateDataAITask<GeneratedAutomationDraft>(
        this.hass,
        this._buildTask(prompt, availableEntities, availableTargets)
      );

      const config: Partial<AutomationConfig> = {
        alias: result.data.alias,
        description: result.data.description,
        mode: "single",
        triggers: this._normalizeSection<Trigger | Trigger[]>(
          result.data.triggers
        ),
        conditions:
          this._normalizeSection<Condition | Condition[]>(
            result.data.conditions
          ) || [],
        actions: this._normalizeSection<Action | Action[]>(result.data.actions),
      };

      if (!config.alias || !config.triggers || !config.actions) {
        throw new Error("missing_required_fields");
      }

      const validation = await validateConfig(this.hass, {
        triggers: config.triggers,
        conditions: config.conditions,
        actions: config.actions,
      });

      const firstError = Object.values(validation).find(
        (item) => item && !item.valid
      );

      if (firstError && !firstError.valid) {
        throw new Error(firstError.error);
      }

      this.closeDialog();
      showAutomationEditor(config);
    } catch (err: any) {
      this._error =
        err?.message === "missing_required_fields"
          ? this.hass.localize(
              "ui.panel.config.automation.dialog_new.ai_dialog.error"
            )
          : err?.message ||
            this.hass.localize(
              "ui.panel.config.automation.dialog_new.ai_dialog.error"
            );
    } finally {
      this._generating = false;
    }
  }

  private _buildReferenceExtractionTask(prompt: string): GenDataTask {
    return {
      task_name: "frontend__automation__extract_references",
      instructions: [
        "Extract concrete Home Assistant references from the user's automation request.",
        "Only return names or IDs explicitly relevant to the request.",
        "Do not invent names or IDs.",
        "",
        "User request:",
        prompt,
      ].join("\n"),
      structure: {
        entities: {
          description:
            "Entity names or entity IDs mentioned or strongly implied",
          required: false,
          selector: { text: { multiple: true } },
        },
        devices: {
          description: "Device names mentioned or strongly implied",
          required: false,
          selector: { text: { multiple: true } },
        },
        areas: {
          description: "Area names mentioned or strongly implied",
          required: false,
          selector: { text: { multiple: true } },
        },
        floors: {
          description: "Floor names mentioned or strongly implied",
          required: false,
          selector: { text: { multiple: true } },
        },
        labels: {
          description: "Label names mentioned or strongly implied",
          required: false,
          selector: { text: { multiple: true } },
        },
      },
    };
  }

  private _buildTask(
    prompt: string,
    availableEntities: string[],
    availableTargets: MatchedTargets
  ): GenDataTask {
    const context = [
      availableEntities.length
        ? `entities:\n${availableEntities.join("\n")}`
        : "",
      availableTargets.areas.length
        ? `areas:\n${availableTargets.areas.join("\n")}`
        : "",
      availableTargets.floors.length
        ? `floors:\n${availableTargets.floors.join("\n")}`
        : "",
      availableTargets.labels.length
        ? `labels:\n${availableTargets.labels.join("\n")}`
        : "",
      availableTargets.devices.length
        ? `devices:\n${availableTargets.devices.join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      task_name: "frontend__automation__new",
      instructions: [
        `Create a Home Assistant automation draft in language "${this.hass.language}".`,
        "Return structured automation data only.",
        "Use valid Home Assistant automation YAML semantics.",
        "Only include conditions when needed.",
        "Do not invent entity IDs or target IDs.",
        "When a matched entity is the best fit for the user's request, use that entity_id directly instead of inventing IDs or replacing the request with a different trigger or event.",
        "Prefer specific area_id, floor_id, label_id, or device_id targets over entity_id. Use target.entity_id only when broader targets are not appropriate.",
        context ? `context:\n${context}` : "",
        `request:\n${prompt}`,
      ]
        .filter(Boolean)
        .join("\n"),
      structure: {
        alias: {
          description: "A short sentence-case name for the automation",
          required: true,
          selector: { text: {} },
        },
        description: {
          description: "A short description of the automation",
          required: false,
          selector: { text: {} },
        },
        triggers: {
          description:
            "The automation triggers in Home Assistant YAML-compatible object or array form",
          required: true,
          selector: { object: {} },
        },
        conditions: {
          description:
            "Optional automation conditions in Home Assistant YAML-compatible object or array form",
          required: false,
          selector: { object: {} },
        },
        actions: {
          description:
            "The automation actions in Home Assistant YAML-compatible object or array form",
          required: true,
          selector: { object: {} },
        },
      },
    };
  }

  private _normalizeSection<T>(value: unknown): T | undefined {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "json" in value &&
      typeof (value as { json: unknown }).json === "string"
    ) {
      return load((value as { json: string }).json) as T;
    }

    if (typeof value !== "string") {
      return value as T;
    }

    return load(value) as T;
  }

  private _buildAvailableEntities(
    prompt: string,
    references: ExtractedAutomationReferences
  ): string[] {
    const promptText = this._normalizeText(prompt);
    const promptTokens = this._tokenize(promptText);
    const nameReferences = this._buildReferenceSet([
      references.entities,
      references.devices,
      references.areas,
      references.floors,
      references.labels,
    ]);
    const fallbackDomains = this._inferFallbackDomains(promptText);

    const scoredEntities = Object.values(this.hass.states)
      .filter((stateObj) => {
        if (stateObj.attributes.restored) {
          return false;
        }
        const domain = computeDomain(stateObj.entity_id);
        return (
          DialogNewAutomationAI._ENTITY_DOMAINS.has(domain) &&
          Boolean(stateObj.attributes.friendly_name)
        );
      })
      .map((stateObj) => {
        const domain = computeDomain(stateObj.entity_id);
        return {
          stateObj,
          score: this._scoreCandidate(
            [stateObj.entity_id, stateObj.attributes.friendly_name],
            promptText,
            promptTokens,
            nameReferences
          ),
          fallbackScore: this._scoreFallbackEntity(
            domain,
            promptText,
            promptTokens,
            stateObj.attributes.friendly_name || stateObj.entity_id,
            fallbackDomains
          ),
        };
      })
      .sort((a, b) => b.score - a.score);

    const entities = scoredEntities
      .filter((entry) => entry.score > 0)
      .slice(0, 30)
      .map(
        ({ stateObj }) =>
          `${stateObj.entity_id}|${stateObj.attributes.friendly_name}`
      );

    if (entities.length >= 5) {
      return entities;
    }

    const fallbackEntities = scoredEntities
      .filter((entry) => entry.fallbackScore > 0)
      .sort((a, b) => b.fallbackScore - a.fallbackScore)
      .slice(0, 10)
      .map(
        ({ stateObj }) =>
          `${stateObj.entity_id}|${stateObj.attributes.friendly_name}`
      );

    return this._mergeUnique(entities, fallbackEntities).slice(0, 15);
  }

  private async _buildAvailableTargets(
    prompt: string,
    references: ExtractedAutomationReferences
  ): Promise<MatchedTargets> {
    const promptText = this._normalizeText(prompt);
    const promptTokens = this._tokenize(promptText);
    const areaReferences = this._buildReferenceSet([references.areas]);
    const floorReferences = this._buildReferenceSet([references.floors]);
    const labelReferences = this._buildReferenceSet([references.labels]);
    const deviceReferences = this._buildReferenceSet([references.devices]);

    const fetchAreasNeeded = true;
    const fetchFloorsNeeded =
      floorReferences.size > 0 ||
      /\b(floor|upstairs|downstairs|basement)\b/.test(promptText);
    const fetchLabelsNeeded =
      labelReferences.size > 0 || /\b(label|tag)\b/.test(promptText);
    const fetchDevicesNeeded = true;

    const [areas, floors, labels, devices] = await Promise.all([
      fetchAreasNeeded
        ? fetchAreas(this.hass.connection)
        : Promise.resolve({} as Areas),
      fetchFloorsNeeded
        ? fetchFloors(this.hass.connection)
        : Promise.resolve({} as Floors),
      fetchLabelsNeeded
        ? fetchLabels(this.hass.connection)
        : Promise.resolve({} as Labels),
      fetchDevicesNeeded
        ? fetchDeviceRegistry(this.hass.connection)
        : Promise.resolve([] as DeviceRegistryEntry[]),
    ]);

    return {
      areas: Object.values(areas)
        .map((area) => ({
          area,
          score: this._scoreCandidate(
            [area.area_id, area.name],
            promptText,
            promptTokens,
            areaReferences
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ area }) => `area_id:${area.area_id}|${area.name}`),
      floors: Object.values(floors)
        .map((floor) => ({
          floor,
          score: this._scoreCandidate(
            [floor.floor_id, floor.name],
            promptText,
            promptTokens,
            floorReferences
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(({ floor }) => `floor_id:${floor.floor_id}|${floor.name}`),
      labels: Object.entries(labels)
        .map(([labelId, name]) => ({
          labelId,
          name,
          score: this._scoreCandidate(
            [labelId, name],
            promptText,
            promptTokens,
            labelReferences
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(({ labelId, name }) => `label_id:${labelId}|${name}`),
      devices: devices
        .map((device) => {
          const deviceName =
            device.name_by_user || device.name || device.model || device.id;
          return {
            device,
            deviceName,
            score: this._scoreCandidate(
              [device.id, deviceName, device.model, device.manufacturer],
              promptText,
              promptTokens,
              deviceReferences
            ),
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(
          ({ device, deviceName }) => `device_id:${device.id}|${deviceName}`
        ),
    };
  }

  private _buildReferenceSet(
    values: (string[] | undefined)[]
  ): ReadonlySet<string> {
    return new Set(
      values
        .flatMap((items) => items || [])
        .map((value) => this._normalizeText(value))
        .filter((value) => value.length > 1)
    );
  }

  private _scoreCandidate(
    values: (string | null | undefined)[],
    promptText: string,
    promptTokens: Set<string>,
    references: ReadonlySet<string>
  ): number {
    let score = 0;

    for (const value of values) {
      if (!value) {
        continue;
      }

      const normalized = this._normalizeText(value);

      if (!normalized) {
        continue;
      }

      if (references.has(normalized)) {
        score = Math.max(score, 100 + normalized.length);
      }

      if (promptText.includes(normalized)) {
        score = Math.max(score, 80 + normalized.length);
      }

      for (const reference of references) {
        if (normalized.includes(reference) || reference.includes(normalized)) {
          score = Math.max(score, 60 + Math.min(reference.length, 20));
        }
      }

      const overlap = [...this._tokenize(normalized)].filter(
        (token) =>
          token.length > 2 &&
          [...promptTokens].some(
            (promptToken) =>
              promptToken === token ||
              (promptToken.length > 4 &&
                token.length > 4 &&
                (promptToken.startsWith(token) || token.startsWith(promptToken)))
          )
      ).length;

      score = Math.max(score, overlap * 10);
    }

    return score;
  }

  private _scoreFallbackEntity(
    domain: string,
    promptText: string,
    promptTokens: Set<string>,
    label: string,
    fallbackDomains: ReadonlySet<string>
  ): number {
    let score = 0;

    if (fallbackDomains.has(domain)) {
      score += 20;
    }

    if (
      domain === "sun" &&
      (promptTokens.has("sunset") || promptTokens.has("sunrise"))
    ) {
      score += 40;
    }

    if (
      domain === "person" &&
      /(home|away|leave|leaving|arrive|arriving|presence)/.test(promptText)
    ) {
      score += 30;
    }

    if (
      this._normalizeText(label).includes("home") &&
      promptTokens.has("home")
    ) {
      score += 10;
    }

    return score;
  }

  private _normalizeText(value: string): string {
    return value
      .normalize("NFKD")
      .toLowerCase()
      .replace(/ß/g, "ss")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[_.:/-]+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private _tokenize(value: string): Set<string> {
    const tokens = new Set<string>();

    for (const token of value.split(" ")) {
      if (token.length <= 2) {
        continue;
      }

      tokens.add(token);

      for (const variant of this._tokenVariants(token)) {
        if (variant.length > 2) {
          tokens.add(variant);
        }
      }
    }

    return tokens;
  }

  private _tokenVariants(token: string): string[] {
    const variants = new Set<string>([token]);

    for (const suffix of ["s", "es", "e", "en", "er", "n"]) {
      if (token.length > suffix.length + 3 && token.endsWith(suffix)) {
        variants.add(token.slice(0, -suffix.length));
      }
    }

    return [...variants];
  }

  private _inferFallbackDomains(promptText: string): ReadonlySet<string> {
    return new Set(
      Object.entries(DialogNewAutomationAI._FALLBACK_DOMAIN_HINTS)
        .filter(([, hints]) =>
          hints.some((hint) => promptText.includes(this._normalizeText(hint)))
        )
        .map(([domain]) => domain)
    );
  }

  private _mergeUnique(values: string[], extra: string[]): string[] {
    return [...new Set([...values, ...extra])];
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-dialog {
          --dialog-content-padding: 0 var(--ha-space-6) var(--ha-space-6)
            var(--ha-space-6);
        }

        ha-alert,
        ha-textarea {
          display: block;
        }

        ha-alert {
          margin-bottom: var(--ha-space-4);
        }

        p {
          margin-top: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-new-automation-ai": DialogNewAutomationAI;
  }
}
