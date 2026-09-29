/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function readServerUrl() {
  const configPath = app.isPackaged
    ? path.join(process.resourcesPath, "app-config.json")
    : path.join(__dirname, "app-config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const serverUrl = new URL(config.serverUrl);

  if (serverUrl.protocol !== "https:") {
    throw new Error("serverUrl must use HTTPS.");
  }
  if (serverUrl.hostname === "YOUR-PRODUCTION-HOST.example") {
    throw new Error("Set desktop/app-config.json to the reachable production HTTPS URL before packaging.");
  }
  return serverUrl;
}

async function createWindow() {
  let serverUrl;
  try {
    serverUrl = readServerUrl();
  } catch (error) {
    await dialog.showMessageBox({ type: "error", title: "Kido Kids setup required", message: error.message });
    app.quit();
    return;
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    const destination = new URL(url);
    if (destination.origin === serverUrl.origin) return { action: "allow" };
    void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== serverUrl.origin) event.preventDefault();
  });
  await window.loadURL(serverUrl.href);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
