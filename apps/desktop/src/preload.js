/**
 * apps/desktop/src/preload.js
 * Bridges Electron IPC and the web app securely.
 * Exposes minimal APIs to the renderer (the web UI).
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", {
  // Settings persistence
  getSetting: (key) => ipcRenderer.invoke("get-setting", key),
  setSetting: (key, value) => ipcRenderer.invoke("set-setting", key, value),

  // File opened via File > Open menu
  onFileOpened: (callback) => ipcRenderer.on("file-opened", (_, data) => callback(data)),

  // Whether we're in Electron
  isDesktop: true,
  platform: process.platform,  // "darwin" | "win32" | "linux"
});
