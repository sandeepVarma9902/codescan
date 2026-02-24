/**
 * apps/desktop/src/main.js
 * Electron main process — creates the desktop window.
 * 
 * The entire UI is the web app (apps/web) loaded inside Electron.
 * No UI duplication — same React code runs in browser AND desktop.
 */

const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = process.env.NODE_ENV !== "production";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",  // Nice macOS native titlebar
    backgroundColor: "#0a0a0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, "../assets/icon.png"),
  });

  // In dev: load Vite dev server. In prod: load built files.
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── App Menu ──────────────────────────────────────────────────────────────────

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Open File...",
          accelerator: "CmdOrCtrl+O",
          click: async () => {
            const { filePaths } = await dialog.showOpenDialog(mainWindow, {
              title: "Open code file",
              properties: ["openFile"],
              filters: [
                { name: "Code Files", extensions: ["js","ts","py","java","cpp","cs","go","rs","rb","php","swift","kt","sql","sh","vue","jsx","tsx"] },
                { name: "All Files", extensions: ["*"] },
              ]
            });
            if (filePaths[0]) {
              const content = fs.readFileSync(filePaths[0], "utf-8");
              const ext = path.extname(filePaths[0]);
              mainWindow.webContents.send("file-opened", { content, ext, path: filePaths[0] });
            }
          }
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC: Settings persistence via electron-store ──────────────────────────────

ipcMain.handle("get-setting", (_, key) => {
  // Use electron-store for persisting user settings (API key, preferred mode, etc.)
  try {
    const Store = require("electron-store");
    const store = new Store();
    return store.get(key);
  } catch { return null; }
});

ipcMain.handle("set-setting", (_, key, value) => {
  try {
    const Store = require("electron-store");
    const store = new Store();
    store.set(key, value);
    return true;
  } catch { return false; }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  buildMenu();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
