// Aleph Orders desktop shell. Loads the live app so it always stays up to date.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const APP_URL = 'https://app.alepheng.co.za/';
const APP_HOSTS = ['app.alepheng.co.za', 'aleph-order-tracker.lovable.app'];

app.setAppUserModelId('za.co.alepheng.orders');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#141619',
    title: 'Aleph Orders',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: true },
  });
  Menu.setApplicationMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (APP_HOSTS.includes(new URL(url).hostname)) return { action: 'allow' };
    } catch {}
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', () => {
    win.loadURL('data:text/html,' + encodeURIComponent(
      '<body style="background:#141619;color:#ddd;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">' +
      '<div style="text-align:center"><h2>Aleph Orders</h2><p>No internet connection.</p>' +
      `<button onclick="location.href='${APP_URL}'" style="padding:8px 16px">Try again</button></div></body>`));
  });

  win.loadURL(APP_URL);
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
