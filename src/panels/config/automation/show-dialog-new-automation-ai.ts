import { fireEvent } from "../../../common/dom/fire_event";

export const loadNewAutomationAIDialog = () =>
  import("./dialog-new-automation-ai");

export const showNewAutomationAIDialog = (element: HTMLElement): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "ha-dialog-new-automation-ai",
    dialogImport: loadNewAutomationAIDialog,
  });
};
