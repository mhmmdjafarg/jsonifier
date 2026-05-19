// Open the side panel whenever the user clicks the extension icon.
// setPanelBehavior makes the action button act as a toggle automatically.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Also set it on startup in case the service worker was restarted.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
