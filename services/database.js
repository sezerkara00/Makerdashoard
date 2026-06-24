/**
 * Per-Printer Database Manager
 *
 * Her yazıcının verileri ayrı bir JSON dosyasında tutulur:
 *   <yazici_klasoru>/analysis_database.json
 *
 * Kullanım:
 *   const { getPrinterDb } = require('./database');
 *   const db = getPrinterDb(printerId);
 *   db.get('analysis_runs').value();
 */

const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');
const electron = require('electron');

// Safe reference to electron app
const app = electron.app || (electron.remote && electron.remote.app);

// Her yazıcı için ayrı DB instance cache'i
const _dbCache = new Map();

/**
 * Electron app.getPath veya CLI fallbacks ile userData dizinini döndürür.
 */
function getUserDataPath() {
    if (app && typeof app.getPath === 'function') {
        return app.getPath('userData');
    }
    // Fallback for tests/CLI environment
    return process.env.APPDATA 
        ? path.join(process.env.APPDATA, 'makerdashboard')
        : path.join(process.cwd(), 'temp_userdata');
}

/**
 * Yazıcı ID'sini dosya adına uygun hale getirir (yedek/fallback için).
 */
function sanitizePrinterId(printerId) {
    return `printer_${String(printerId).replace(/[^a-zA-Z0-9_\-]/g, '_')}`;
}

/**
 * Yazıcının kendi klasörünü ve veritabanı dosyasının hedeflenen yolunu bulur.
 */
function getPrinterDbPath(printerId) {
    try {
        const userDataPath = getUserDataPath();
        const printersPath = path.join(userDataPath, 'printers.json');
        if (fs.existsSync(printersPath)) {
            const printers = JSON.parse(fs.readFileSync(printersPath, 'utf8'));
            const printer = printers.find(p => String(p.id) === String(printerId));
            if (printer && printer.logFolderPath && printer.name) {
                const safeName = printer.name.replace(/[^a-z0-9_\-\s]/gi, '_').trim();
                const folder = path.join(printer.logFolderPath, safeName);
                if (!fs.existsSync(folder)) {
                    fs.mkdirSync(folder, { recursive: true });
                }
                return path.join(folder, 'analysis_database.json');
            }
        }
    } catch (e) {
        console.error('[DB] Yazıcı klasörü tespit edilirken hata:', e.message);
    }

    // Fallback: appData altındaki makerdashboard/db klasörü
    const dbDir = path.join(getUserDataPath(), 'makerdashboard', 'db');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    return path.join(dbDir, `${sanitizePrinterId(printerId)}.json`);
}

/**
 * Belirli bir yazıcı için DB instance'ı döndürür.
 * İlk çağrıda dosyayı oluşturur veya taşır, sonraki çağrılarda cache'den döner.
 *
 * @param {string} printerId - Yazıcı ID'si
 * @returns {Object} lowdb instance
 */
function getPrinterDb(printerId) {
    if (!printerId) {
        throw new Error('[DB] printerId zorunludur.');
    }

    const dbPath = getPrinterDbPath(printerId);
    
    if (_dbCache.has(printerId)) {
        if (!fs.existsSync(dbPath)) {
            console.log(`[DB] Database file was deleted on disk: ${dbPath}. Invalidating cache.`);
            _dbCache.delete(printerId);
        } else {
            return _dbCache.get(printerId);
        }
    }

    // Eski userData altındaki per-printer DB'yi yeni makine klasörüne taşı (varsa)
    const fallbackPath = path.join(
        getUserDataPath(),
        'makerdashboard',
        'db',
        `${sanitizePrinterId(printerId)}.json`
    );

    if (dbPath !== fallbackPath && !fs.existsSync(dbPath) && fs.existsSync(fallbackPath)) {
        try {
            console.log(`[DB] Eski per-printer DB bulundu, taşınıyor:\n  Kaynak: ${fallbackPath}\n  Hedef: ${dbPath}`);
            fs.copyFileSync(fallbackPath, dbPath);
            fs.renameSync(fallbackPath, fallbackPath + '.bak');
        } catch (e) {
            console.error('[DB] Dosya taşıma hatası:', e.message);
        }
    }

    const adapter = new FileSync(dbPath);
    const db = low(adapter);

    // Varsayılan yapı
    db.defaults({
        analysis_runs: [],
        totalPrintDuration: 0,
        stats: {
            totalPrintJobs: 0,
            longestJob: '0sn',
            totalTime: '0sn',
            totalPrintTime: '0sn',
            avgTimePerPrint: '0sn'
        }
    }).write();

    // Backwards compatibility check
    if (db.get('totalPrintDuration').value() === undefined) {
        db.set('totalPrintDuration', 0).write();
    }
    if (db.get('stats').value() === undefined) {
        db.set('stats', {
            totalPrintJobs: 0,
            longestJob: '0sn',
            totalTime: '0sn',
            totalPrintTime: '0sn',
            avgTimePerPrint: '0sn'
        }).write();
    }

    _dbCache.set(printerId, db);
    console.log(`[DB] Yazıcı DB yüklendi: ${dbPath}`);
    return db;
}

/**
 * Geriye dönük uyumluluk: Tüm yazıcıların verilerini tek bir DB'de oku.
 * YENİ KOD BU FONKSİYONU KULLANMAMALI — getPrinterDb() kullan.
 *
 * Eski global DB dosyasını açar ve mevcut veriler varsa döndürür.
 */
function getDb() {
    const legacyPath = path.join(getUserDataPath(), 'analysis_database.json');
    if (_dbCache.has('__legacy__')) {
        return _dbCache.get('__legacy__');
    }
    const adapter = new FileSync(legacyPath);
    const db = low(adapter);
    db.defaults({ analysis_runs: [] }).write();
    _dbCache.set('__legacy__', db);
    return db;
}

/**
 * Eski tek global DB'deki verileri her yazıcının kendi DB'sine taşır.
 * Uygulama ilk açılışında çağrılır, tek seferlik çalışır.
 */
function migrateLegacyDb() {
    const legacyPath = path.join(getUserDataPath(), 'analysis_database.json');
    if (!fs.existsSync(legacyPath)) return;

    try {
        const raw = fs.readFileSync(legacyPath, 'utf8');
        const data = JSON.parse(raw);
        const runs = data.analysis_runs || [];

        if (runs.length === 0) {
            console.log('[DB Migration] Eski DB boş, göç gerekmiyor.');
            return;
        }

        // printerId'ye göre grupla
        const grouped = {};
        runs.forEach(run => {
            const pid = run.printerId || '__unknown__';
            if (!grouped[pid]) grouped[pid] = [];
            grouped[pid].push(run);
        });

        Object.entries(grouped).forEach(([printerId, printerRuns]) => {
            const db = getPrinterDb(printerId);
            const existingFileNames = new Set(db.get('analysis_runs').map(r => r.fileName).value());
            printerRuns.forEach(run => {
                if (!existingFileNames.has(run.fileName)) {
                    db.get('analysis_runs').push(run).write();
                    console.log(`[DB Migration] Taşındı: ${printerId} / ${run.fileName}`);
                }
            });
        });

        // Eski dosyayı yedekle
        const backupPath = legacyPath + '.bak';
        fs.renameSync(legacyPath, backupPath);
        console.log(`[DB Migration] Eski DB yedeklendi: ${backupPath}`);
    } catch (e) {
        console.error('[DB Migration] Hata:', e.message);
    }
}

/**
 * Migration to clear out legacy runs containing truncated errors
 * so they are re-fetched and parsed correctly. Runs only once per printer.
 */
function runUntruncatedErrorsMigration() {
    try {
        const userDataPath = getUserDataPath();
        const printersPath = path.join(userDataPath, 'printers.json');
        if (!fs.existsSync(printersPath)) return;

        const printers = JSON.parse(fs.readFileSync(printersPath, 'utf8'));
        printers.forEach(printer => {
            const db = getPrinterDb(printer.id);
            const done = db.get('untruncated_migration_v5').value();
            if (done) return;

            // 1. Remove all runs starting with 'klippy.log'
            const runs = db.get('analysis_runs').value() || [];
            const newRuns = runs.filter(r => !r.fileName.startsWith('klippy.log'));
            db.set('analysis_runs', newRuns).write();

            // 2. Reset analysis_state.json for this printer to clear cache sizes
            if (printer.logFolderPath && printer.name) {
                const safeName = printer.name.replace(/[^a-z0-9_\-\s]/gi, '_').trim();
                const folder = path.join(printer.logFolderPath, safeName);
                const statePath = path.join(folder, 'analysis_state.json');
                if (fs.existsSync(statePath)) {
                    try {
                        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                        if (state.files) {
                            Object.keys(state.files).forEach(k => {
                                if (k.startsWith('klippy.log')) {
                                    delete state.files[k];
                                }
                            });
                        }
                        if (state.parserStates) {
                            Object.keys(state.parserStates).forEach(k => {
                                if (k.startsWith('klippy.log')) {
                                    delete state.parserStates[k];
                                }
                            });
                        }
                        if (state.rolloverDates) {
                            Object.keys(state.rolloverDates).forEach(k => {
                                if (k.startsWith('klippy.log')) {
                                    delete state.rolloverDates[k];
                                }
                            });
                        }
                        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
                    } catch (e) {
                        try {
                            fs.unlinkSync(statePath);
                        } catch (err) {}
                    }
                }
            }

            db.set('untruncated_migration_v5', true).write();
            console.log(`[Migration] Cleaned up truncated klippy log runs for printer: ${printer.name}`);
        });
    } catch (err) {
        console.error('[Migration] Error running untruncated errors migration:', err.message);
    }
}

/**
 * Migration to clear out legacy runs for printer logs to trigger clean re-fetch and parsing
 * in the new C2P Print Event format.
 */
function runC2pParserMigration() {
    try {
        const userDataPath = getUserDataPath();
        const printersPath = path.join(userDataPath, 'printers.json');
        if (!fs.existsSync(printersPath)) return;

        const printers = JSON.parse(fs.readFileSync(printersPath, 'utf8'));
        printers.forEach(printer => {
            const db = getPrinterDb(printer.id);
            const done = db.get('c2p_migration_v2').value();
            if (done) return;

            // 1. Remove all runs starting with 'klippy.log'
            const runs = db.get('analysis_runs').value() || [];
            const newRuns = runs.filter(r => !r.fileName.startsWith('klippy.log'));
            db.set('analysis_runs', newRuns).write();

            // 2. Reset analysis_state.json for this printer to clear cache sizes
            if (printer.logFolderPath && printer.name) {
                const safeName = printer.name.replace(/[^a-z0-9_\-\s]/gi, '_').trim();
                const folder = path.join(printer.logFolderPath, safeName);
                const statePath = path.join(folder, 'analysis_state.json');
                if (fs.existsSync(statePath)) {
                    try {
                        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
                        if (state.files) {
                            Object.keys(state.files).forEach(k => {
                                if (k.startsWith('klippy.log')) {
                                    delete state.files[k];
                                }
                            });
                        }
                        if (state.parserStates) {
                            Object.keys(state.parserStates).forEach(k => {
                                if (k.startsWith('klippy.log')) {
                                    delete state.parserStates[k];
                                }
                            });
                        }
                        if (state.rolloverDates) {
                            Object.keys(state.rolloverDates).forEach(k => {
                                if (k.startsWith('klippy.log')) {
                                    delete state.rolloverDates[k];
                                }
                            });
                        }
                        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
                    } catch (e) {
                        try {
                            fs.unlinkSync(statePath);
                        } catch (err) {}
                    }
                }
            }

            db.set('c2p_migration_v2', true).write();
            console.log(`[Migration] Cleaned up old runs for C2P log transition v2: ${printer.name}`);
        });
    } catch (err) {
        console.error('[Migration] Error running C2P parser migration:', err.message);
    }
}

/**
 * Migration to completely remove printer_logs.txt runs from all printer databases.
 */
function removePrinterLogsMigration() {
    try {
        const userDataPath = getUserDataPath();
        const printersPath = path.join(userDataPath, 'printers.json');
        if (!fs.existsSync(printersPath)) return;

        const printers = JSON.parse(fs.readFileSync(printersPath, 'utf8'));
        printers.forEach(printer => {
            const db = getPrinterDb(printer.id);
            const runs = db.get('analysis_runs').value() || [];
            const filteredRuns = runs.filter(r => r.fileName !== 'printer_logs.txt');
            db.set('analysis_runs', filteredRuns).write();
            console.log(`[Migration] Removed printer_logs.txt from DB for printer: ${printer.name}`);
        });
    } catch (err) {
        console.error('[Migration] Error removing printer_logs.txt from DB:', err.message);
    }
}

module.exports = {
    getPrinterDb,
    getDb,
    migrateLegacyDb,
    runUntruncatedErrorsMigration,
    runC2pParserMigration,
    removePrinterLogsMigration
};
