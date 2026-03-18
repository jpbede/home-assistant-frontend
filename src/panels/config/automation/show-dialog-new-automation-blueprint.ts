import { fireEvent } from "../../../common/dom/fire_event";

export interface NewAutomationBlueprintDialogParams {
  mode: "script" | "automation";
}

export const loadNewAutomationBlueprintDialog = () =>
  import("./dialog-new-automation-blueprint");

export const showNewAutomationBlueprintDialog = (
  element: HTMLElement,
  dialogParams: NewAutomationBlueprintDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-dialog-new-automation-blueprint",
    dialogImport: loadNewAutomationBlueprintDialog,
    dialogParams,
  });
};
