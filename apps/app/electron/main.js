/**
 * Simplified Electron main process
 *
 * This version spawns the backend server and uses HTTP API for most operations.
 * Only native features (dialogs, shell) use IPC.
 */

const path = require("path");
const { spawn } = require("child_process");

// Load environment variables from .env file
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");

let mainWindow = null;
let serverProcess = null;
const SERVER_PORT = 3008;

// Get icon path - works in both dev and production
function getIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app", "public", "logo.png")
    : path.join(__dirname, "../public/logo.png");
}

/**
 * Start the backend server
 */
async function startServer() {
  const isDev = !app.isPackaged;

  // Server entry point
  const serverPath = isDev
    ? path.join(__dirname, "../../server/dist/index.js")
    : path.join(process.resourcesPath, "server", "index.js");

  // Set environment variables for server
  const env = {
    ...process.env,
    PORT: SERVER_PORT.toString(),
    DATA_DIR: app.getPath("userData"),
  };

  console.log("[Electron] Starting backend server...");

  serverProcess = spawn("node", [serverPath], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`[Server] ${data.toString().trim()}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server Error] ${data.toString().trim()}`);
  });

  serverProcess.on("close", (code) => {
    console.log(`[Server] Process exited with code ${code}`);
    serverProcess = null;
  });

  // Wait for server to be ready
  await waitForServer();
}

/**
 * Wait for server to be available
 */
async function waitForServer(maxAttempts = 30) {
  const http = require("http");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`Status: ${res.statusCode}`));
          }
        });
        req.on("error", reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error("Timeout"));
        });
      });
      console.log("[Electron] Server is ready");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  throw new Error("Server failed to start");
}

/**
 * Create the main window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0a0a0a",
  });

  // Load Next.js dev server in development or production build
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:3007");
    if (process.env.OPEN_DEVTOOLS === "true") {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, "../.next/server/app/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Handle external links - open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Set app icon (dock icon on macOS)
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(getIconPath());
  }

  try {
    // Start backend server
    await startServer();

    // Create window
    createWindow();
  } catch (error) {
    console.error("[Electron] Failed to start:", error);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  // Kill server process
  if (serverProcess) {
    console.log("[Electron] Stopping server...");
    serverProcess.kill();
    serverProcess = null;
  }
});

// ============================================
// IPC Handlers - Only native features
// ============================================

// Native file dialogs
ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory", "createDirectory"],
  });
  return result;
});

ipcMain.handle("dialog:openFile", async (_, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    ...options,
  });
  return result;
});

ipcMain.handle("dialog:saveFile", async (_, options = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

// Shell operations
ipcMain.handle("shell:openExternal", async (_, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("shell:openPath", async (_, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App info
ipcMain.handle("app:getPath", async (_, name) => {
  return app.getPath(name);
});

ipcMain.handle("app:getVersion", async () => {
  return app.getVersion();
});

ipcMain.handle("app:isPackaged", async () => {
  return app.isPackaged;
});

// Ping - for connection check
ipcMain.handle("ping", async () => {
  return "pong";
});

// Get server URL for HTTP client
ipcMain.handle("server:getUrl", async () => {
  return `http://localhost:${SERVER_PORT}`;
});
