import { renderApp } from "./app";

export default {
  onExtensionPageLoad() {
    const container = document.getElementById("favaCurrencyTrackerApp");
    if (!container) return;
    renderApp(container);
  },
};


