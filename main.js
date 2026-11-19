const { app, BrowserWindow, protocol, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

if (app && app.commandLine) {
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

let mainWindow;
let _printWindow = null;

function getOrCreatePrintWindow() {
  if (!_printWindow || _printWindow.isDestroyed()) {
    _printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    _printWindow.loadURL('about:blank');
    _printWindow.on('closed', () => { _printWindow = null; });
  }
  return _printWindow;
}

function spawnPrintWin() {
  getOrCreatePrintWindow();
}

if (protocol && protocol.registerSchemesAsPrivileged) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ]);
}

function waitForNextJs(url, retries = 30, interval = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts++;
      console.log(`Waiting for Next.js... (attempt ${attempts}/${retries})`);
      http.get(url, (res) => {
        console.log('Next.js is ready!');
        resolve();
      }).on('error', () => {
        if (attempts >= retries) {
          reject(new Error('Next.js did not start in time'));
        } else {
          setTimeout(check, interval);
        }
      });
    };
    check();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
    title: "Hilal Wholesaler Shop - Inventory & POS System",
  });

  const isDev = !app.isPackaged;
  
  if (isDev) {
    const staticPath = 'http://localhost:3000';
    waitForNextJs(staticPath)
      .then(() => {
        mainWindow.loadURL(staticPath);
        mainWindow.webContents.openDevTools();
      })
      .catch((err) => {
        console.error(err.message);
        mainWindow.loadURL(staticPath);
      });
  } else {
    mainWindow.loadURL('app://./index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startBackend() {
  console.log('Starting Hilal Wholesaler backend...');
  try {
    const fs = require('fs');
    const resourceBackend = path.join(process.resourcesPath, 'backend', 'server.js');
    if (app.isPackaged && fs.existsSync(resourceBackend)) {
      require(resourceBackend);
      console.log('Backend started successfully from resources:', resourceBackend);
    } else {
      require('./backend/server.js');
      console.log('Backend started successfully.');
    }
  } catch (err) {
    console.error('Failed to start backend:', err);
  }
}

ipcMain.handle('get-printers', async () => {
  try {
    const printers = await mainWindow.webContents.getPrintersAsync();
    return printers.map(p => ({ name: p.name, isDefault: p.isDefault }));
  } catch (err) {
    console.error('[IPC get-printers] Error:', err);
    return [];
  }
});

// ─── Select Destination Folder for Backups ────────────────────────────────────
ipcMain.handle('select-backup-folder', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow || null, {
      title: 'Select Destination Folder for Database Backup',
      buttonLabel: 'Select Folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }
    return { canceled: false, folderPath: result.filePaths[0] };
  } catch (err) {
    console.error('[IPC select-backup-folder] Error:', err);
    return { canceled: true, error: err.message };
  }
});

// ─── Save Database Backup As (Choose Destination Folder / USB) ─────────────────
ipcMain.handle('save-backup-as', async () => {
  try {
    const dateStr = new Date().toISOString().slice(0, 10);
    const defaultName = `Hilal_Wholesaler_Backup_${dateStr}.db`;
    const result = await dialog.showSaveDialog(mainWindow || null, {
      title: 'Save Database Backup To Computer / USB',
      defaultPath: defaultName,
      filters: [{ name: 'SQLite Database (*.db)', extensions: ['db'] }]
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const userDataPath = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share');
    const appDataDir = path.join(userDataPath, 'HilalWholesalerShop');
    const candidates = [
      path.join(appDataDir, 'wholesale.db'),
      path.join(__dirname, 'backend', 'wholesale.db'),
      path.join(__dirname, 'wholesale.db')
    ];
    const liveDb = candidates.find(c => fs.existsSync(c)) || path.join(appDataDir, 'wholesale.db');
    if (!fs.existsSync(liveDb)) {
      return { canceled: true, error: 'Live database file not found.' };
    }

    fs.copyFileSync(liveDb, result.filePath);
    return { canceled: false, filePath: result.filePath };
  } catch (err) {
    console.error('[IPC save-backup-as] Error:', err);
    return { canceled: true, error: err.message };
  }
});

// ─── Open PDF in External Browser (Chrome / Edge) ─────────────────────────
ipcMain.handle('open-pdf-in-browser', async (event, pdfBase64, fileName) => {
  try {
    const { pathToFileURL } = require('url');
    const fs = require('fs');
    const cp = require('child_process');
    const tempDir = app.getPath('temp');
    const safeName = (fileName || 'wholesale_invoice_a4.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(tempDir, safeName);
    fs.writeFileSync(filePath, Buffer.from(pdfBase64, 'base64'));
    
    // Explicitly target Google Chrome or Edge to guarantee full PDF viewing & download controls
    const browserCandidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
      process.env.PROGRAMFILES ? path.join(process.env.PROGRAMFILES, 'Google\\Chrome\\Application\\chrome.exe') : null,
      process.env['PROGRAMFILES(X86)'] ? path.join(process.env['PROGRAMFILES(X86)'], 'Google\\Chrome\\Application\\chrome.exe') : null,
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ].filter(Boolean);

    for (const cand of browserCandidates) {
      if (fs.existsSync(cand)) {
        cp.spawn(cand, [filePath], { detached: true, stdio: 'ignore' }).unref();
        console.log('[main.js open-pdf-in-browser] Opened directly in browser:', cand, filePath);
        return { success: true, filePath, browser: cand };
      }
    }

    // Fallback: Open using default shell external association
    const fileUrl = pathToFileURL(filePath).href;
    console.log('[main.js open-pdf-in-browser] Opening PDF via shell.openExternal:', fileUrl);
    await shell.openExternal(fileUrl);
    return { success: true, filePath };
  } catch (err) {
    console.error('[main.js open-pdf-in-browser] Error:', err);
    try {
      const tempDir = app.getPath('temp');
      const safeName = (fileName || 'wholesale_invoice_a4.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = path.join(tempDir, safeName);
      await shell.openPath(filePath);
      return { success: true, filePath };
    } catch (e2) {
      return { success: false, error: err.message };
    }
  }
});

// ─── Silent / Native Print via IPC ──────────────────────────────────────────
// Renderer sends raw HTML + optional printerName (or options object).
//   printerName provided  → silent: true  (NO dialog, NO extra window)
//   printerName omitted   → silent: false (OS dialog, but no extra app window)
ipcMain.handle('print-html', async (event, html, printerNameOrOptions) => {
  let printerName = null;
  let isSilent = false;
  let isA4 = false;

  if (typeof printerNameOrOptions === 'string' && printerNameOrOptions.trim()) {
    printerName = printerNameOrOptions.trim();
    isSilent = printerName !== 'os_dialog';
  } else if (typeof printerNameOrOptions === 'object' && printerNameOrOptions !== null) {
    isSilent = printerNameOrOptions.silent === true || printerNameOrOptions.silent === 'true';
    printerName = (printerNameOrOptions.printerName || printerNameOrOptions.deviceName || '').trim() || null;
    isA4 = printerNameOrOptions.format === 'a4' || printerNameOrOptions.pageSize === 'A4';
  }

  if (printerName === 'os_dialog') {
    printerName = null;
    isSilent = false;
  }

  console.log('[main.js print-html] Received print request. Target Printer:', printerName, 'Silent:', isSilent, 'isA4:', isA4);

  // If A4 format is requested and no specific printer was selected, auto-target installed A4/Laser printer
  // so it never accidentally routes A4 documents to an 80mm thermal receipt roll printer (e.g. POS-80)!
  if (isA4 && (!printerName || printerName === '')) {
    try {
      const printers = mainWindow && !mainWindow.isDestroyed() ? await mainWindow.webContents.getPrintersAsync() : [];
      const a4Match = printers.find(p => /laser|deskjet|inkjet|officejet|canon|epson|brother|hp/i.test(p.name) && !/pos|80|receipt|thermal|barcode/i.test(p.name)) ||
                      printers.find(p => !/pos|80|receipt|thermal|barcode/i.test(p.name) && !/onenote|xps|fax/i.test(p.name)) ||
                      printers.find(p => /pdf/i.test(p.name));
      if (a4Match) {
        printerName = a4Match.name;
        console.log('[main.js print-html] Auto-selected A4 printer device for A4 format:', printerName);
      }
    } catch (e) {
      console.warn('[main.js print-html] Failed to auto-detect A4 printer:', e.message);
    }
  }

  // If a printer device is requested for printing, match against Windows installed printers
  if (printerName) {
    try {
      const printers = mainWindow && !mainWindow.isDestroyed() ? await mainWindow.webContents.getPrintersAsync() : [];
      const match = printers.find(p => p.name.toLowerCase() === printerName.toLowerCase()) ||
                    printers.find(p => p.name.toLowerCase().includes(printerName.toLowerCase()));
      if (match) {
        printerName = match.name;
        console.log('[main.js print-html] Matched Windows printer device:', printerName);
      } else {
        console.warn('[main.js print-html] Requested printer not found among Windows devices, attempting:', printerName);
      }
    } catch (e) {
      console.warn('[main.js print-html] Failed to query printers:', e.message);
    }
  }

  return new Promise((resolve) => {
    const win = getOrCreatePrintWindow();
    let resolved = false;

    // Safety timeout (30 s — covers open OS print dialogs)
    const safetyTimer = setTimeout(() => {
      console.log('[main.js print-html] Print safety timeout reached.');
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, 30000);

    const base64Html = Buffer.from(html, 'utf8').toString('base64');
    const dataUri = `data:text/html;base64,${base64Html}`;

    const doPrint = async () => {
      if (win.isDestroyed()) {
        clearTimeout(safetyTimer);
        if (!resolved) { resolved = true; resolve(false); }
        return;
      }

      try {
        // Wait for embedded base64 font decoding (safety 120ms check)
        await win.webContents.executeJavaScript(`
          Promise.race([
            document.fonts ? document.fonts.ready : Promise.resolve(),
            new Promise(resolve => setTimeout(resolve, 120))
          ]).then(() => true).catch(() => false)
        `);
      } catch (e) {
        console.warn('[main.js print-html] Font load check skipped:', e);
      }

      // Fast layout paint check (15ms stabilization)
      await new Promise(r => setTimeout(r, 15));

      if (win.isDestroyed()) {
        clearTimeout(safetyTimer);
        if (!resolved) { resolved = true; resolve(false); }
        return;
      }

      const printOptions = {
        silent: isSilent,
        printBackground: true,
        margins: { marginType: 'none' }
      };

      if (printerName) {
        printOptions.deviceName = printerName;
      }

      if (isA4) {
        printOptions.pageSize = 'A4';
      } else {
        printOptions.usePrinterDefaultPageSize = true;
      }

      console.log('[main.js print-html] Printing with options:', printOptions);

      try {
        win.webContents.print(printOptions, (success, errorType) => {
          clearTimeout(safetyTimer);
          console.log('[main.js print-html] Print callback. Success:', success, 'Error:', errorType);

          // Clear window by loading about:blank to keep it pre-warmed for next print
          if (!win.isDestroyed()) {
            win.loadURL('about:blank');
          }

          if (!resolved) {
            resolved = true;
            resolve(success);
          }
        });
      } catch (printErr) {
        clearTimeout(safetyTimer);
        console.error('[main.js print-html] print() invocation error:', printErr);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }
    };

    win.webContents.once('did-finish-load', doPrint);
    win.loadURL(dataUri);
  });
});

app.on('ready', () => {
  const isDev = !app.isPackaged;
  
  if (!isDev) {
    protocol.registerFileProtocol('app', (request, callback) => {
      let url = request.url.replace('app://./', '').replace('app://', '').replace(/^\//, '');
      const fs = require('fs');
      
      let decodedPath = decodeURIComponent(url);
      if (decodedPath === '.' || decodedPath === './' || decodedPath === '' || decodedPath === '/') {
        decodedPath = 'index.html';
      }
      
      const fullPath = path.join(__dirname, 'frontend/out', decodedPath);
      if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
        callback({ path: path.join(fullPath, 'index.html') });
      } else if (!fs.existsSync(fullPath) && !fullPath.includes('.')) {
        const altPath = path.join(fullPath, 'index.html');
        if (fs.existsSync(altPath)) {
          callback({ path: altPath });
        } else {
          callback({ path: fullPath });
        }
      } else {
        callback({ path: fullPath });
      }
    });
  }

  startBackend();
  createWindow();
  // Pre-warm the silent print window so the first print job is instant.
  spawnPrintWin();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
