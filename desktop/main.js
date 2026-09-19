const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const expressApp = require('../src/app');
const config = require('../src/config');
const initSocketServer = require('../src/socket');

// Support multi-instance testing via --instance=2
const instanceArg = process.argv.find((arg) => arg.startsWith('--instance='));
if (instanceArg) {
  const instanceId = instanceArg.split('=')[1];
  const customUserData = path.join(app.getPath('appData'), `Faketz-Instance-${instanceId}`);
  app.setPath('userData', customUserData);
}

// === Performance & GPU Flags for High-Motion 60 FPS Game Streaming ===
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('force-high-performance-gpu');
app.commandLine.appendSwitch('gpu-preference', 'high-performance');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-accelerated-video-encode');
app.commandLine.appendSwitch('enable-gpu-memory-buffers');
app.commandLine.appendSwitch('enable-accelerated-mjpeg-decode');

// Disable background window throttling so games in foreground don't drop capture FPS
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Enable GPU hardware WebRTC encoding/decoding using stable DirectX DXGI capturer
app.commandLine.appendSwitch(
  'enable-features',
  'MediaFoundationVideoEncoderAcceleration,MediaFoundationVideoCapture,WebRtcHardwareVideoEncoding,WebRtcHardwareVideoDecoding,WebRtc-Bwe-Receiver-LimitWithHeadroom'
);
app.commandLine.appendSwitch(
  'disable-features',
  'CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,ThrottleDisplayNoneAndVisibilityHiddenFrame,WebRtcHideLocalIpsWithMdns,WebRtcCpuAdaptation'
);

const openWindows = new Set();
let embeddedServer = null;
let pendingMediaCallback = null;

function startEmbeddedServer() {
  return new Promise((resolve) => {
    embeddedServer = http.createServer(expressApp);
    const io = new Server(embeddedServer);
    initSocketServer(io);

    embeddedServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Faketz Desktop] Servidor externo já detectado na porta ${config.PORT}`);
        resolve();
      } else {
        console.error('[Faketz Desktop] Erro no servidor:', err);
        resolve();
      }
    });

    embeddedServer.listen(config.PORT, () => {
      console.log(`[Faketz Desktop] Servidor integrado ativo na porta ${config.PORT}`);
      resolve();
    });
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 960,
    minHeight: 600,
    title: `Faketz - Desktop Gaming Edition${openWindows.size > 0 ? ` (Janela ${openWindows.size + 1})` : ''}`,
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  openWindows.add(win);

  // Shortcut Ctrl+N or Ctrl+Shift+N to open a 2nd desktop window for testing
  win.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'n' && input.type === 'keyDown') {
      createWindow();
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // Se o aplicativo estiver empacotado (.exe final), carrega a versão em nuvem
  // Se estiver em desenvolvimento, carrega o localhost
  if (app.isPackaged) {
    win.loadURL('https://faketz.onrender.com/');
  } else {
    win.loadURL(`http://localhost:${config.PORT}`);
  }

  win.webContents.setWindowOpenHandler((details) => {
    // Permitir a abertura de janelas do Document Picture-in-Picture
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        autoHideMenuBar: true,
        backgroundColor: '#000000',
        alwaysOnTop: true
      }
    };
  });

  win.on('closed', () => {
    openWindows.delete(win);
  });

  return win;
}

// IPC handler to list desktop sources with high-res thumbnails
ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 360, height: 200 },
      fetchWindowIcons: true
    });

    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
      isScreen: s.id.startsWith('screen:')
    }));
  } catch (err) {
    console.error('[Faketz Desktop] Erro ao obter fontes:', err);
    return [];
  }
});

// User selected a specific screen or window from the modal
ipcMain.handle('select-source', async (event, sourceId) => {
  if (pendingMediaCallback) {
    const cb = pendingMediaCallback;
    pendingMediaCallback = null;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const chosenSource = sources.find((s) => s.id === sourceId) || sources[0];
      if (chosenSource) {
        cb({ video: chosenSource, audio: 'loopback' });
      } else {
        cb({});
      }
    } catch (err) {
      console.error('[Faketz Desktop] Erro ao selecionar fonte:', err);
      cb({});
    }
  }
});

// User cancelled screen selection
ipcMain.handle('cancel-source', () => {
  if (pendingMediaCallback) {
    pendingMediaCallback({});
    pendingMediaCallback = null;
  }
});

function getWindowFromRequest(request) {
  if (request && request.frame && request.frame.webContents) {
    try {
      const win = BrowserWindow.fromWebContents(request.frame.webContents);
      if (win && !win.isDestroyed()) return win;
    } catch (_) {}
  }
  if (request && request.frame && typeof BrowserWindow.fromWebFrameMain === 'function') {
    try {
      const win = BrowserWindow.fromWebFrameMain(request.frame);
      if (win && !win.isDestroyed()) return win;
    } catch (_) {}
  }
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  for (const win of openWindows) {
    if (win && !win.isDestroyed()) return win;
  }
  return null;
}

app.whenReady().then(async () => {
  // Apenas inicia o servidor local se estiver em desenvolvimento
  if (!app.isPackaged) {
    await startEmbeddedServer();
  }

  // Handle display media requests (screen / window capture)
  // Comentado para permitir que o Electron use o seletor nativo do Chromium (que possui suporte à exclusão de áudio do próprio app).
  /*
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    pendingMediaCallback = callback;
    try {
      const targetWin = getWindowFromRequest(request);
      if (targetWin && !targetWin.isDestroyed()) {
        targetWin.webContents.send('open-screen-picker');
      } else {
        callback({});
        pendingMediaCallback = null;
      }
    } catch (err) {
      console.error('[Faketz Desktop] Erro ao iniciar compartilhamento de tela:', err);
      callback({});
      pendingMediaCallback = null;
    }
  });
  */

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (embeddedServer) {
    try {
      embeddedServer.close();
    } catch (_) {}
  }
});
