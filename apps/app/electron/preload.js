/**
 * Simplified Electron preload script
 *
 * Only exposes native features (dialogs, shell) and server URL.
 * All other operations go through HTTP API.
 */

const { contextBridge, ipcRenderer } = require("electron");

// Expose minimal API for native features
contextBridge.exposeInMainWorld("electronAPI", {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Connection check
  ping: () => ipcRenderer.invoke("ping"),

  // Get server URL for HTTP client
  getServerUrl: () => ipcRenderer.invoke("server:getUrl"),

  // Native dialogs - better UX than prompt()
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  openFile: (options) => ipcRenderer.invoke("dialog:openFile", options),
  saveFile: (options) => ipcRenderer.invoke("dialog:saveFile", options),

  // Shell operations
  openExternalLink: (url) => ipcRenderer.invoke("shell:openExternal", url),
  openPath: (filePath) => ipcRenderer.invoke("shell:openPath", filePath),

  // App info
  getPath: (name) => ipcRenderer.invoke("app:getPath", name),
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  isPackaged: () => ipcRenderer.invoke("app:isPackaged"),
});

console.log("[Preload] Electron API exposed (simplified mode)");
