const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

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

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

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

  // If a printer device is requested for silent printing, match against Windows installed printers
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
