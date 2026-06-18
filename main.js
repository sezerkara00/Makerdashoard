const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');
const ConnectionService = require('./services/machine/connection');
const JobRunner = require('./services/machine/job-runner');
const SafetyService = require('./services/machine/safety');
const { syncAndAnalyzePrinterLogs } = require('./services/log-analyzer');

const connectionService = new ConnectionService();
const jobRunner = new JobRunner();
const safetyService = new SafetyService();

let mainWindow = null;
let tray = null;
let isQuitting = false;

function getLogPath() {
    return path.join(app.getPath('userData'), 'makerdashboard-launch.log');
}

function writeLog(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    try {
        fs.appendFileSync(getLogPath(), line);
    } catch(e) {
        console.error('Failed to write to log:', e);
    }
    console.log(msg);
}

/**
 * Automatically seeds default pre-configured settings for OrcaSlicer and LaserGRBL.
 * Dynamically updates paths to match the current target machine.
 */
function initializeDefaultConfigurations() {
    writeLog('--- Initializing Default Configurations ---');
    try {
        const appDataPath = app.getPath('appData'); // Path to AppData\Roaming

        // --- 1. OrcaSlicer Config Seeding & Sanitization ---
        const orcaConfigDir = path.join(appDataPath, 'OrcaSlicer');
        const orcaConfigFile = path.join(orcaConfigDir, 'OrcaSlicer.conf');

        if (!fs.existsSync(orcaConfigFile)) {
            writeLog(`OrcaSlicer configuration not found at ${orcaConfigFile}. Initializing from default template...`);

            if (!fs.existsSync(orcaConfigDir)) {
                fs.mkdirSync(orcaConfigDir, { recursive: true });
            }

            const templateOrcaPath = path.join(__dirname, 'assets', 'default-config', 'OrcaSlicer', 'OrcaSlicer.conf');
            if (fs.existsSync(templateOrcaPath)) {
                let configText = fs.readFileSync(templateOrcaPath, 'utf8');

                // Dynamic path replacement for current user (escape backslashes for JSON)
                const userDownloads = app.getPath('downloads').replace(/\\/g, '\\\\');
                const userTemp = app.getPath('temp').replace(/\\/g, '\\\\');

                writeLog(`Sanitizing OrcaSlicer.conf. Injecting user paths - Downloads: ${userDownloads}, Temp: ${userTemp}`);
                configText = configText.replace(/\{\{DOWNLOADS\}\}/g, userDownloads);
                configText = configText.replace(/\{\{TEMP\}\}/g, userTemp);

                // Recalculate MD5 checksum to ensure OrcaSlicer loads the modified file cleanly
                const cleanConfigText = configText.split(/\r?\n# MD5 checksum/)[0].trim();
                const hash = crypto.createHash('md5').update(cleanConfigText).digest('hex').toUpperCase();
                const finalConfigText = `${cleanConfigText}\n\n# MD5 checksum ${hash}\n`;

                fs.writeFileSync(orcaConfigFile, finalConfigText, 'utf8');
                writeLog('OrcaSlicer configuration successfully seeded and paths sanitized.');
            } else {
                writeLog(`ERROR: OrcaSlicer template config not found at ${templateOrcaPath}`);
            }
        } else {
            writeLog('OrcaSlicer configuration already exists. Skipping seeding.');
        }

        // --- 2. LaserGRBL Config Seeding ---
        const laserConfigDir = path.join(appDataPath, 'LaserGRBL');

        if (!fs.existsSync(laserConfigDir)) {
            fs.mkdirSync(laserConfigDir, { recursive: true });
        }

        const filesToCopy = [
            'CustomButtons.bin',
            'LaserGRBL.Settings.bin',
            'StandardMaterials.psh'
        ];

        filesToCopy.forEach(fileName => {
            const destPath = path.join(laserConfigDir, fileName);
            if (!fs.existsSync(destPath)) {
                const srcPath = path.join(__dirname, 'assets', 'default-config', 'LaserGRBL', fileName);
                if (fs.existsSync(srcPath)) {
                    const fileContent = fs.readFileSync(srcPath);
                    fs.writeFileSync(destPath, fileContent);
                    writeLog(`LaserGRBL file ${fileName} successfully seeded.`);
                } else {
                    writeLog(`ERROR: LaserGRBL template file not found at ${srcPath}`);
                }
            } else {
                writeLog(`LaserGRBL file ${fileName} already exists. Skipping.`);
            }
        });

    } catch (err) {
        writeLog(`ERROR in initializeDefaultConfigurations: ${err.message}`);
    }
}

function createTray() {
    if (tray) return;
    const iconPath = path.join(__dirname, 'assets', 'laser.png');
    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Göster / Show',
            click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Kapat / Quit',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Layerstech Studio');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webviewTag: true,
            webSecurity: false
        },
        title: "Layerstech Studio",
        icon: path.join(__dirname, 'assets', 'laser.png')
    });

    mainWindow.removeMenu(); // Remove default menu bar

    // Pipe renderer console logs to main process log
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        const file = path.basename(sourceId);
        writeLog(`[Console] [${file}:${line}] ${message}`);
    });

    mainWindow.loadFile('pages/home/home.html');
    // mainWindow.webContents.openDevTools(); // Uncomment for debugging

    createTray();

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            let minimizeToTray = false;
            try {
                const settingsPath = path.join(app.getPath('userData'), 'settings.json');
                if (fs.existsSync(settingsPath)) {
                    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                    minimizeToTray = settings.minimizeToTray === true;
                }
            } catch (err) {
                writeLog(`Error checking minimizeToTray setting: ${err.message}`);
            }

            if (minimizeToTray) {
                event.preventDefault();
                mainWindow.hide();
            }
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    initializeDefaultConfigurations();
    createWindow();

    app.on('activate', () => {
        if (mainWindow) {
            mainWindow.show();
        } else if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    app.on('before-quit', () => {
        isQuitting = true;
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

const isDev = !app.isPackaged;

function getBinPath(subPath) {
    if (isDev) {
        // First check if it exists in the local bin folder (synced tools)
        const localBinPath = path.join(__dirname, 'bin', subPath);
        if (fs.existsSync(localBinPath)) {
            return localBinPath;
        }

        // Fallback for developer's environment
        if (subPath.startsWith('OrcaSlicer')) {
            return 'C:\\gelistirme\\OrcaSlicer\\build\\src\\Release';
        }
        if (subPath.startsWith('LaserGRBL')) {
            return path.join(__dirname, 'bin', 'LaserGRBL');
        }

        return path.join(__dirname, subPath);
    } else {
        // In production, resources are in process.resourcesPath
        const prodPath = path.join(process.resourcesPath, 'bin', subPath);
        return prodPath;
    }
}

/**
 * Robustly launch an executable
 */
function launchExecutable(displayName, exeName, subFolder, args = []) {
    const binFolder = getBinPath(subFolder);
    const targetPath = path.join(binFolder, exeName);
    
    writeLog(`--- Launch Attempt: ${displayName} ---`);
    writeLog(`Executable: ${targetPath}`);
    writeLog(`Arguments: ${args.join(' ')}`);
    writeLog(`CWD: ${binFolder}`);

    if (!fs.existsSync(targetPath)) {
        const msg = `${displayName} bulunamadı:\n${targetPath}\n\nLütfen uygulamanın 'bin/' klasörü altında olduğundan emin olun.`;
        writeLog(`ERROR: File not found at ${targetPath}`);
        dialog.showErrorBox(`${displayName} Bulunamadı`, msg);
        return;
    }

    try {
        // Use spawn without shell:true for direct binary execution to avoid quoting issues
        // In production, we use a user-writable CWD (home directory) and fully detach stdio ('ignore')
        // to prevent permission issues (Program Files) and pipe-closure crashes when the Dashboard exits.
        const spawnCwd = isDev ? binFolder : app.getPath('home');
        const spawnStdio = isDev ? ['ignore', 'pipe', 'pipe'] : 'ignore';

        writeLog(`Spawning child process with CWD: ${spawnCwd}`);

        const child = spawn(targetPath, args, {
            cwd: spawnCwd,
            detached: true,
            stdio: spawnStdio
        });

        if (child.stdout) {
            child.stdout.on('data', d => writeLog(`[${displayName} stdout] ${d.toString().trim()}`));
        }
        if (child.stderr) {
            child.stderr.on('data', d => writeLog(`[${displayName} stderr] ${d.toString().trim()}`));
        }
        
        child.on('error', err => {
            writeLog(`[${displayName} spawn error] ${err.message}`);
            dialog.showErrorBox(`${displayName} Başlatma Hatası`, `Uygulama başlatılamadı: ${err.message}`);
        });

        child.on('close', code => {
            writeLog(`[${displayName} process] exited with code ${code}`);
        });

        child.unref();
        writeLog(`[${displayName}] Process spawned successfully (PID: ${child.pid})`);
    } catch (err) {
        writeLog(`[${displayName} fatal error] ${err.message}`);
        dialog.showErrorBox(`${displayName} Kritik Hata`, `Beklenmedik bir hata oluştu: ${err.message}`);
    }
}

// Logic to launch external applications
ipcMain.on('launch-app', (event, appName, args = []) => {
    if (appName === 'orca-slicer.exe') {
        launchExecutable('OrcaSlicer', 'orca-slicer.exe', 'OrcaSlicer', args);
    } else if (appName === 'LaserGRBL.exe') {
        launchExecutable('LaserGRBL', 'LaserGRBL.exe', 'LaserGRBL', args);
    } else {
        // Generic launch for full paths
        const displayName = path.basename(appName);
        launchExecutable(displayName, displayName, path.dirname(appName), args);
    }
});

ipcMain.on('launch-laser', (event, filePath) => {
    const args = filePath ? [filePath] : [];
    launchExecutable('LaserGRBL', 'LaserGRBL.exe', 'LaserGRBL', args);
});

// Login başarılı → dashboard'a yönlendir
ipcMain.on('login-success', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        win.loadFile('pages/home/home.html');
        writeLog('Login successful — navigating to dashboard.');
    }
});

// Logout → login sayfasına dön
ipcMain.on('logout', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        win.loadFile('pages/login/login.html');
        writeLog('User logged out — navigating to login.');
    }
});

// Wiki sayfasını uygulama içinde aç (artık gömülü webview kullanılıyor, yedek olarak kalıyor)
ipcMain.on('open-wiki', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        win.loadURL('https://wiki.layerstech.website/home/');
    }
});

// Log dosyasını Not Defteri'nde aç
ipcMain.on('show-log', () => {
    const logPath = getLogPath();
    writeLog('--- Log açıldı (kullanıcı isteği) ---');
    shell.openPath(logPath).then(err => {
        if (err) {
            dialog.showErrorBox('Log Bulunamadı', `Log dosyası henüz oluşmamış.\nYol: ${logPath}`);
        }
    });
});

// User data path query for renderer process
ipcMain.on('get-user-data-path', (event) => {
    event.returnValue = app.getPath('userData');
});

// Handle file opening dialog
ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Laser Source Files', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'svg'] }
        ]
    });
    
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    const filePath = result.filePaths[0];
    const extension = path.extname(filePath).toLowerCase();
    
    // Read text content only for SVG. Raster data is read in renderer as binary/base64.
    let content = '';
    if (extension === '.svg') {
        content = fs.readFileSync(filePath, 'utf-8');
    }

    return {
        path: filePath,
        name: path.basename(filePath),
        extension: extension,
        content: content
    };
});

// Handle directory selection dialog
ipcMain.handle('select-directory-dialog', async (event, defaultPath) => {
    const options = {
        properties: ['openDirectory']
    };
    
    if (defaultPath) {
        try {
            if (!fs.existsSync(defaultPath)) {
                fs.mkdirSync(defaultPath, { recursive: true });
            }
            options.defaultPath = defaultPath;
        } catch (e) {
            console.error("[main.js] Failed to create or check defaultPath for dialog:", e);
        }
    }

    const result = await dialog.showOpenDialog(options);
    
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

ipcMain.handle('machine-connect', async (_event, profile) => {
    return connectionService.connect(profile);
});

ipcMain.handle('machine-disconnect', async () => {
    return connectionService.disconnect();
});

ipcMain.handle('machine-status', async () => {
    return {
        connection: connectionService.getState(),
        job: jobRunner.getStatus(),
        safety: safetyService.getState()
    };
});

ipcMain.handle('machine-load-job', async (_event, gcodeText) => {
    if (!connectionService.getState().connected) {
        throw new Error('Machine is not connected.');
    }
    return jobRunner.loadJob(gcodeText);
});

ipcMain.handle('machine-job-control', async (_event, action) => {
    if (!connectionService.getState().connected) {
        throw new Error('Machine is not connected.');
    }

    if (action === 'start') {
        const gate = safetyService.canStartJob();
        if (!gate.ok) throw new Error(gate.reason);
        return jobRunner.start();
    }
    if (action === 'pause') return jobRunner.pause();
    if (action === 'resume') return jobRunner.resume();
    if (action === 'stop') return jobRunner.stop();

    throw new Error(`Unknown action: ${action}`);
});


ipcMain.handle('machine-safety-state', async (_event, partialState) => {
    return safetyService.setState(partialState || {});
});

// Handle G-code file save dialog
ipcMain.handle('save-file-dialog', async (event, defaultName) => {
    const result = await dialog.showSaveDialog({
        defaultPath: defaultName,
        filters: [
            { name: 'G-code Files', extensions: ['gcode'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result;
});

ipcMain.handle('printer-sync-logs', async (_event, printer) => {
    try {
        const result = await syncAndAnalyzePrinterLogs(printer);
        return result;
    } catch (err) {
        writeLog(`[Log Analyzer IPC Error] ${err.message}`);
        return { success: false, error: err.message };
    }
});

// ─── OS Native Bildirim (her zaman - uygulamadan bağımsız) ───────────────────
const { Notification } = require('electron');

ipcMain.on('show-os-notification', (event, { title, body, type }) => {
    if (!Notification.isSupported()) return;

    const win = BrowserWindow.fromWebContents(event.sender);
    const iconPath = path.join(__dirname, 'assets', 'laser.png');

    const notif = new Notification({
        title: title || 'Layerstech Studio',
        body: body || '',
        icon: iconPath,
        silent: true,   // Renderer'da zaten synth ses çalıyor, sistem sesi tekrar çalmasın
        urgency: type === 'error' || type === 'cancel' ? 'critical' : 'normal',
    });

    notif.on('click', () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    notif.show();
});
