const { app, BrowserWindow, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");

const WINDOW_W = 340;
const WINDOW_H = 245;
const MARGIN = 20;

function fetchSettings() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:8000/v1/checkin/settings", (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ enabled: true, interval_minutes: 30 });
        }
      });
    });
    req.on("error", () => resolve({ enabled: true, interval_minutes: 30 }));
    req.setTimeout(3000, () => req.destroy());
  });
}

const createWindow = () => {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: WINDOW_W,
    height: WINDOW_H,
    minWidth: WINDOW_W,
    minHeight: WINDOW_H,
    maxWidth: WINDOW_W,
    maxHeight: WINDOW_H,
    x: sw - WINDOW_W - MARGIN,
    y: sh - WINDOW_H - MARGIN,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const distPath = path.join(__dirname, "..", "dist", "index.html");
  const devUrl = "http://127.0.0.1:43817";

  function loadNormal() {
    if (fs.existsSync(distPath)) {
      win.loadFile(distPath);
    } else {
      win.loadURL(devUrl);
    }
  }

  function loadCheckIn() {
    if (fs.existsSync(distPath)) {
      win.loadFile(distPath, { query: { checkin: "1" } });
    } else {
      win.loadURL(`${devUrl}?checkin=1`);
    }
  }

  loadNormal();

  // Hide instead of closing, then reload normal mode for next time
  win.on("close", (e) => {
    e.preventDefault();
    win.hide();
    loadNormal();
  });

  // --- Check-in timer ---
  let lastCheckIn = 0;

  setInterval(async () => {
    const settings = await fetchSettings();
    if (!settings.enabled) return;

    const intervalMs = (settings.interval_minutes || 30) * 60 * 1000;
    const now = Date.now();
    if (now - lastCheckIn < intervalMs) return;

    lastCheckIn = now;
    loadCheckIn();

    win.once("ready-to-show", () => {
      win.show();
      win.focus();
    });

    // If already loaded, just show
    if (!win.isVisible()) {
      win.show();
      win.focus();
    }
  }, 60 * 1000); // check every minute
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Keep app alive even when all windows hidden
app.on("window-all-closed", () => {
  // intentionally do nothing — app stays in background
});
