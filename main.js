// Electron main process for Helmet CAD.
// Owns the application window, the native menu, and file (Save/Load) IPC.
const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#2b2f36',
    title: 'Helmet CAD',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));
  buildMenu();
}

// Send a simple command to the renderer (menu -> app actions).
function send(cmd, payload) {
  if (mainWindow) mainWindow.webContents.send('menu', { cmd, payload });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { type: 'separator' },
        // Reserved hook for the future "Blueprint" feature (title block / sheet export).
        { label: 'Blueprint… (coming soon)', accelerator: 'CmdOrCtrl+B', click: () => send('blueprint') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => send('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => send('redo') },
        { type: 'separator' },
        { label: 'Delete', accelerator: 'Delete', click: () => send('delete') },
        { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: () => send('duplicate') },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => send('selectAll') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => send('zoomIn') },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => send('zoomOut') },
        { label: 'Zoom to Fit', accelerator: 'CmdOrCtrl+0', click: () => send('zoomFit') },
        { type: 'separator' },
        { label: 'Toggle Grid', accelerator: 'CmdOrCtrl+G', click: () => send('toggleGrid') },
        { label: 'Toggle Snap', accelerator: 'CmdOrCtrl+Shift+G', click: () => send('toggleSnap') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'reload' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- File IPC ---------------------------------------------------------------

ipcMain.handle('dialog:save', async (_e, { data, currentPath }) => {
  let filePath = currentPath;
  if (!filePath) {
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Drawing',
      defaultPath: 'drawing.hcad.json',
      filters: [{ name: 'Helmet CAD', extensions: ['hcad.json', 'json'] }],
    });
    if (res.canceled) return { canceled: true };
    filePath = res.filePath;
  }
  fs.writeFileSync(filePath, data, 'utf8');
  return { canceled: false, filePath };
});

ipcMain.handle('dialog:saveAs', async (_e, { data }) => {
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Drawing As',
    defaultPath: 'drawing.hcad.json',
    filters: [{ name: 'Helmet CAD', extensions: ['hcad.json', 'json'] }],
  });
  if (res.canceled) return { canceled: true };
  fs.writeFileSync(res.filePath, data, 'utf8');
  return { canceled: false, filePath: res.filePath };
});

ipcMain.handle('dialog:open', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Drawing',
    properties: ['openFile'],
    filters: [{ name: 'Helmet CAD', extensions: ['hcad.json', 'json'] }],
  });
  if (res.canceled || !res.filePaths[0]) return { canceled: true };
  const data = fs.readFileSync(res.filePaths[0], 'utf8');
  return { canceled: false, filePath: res.filePaths[0], data };
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
