const fs = require('fs');
const path = require('path');

/**
 * Parses a date string like "Sun Jun 14 10:00:00 2026"
 */
function parseRolloverDate(dateStr) {
    const months = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    try {
        const parts = dateStr.trim().split(/\s+/);
        if (parts.length < 5) return new Date();
        const monthName = parts[1];
        const day = parseInt(parts[2], 10);
        const timeParts = parts[3].split(':');
        const year = parseInt(parts[4], 10);

        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        const seconds = parseInt(timeParts[2], 10);

        const month = months[monthName] !== undefined ? months[monthName] : new Date().getMonth();
        return new Date(year, month, day, hours, minutes, seconds);
    } catch (e) {
        return new Date();
    }
}

function formatDate(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const d = pad(date.getDate());
    const m = pad(date.getMonth() + 1);
    const y = date.getFullYear();
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${d}.${m}.${y} ${h}:${min}:${s}`;
}

function formatTime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${h}:${min}:${s}`;
}

function addSeconds(date, seconds) {
    return new Date(date.getTime() + seconds * 1000);
}

/**
 * Runs the exact Klipper log parsing algorithm translated from Python
 */
function parseKlippyLogContent(logContent, printerId = "edist_toolchanger_01", passedStartDt = null) {
    const logLines = logContent.split('\n');
    
    // Find rollover date
    let startDt = passedStartDt;
    if (!startDt) {
        for (const line of logLines) {
            if (line.includes('Log rollover at')) {
                try {
                    const dateStr = line.split('Log rollover at').pop().split('=')[0].trim();
                    startDt = parseRolloverDate(dateStr);
                    break;
                } catch (e) {
                    // Ignore
                }
            }
        }
    }
    
    if (!startDt) {
        startDt = new Date();
    }
    
    let running = false;
    let pText = '';
    let statsStarted = false;
    let currentStartTimestamp = '';
    let currentStartSec = 0.0;
    let currentPrintId = '';
    let lastOpenedFilename = '';
    
    const targetSensors = ['extruder', 'extruder1', 'extruder2', 'extruder3', 'heater_bed', 'heater_env', 'EBBCan', 'EBBCan1', 'EBBCan3'];
    
    const printStats = { Success: 0, Cancelled: 0, Errors: 0 };
    const uniqueErrorsMap = {};
    const baskiRaporuLines = [];
    const outgoingEvents = [];
    
    let lastStatsSec = 0.0;
    
    for (let idx = 0; idx < logLines.length; idx++) {
        const line = logLines[idx];
        const lineStrip = line.trim();
        const lineLower = lineStrip.toLowerCase();
        
        if (!lineStrip) continue;

        if (lineStrip.includes('virtual_sdcard: filename=')) {
            try {
                const parts = lineStrip.split('virtual_sdcard: filename=');
                if (parts.length > 1) {
                    const filenameVal = parts[1].split(',')[0].trim();
                    lastOpenedFilename = filenameVal;
                }
            } catch (e) {}
        }
        
        let exactTimestamp = '';
        let currentTimeStr = '';
        
        // Time matching
        const timeMatch = lineStrip.match(/^(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch) {
            currentTimeStr = timeMatch[0];
            const datePrefix = formatDate(startDt).split(' ')[0];
            exactTimestamp = `${datePrefix} ${currentTimeStr}`;
        } else {
            const secMatch = lineLower.match(/(?:received|stats)\s+([\d.]+):/);
            if (secMatch) {
                lastStatsSec = parseFloat(secMatch[1]);
                const calculatedDate = addSeconds(startDt, lastStatsSec);
                exactTimestamp = formatDate(calculatedDate);
                currentTimeStr = formatTime(calculatedDate);
            } else {
                exactTimestamp = formatDate(startDt);
                currentTimeStr = "Sistem";
            }
        }
        
        if (lineLower.includes('stats ')) {
            statsStarted = true;
            const statsMatch = line.match(/stats\s+([\d.]+):/i);
            if (statsMatch) {
                lastStatsSec = parseFloat(statsMatch[1]);
            }
            if (running) {
                pText += line + '\n';
            }
        }
        
        // ========================================================
        // ❌ SENARYO A: SOYUTLANMIŞ DİNAMİK HATA KONTROLÜ
        // ========================================================
        const hasErrorKeyword = lineStrip.includes('||') || lineLower.includes('emergency stop') || lineLower.includes('transition to shutdown');
        
        if (hasErrorKeyword) {
            if (lineLower.includes('gcode_macro') || lineLower.includes('variable_') || lineLower.includes('gcode =')) {
                continue;
            }
            
            let cleanErrorLine = lineStrip;
            if (lineLower.includes('transition to shutdown state:')) {
                cleanErrorLine = lineStrip.split(/transition to shutdown state:/i).pop().trim();
            }
            // Strip leading time prefix (e.g. "10:03:00 ")
            const timePrefixMatch = cleanErrorLine.match(/^\d{2}:\d{2}:\d{2}\s+/);
            if (timePrefixMatch) {
                cleanErrorLine = cleanErrorLine.substring(timePrefixMatch[0].length);
            }
            
            const errorParts = cleanErrorLine.split('||');
            let errorType = "";
            let errorTitle = "";
            let errorDesc = "";
            
            if (errorParts.length >= 3) {
                errorType = errorParts[0].trim();
                errorTitle = errorParts[1].trim();
                errorDesc = errorParts[2].trim();
            } else {
                errorType = "COMM_1009";
                errorTitle = "Emergency Stop (M112)";
                errorDesc = cleanErrorLine;
            }
            
            printStats.Errors++;
            uniqueErrorsMap[errorType] = {
                time: currentTimeStr,
                type: errorType,
                title: errorTitle,
                desc: errorDesc
            };
            
            outgoingEvents.push({
                eventType: "ERROR_REPORT",
                payload: {
                    printer_id: printerId,
                    event: "ERROR_REPORT",
                    timestamp: exactTimestamp,
                    data: {
                        print_id: running ? currentPrintId : "Yazici_Bostayken_Hata",
                        error_code: errorType,
                        error_summary: errorTitle,
                        error_description: errorDesc,
                        status: "Shutdown"
                    }
                }
            });
            
            if (running) {
                const calculatedDate = addSeconds(startDt, lastStatsSec);
                const eventTime = formatDate(calculatedDate);
                
                const peaks = {};
                const printLines = pText.trim() ? pText.split('\n') : logLines;
                for (const s of targetSensors) {
                    const r1 = new RegExp(s + ':\\s+[^:\\n]*temp=([\\d.-]+)');
                    const r2 = new RegExp(s + ':\\s+target=[\\d.]+\\s+temp=([\\d.-]+)');
                    const temps = [];
                    for (const l of printLines) {
                        if (l.includes(s)) {
                            if (l.includes('temp=')) {
                                const tMatch = r1.exec(l);
                                if (tMatch) {
                                    const val = parseFloat(tMatch[1]);
                                    if (!isNaN(val)) temps.push(val);
                                }
                            }
                            if (l.includes('target=')) {
                                const tMatch = r2.exec(l);
                                if (tMatch) {
                                    const val = parseFloat(tMatch[1]);
                                    if (!isNaN(val)) temps.push(val);
                                }
                            }
                        }
                    }
                    if (temps.length > 0) {
                        const maxVal = temps.reduce((max, val) => val > max ? val : max, temps[0]);
                        peaks[s] = parseFloat(maxVal.toFixed(1));
                    }
                }
                
                const durationSec = currentStartSec > 0 ? (lastStatsSec - currentStartSec) : 0;
                const durationMin = currentStartSec > 0 ? Math.max(0, Math.round(durationSec / 60)) : '?';
                
                const peaksStr = Object.entries(peaks)
                    .map(([sensor, temp]) => `${sensor}: ${temp}°C`)
                    .join(', ');

                baskiRaporuLines.push(`❌ Baskı İptal (Hata: ${errorTitle}) - Süre: ${durationMin} dk - Peak Sıcaklıklar: [${peaksStr || 'Yok'}] : ${eventTime}`);
            }
            running = false;
            continue;
        }
        
        if (statsStarted && (line.includes('START_PRINT') || line.includes('START PRINT')) && !running) {
            running = true;
            pText = '';
            currentPrintId = `baski_${idx}`;
            currentStartTimestamp = exactTimestamp;
            currentStartSec = lastStatsSec;
            
            const calculatedDate = addSeconds(startDt, lastStatsSec);
            const eventTime = formatDate(calculatedDate);
            
            const lastLine = baskiRaporuLines[baskiRaporuLines.length - 1];
            if (!lastLine || !lastLine.includes(eventTime)) {
                if (lastOpenedFilename) {
                    baskiRaporuLines.push(`🚀 Baskı Başladı (${lastOpenedFilename}) : ${eventTime}`);
                } else {
                    baskiRaporuLines.push(`🚀 Baskı Başladı : ${eventTime}`);
                }
            }
            continue;
        }
        
        // ========================================================
        // ✅ SENARYO C: BASKI BİTİŞİ VEYA KULLANICI İPTALİ
        // ========================================================
        if ((running || statsStarted) && (line.includes('Finished SD card print') || line.includes('END_PRINT') || line.includes('END PRINT') || line.includes('CANCEL_PRINT') || line.includes('CANCEL PRINT'))) {
            running = false;
            const status = (line.includes('CANCEL') || line.includes('Cancel')) ? 'Cancelled' : 'Success';
            
            const calculatedDate = addSeconds(startDt, lastStatsSec);
            const eventTime = formatDate(calculatedDate);
            
            if (currentStartTimestamp === exactTimestamp) {
                continue;
            }
            
            printStats[status]++;
            const cancelReason = "Kullanıcı Manuel İptal Etti";
            
            const peaks = {};
            const printLines = pText.trim() ? pText.split('\n') : logLines;
            for (const s of targetSensors) {
                const r1 = new RegExp(s + ':\\s+[^:\\n]*temp=([\\d.-]+)');
                const r2 = new RegExp(s + ':\\s+target=[\\d.]+\\s+temp=([\\d.-]+)');
                const temps = [];
                for (const l of printLines) {
                    if (l.includes(s)) {
                        if (l.includes('temp=')) {
                            const tMatch = r1.exec(l);
                            if (tMatch) {
                                const val = parseFloat(tMatch[1]);
                                if (!isNaN(val)) temps.push(val);
                            }
                        }
                        if (l.includes('target=')) {
                            const tMatch = r2.exec(l);
                            if (tMatch) {
                                const val = parseFloat(tMatch[1]);
                                if (!isNaN(val)) temps.push(val);
                            }
                        }
                    }
                }
                if (temps.length > 0) {
                    const maxVal = temps.reduce((max, val) => val > max ? val : max, temps[0]);
                    peaks[s] = parseFloat(maxVal.toFixed(1));
                }
            }
            
            const durationSec = currentStartSec > 0 ? (lastStatsSec - currentStartSec) : 0;
            const durationMin = currentStartSec > 0 ? Math.max(0, Math.round(durationSec / 60)) : '?';
            
            const peaksStr = Object.entries(peaks)
                .map(([sensor, temp]) => `${sensor}: ${temp}°C`)
                .join(', ');
            
            const statusText = status === 'Success' ? 'Bitti' : 'İptal Edildi';
            const icon = status === 'Success' ? '✅' : '❌';
            const filenameText = lastOpenedFilename ? ` (${lastOpenedFilename})` : '';
            
            baskiRaporuLines.push(`${icon} Baskı ${statusText}${filenameText} - Süre: ${durationMin} dk - Peak Sıcaklıklar: [${peaksStr || 'Yok'}] : ${eventTime}`);
            
            // Add start event first to follow Python order
            outgoingEvents.push({
                eventType: "PRINT_START",
                payload: {
                    printer_id: printerId,
                    event: "PRINT_START",
                    timestamp: currentStartTimestamp,
                    data: { print_id: currentPrintId, status: "Printing" }
                }
            });
            
            // Add end event
            outgoingEvents.push({
                eventType: "PRINT_END",
                payload: {
                    printer_id: printerId,
                    event: "PRINT_END",
                    timestamp: exactTimestamp,
                    data: {
                        print_id: currentPrintId,
                        status: status,
                        start_time: currentStartTimestamp,
                        end_time: exactTimestamp,
                        cancel_reason: status === 'Cancelled' ? cancelReason : "N/A",
                        temperature_peaks: peaks
                    }
                }
            });
        }
    }
    
    const detectedErrorsList = Object.values(uniqueErrorsMap);
    
    // Create formatted analysis report content
    let report = "";
    
    // Outgoing Events Server log representation
    if (outgoingEvents.length > 0) {
        outgoingEvents.forEach(evt => {
            report += `\n📡 [SERVER LOG] OUTGOING EVENT: ${evt.eventType}\n`;
            report += `------------------------------------------------------------\n`;
            report += JSON.stringify(evt.payload, null, 2) + `\n`;
            report += `------------------------------------------------------------\n`;
        });
    }
    
    report += `\n============================================================\n`;
    report += `=== MAKERDASHBOARD GERÇEK BASKI RAPORU ===\n`;
    report += `Log Başlangıcı: ${formatDate(startDt)}\n`;
    if (baskiRaporuLines.length > 0) {
        baskiRaporuLines.slice().reverse().forEach(line => {
            report += line + '\n';
        });
    } else {
        report += `Log periyodunda gerçek zamanlı bir baskı hareketi gerçekleşmedi.\n`;
    }
    report += `============================================================\n`;
    
    // Max Temperatures Report
    const detectedSensors = new Set();
    const sensorRegex1 = /([\w_]+):\s+[^:\n]*temp=/g;
    const sensorRegex2 = /([\w_]+):\s+target=/g;
    
    for (const l of logLines) {
        if (l.includes('temp=')) {
            let match;
            sensorRegex1.lastIndex = 0;
            while ((match = sensorRegex1.exec(l)) !== null) {
                detectedSensors.add(match[1]);
            }
        }
        if (l.includes('target=')) {
            let match;
            sensorRegex2.lastIndex = 0;
            while ((match = sensorRegex2.exec(l)) !== null) {
                detectedSensors.add(match[1]);
            }
        }
    }
    
    const sortedSensors = Array.from(detectedSensors).sort();
    
    report += `\n=== BASKI ESNASINDA ÖLÇÜLEN MAKSIMUM GERÇEK SICAKLIKLAR ===\n`;
    sortedSensors.forEach(s => {
        if (s.toLowerCase() === 'stats') return;
        const r1 = new RegExp(s + ':\\s+[^:\\n]*temp=([\\d.-]+)');
        const r2 = new RegExp(s + ':\\s+target=\\d+\\s+temp=([\\d.-]+)');
        
        const tempValues = [];
        for (const l of logLines) {
            if (l.includes(s)) {
                if (l.includes('temp=')) {
                    const tMatch = r1.exec(l);
                    if (tMatch) {
                        const val = parseFloat(tMatch[1]);
                        if (!isNaN(val)) tempValues.push(val);
                    }
                }
                if (l.includes('target=')) {
                    const tMatch = r2.exec(l);
                    if (tMatch) {
                        const val = parseFloat(tMatch[1]);
                        if (!isNaN(val)) tempValues.push(val);
                    }
                }
            }
        }
        const maxTemp = tempValues.length > 0 ? tempValues.reduce((max, val) => val > max ? val : max, tempValues[0]) : 0.0;
        report += `${s}: ${maxTemp.toFixed(1)} °C\n`;
    });
    report += `============================================================\n`;
    
    // Errors table report
    report += `\n===================================================================================================================\n`;
    report += `              📊 MAKERDASHBOARD GERÇEK ZAMANLI SENKRONİZE MAP TABLOSU               \n`;
    report += `===================================================================================================================\n`;
    report += `\n[GENEL ÖZET] Gerçek Başarılı: ${printStats.Success} | Gerçek İptal: ${printStats.Cancelled} | Yakalanan Hatalar: ${printStats.Errors}\n`;
    report += `\n[YAKALANAN TÜM KRİTİK HATALARIN LİSTESİ]\n`;
    
    if (detectedErrorsList.length > 0) {
        report += `+----------+---------------+---------------------------+--------------------------------------------------------+\n`;
        report += `| Saat     | Hata Kodu     | Hata Başlığı              | Ayıklanan Açıklama                                     |\n`;
        report += `+----------+---------------+---------------------------+--------------------------------------------------------+\n`;
        detectedErrorsList.forEach(err => {
            const shortDesc = err.desc.length <= 52 ? err.desc : err.desc.substring(0, 50) + "...";
            const paddedTime = err.time.padEnd(8);
            const paddedType = err.type.padEnd(13);
            const paddedTitle = err.title.padEnd(25);
            const paddedDesc = shortDesc.padEnd(54);
            report += `| ${paddedTime} | ${paddedType} | ${paddedTitle} | ${paddedDesc} |\n`;
        });
        report += `+----------+---------------+---------------------------+--------------------------------------------------------+\n`;
    } else {
        report += `+-----------------------------------------------------------------------------------------------------------------------+\n`;
        report += `| Şu an aktif log dosyasında eşleşen dinamik bir hata kaydı bulunmuyor.                                                 |\n`;
        report += `+-----------------------------------------------------------------------------------------------------------------------+\n`;
    }
    report += `===================================================================================================================\n`;
    
    return {
        printStats,
        errorCount: printStats.Errors,
        reportContent: report
    };
}

/**
 * Connects to the LAN host, lists the log files, matches them,
 * retrieves/caches them, runs the parser, and writes the reports locally.
 */
async function syncAndAnalyzePrinterLogs(printer) {
    if (printer.mode !== 'lan' || !printer.logFolderPath || !printer.address) {
        throw new Error("Yazıcı LAN modunda değil veya gerekli ayarlar eksik.");
    }

    const safeName = printer.name.replace(/[^a-z0-9_\-\s]/gi, '_').trim();
    const printerFolder = path.join(printer.logFolderPath, safeName);
    if (!fs.existsSync(printerFolder)) {
        fs.mkdirSync(printerFolder, { recursive: true });
    }

    let host = printer.address;
    if (!host.includes(':') && !host.toLowerCase().startsWith('com') && !host.toLowerCase().startsWith('/dev/')) {
        host = `${host}:7125`;
    }

    // Load state
    const statePath = path.join(printerFolder, 'analysis_state.json');
    let state = { files: {} };
    if (fs.existsSync(statePath)) {
        try {
            state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            if (!state.files) state.files = {};
        } catch (e) {
            console.error("[Log Analyzer] State parsing error, resetting state:", e);
        }
    }

    // 1. Fetch file list using directory endpoint
    const listUrl = `http://${host}/server/files/directory?path=logs`;
    let listResponse;
    try {
        listResponse = await fetch(listUrl);
    } catch (netErr) {
        throw new Error(`Yazıcıya bağlanılamadı (IP: ${host}). Cihazın açık ve ağa bağlı olduğundan emin olun. (Detay: ${netErr.message})`);
    }
    if (!listResponse.ok) {
        throw new Error(`Log listesi alınamadı (HTTP ${listResponse.status})`);
    }

    const listData = await listResponse.json();
    const files = (listData.result && listData.result.files) ? listData.result.files : [];
    const klippyLogFiles = files.filter(f => f.filename && (f.filename.startsWith('klippy.log') || f.filename.includes('klippy.log')));

    console.log(`[Log Analyzer] Found ${klippyLogFiles.length} log files on host.`);
    
    let processedCount = 0;
    let totalErrorsDetected = 0;

    const analysisFilePath = path.join(printerFolder, 'printer_analysis.txt');
    let reportContentAtStart = "";
    if (fs.existsSync(analysisFilePath)) {
        try {
            reportContentAtStart = fs.readFileSync(analysisFilePath, 'utf8');
        } catch (e) {
            console.error("[Log Analyzer] Error reading report file:", e);
        }
    }

    for (const fileInfo of klippyLogFiles) {
        const fileName = fileInfo.filename;
        const fileSize = fileInfo.size;
        const isActiveLog = fileName === 'klippy.log';

        let lastProcessedSize = state.files[fileName] || 0;

        // Rollover detection: if active log size decreased, it was reset
        if (isActiveLog && fileSize < lastProcessedSize) {
            console.log(`[Log Analyzer] Rollover detected on active log (size decreased from ${lastProcessedSize} to ${fileSize}).`);
            lastProcessedSize = 0;
        }

        const runHeaderMarker = `📊 LOG KAYITLARI SENKRONİZASYON VE ANALİZİ - DOSYA: ${fileName}`;
        const hasBeenProcessedInReport = reportContentAtStart.includes(runHeaderMarker);

        // If size matches and report contains the file analysis, skip it
        if (fileSize === lastProcessedSize && hasBeenProcessedInReport) {
            console.log(`[Log Analyzer] Skipping cached file ${fileName} - size unchanged (${fileSize} bytes) and already processed in report.`);
            continue;
        }

        // Retrieve log contents from Moonraker logs endpoint
        const downloadUrl = `http://${host}/server/files/logs/${encodeURIComponent(fileName)}`;
        console.log(`[Log Analyzer] Retrieving: ${downloadUrl}`);
        let downloadRes;
        try {
            downloadRes = await fetch(downloadUrl);
        } catch (netErr) {
            console.warn(`[Log Analyzer] Failed to download ${fileName}: ${netErr.message}`);
            continue;
        }
        if (!downloadRes.ok) {
            console.warn(`[Log Analyzer] Failed to download ${fileName}: Status ${downloadRes.status} ${downloadRes.statusText}`);
            continue;
        }

        const logContent = await downloadRes.text();
        
        // Extract new content from lastProcessedSize
        let newContent = logContent;
        if (isActiveLog && lastProcessedSize > 0) {
            newContent = logContent.substring(lastProcessedSize);
            // Align to newline to avoid partial line fragments
            const firstNewline = newContent.indexOf('\n');
            if (firstNewline !== -1) {
                newContent = newContent.substring(firstNewline + 1);
            } else {
                newContent = ""; // No new complete lines
            }
        }

        if (newContent.trim().length === 0) {
            // No new contents to analyze, just update state size
            state.files[fileName] = fileSize;
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
            continue;
        }

        // Find rollover date from the entire log file (since incremental slice might lack it)
        let fileStartDt = null;
        const scanLines = logContent.split('\n');
        for (const line of scanLines) {
            if (line.includes('Log rollover at')) {
                try {
                    const dateStr = line.split('Log rollover at').pop().split('=')[0].trim();
                    fileStartDt = parseRolloverDate(dateStr);
                    break;
                } catch (e) {
                    // Ignore
                }
            }
        }

        // Analyze new content
        const analysisResult = parseKlippyLogContent(newContent, printer.id, fileStartDt);
        
        // Separate each analysis run in the single file with date headers
        const runHeader = `\n===================================================================================================================\n` +
                          `📊 LOG KAYITLARI SENKRONİZASYON VE ANALİZİ - DOSYA: ${fileName}\n` +
                          `===================================================================================================================\n`;
        
        fs.appendFileSync(analysisFilePath, runHeader + analysisResult.reportContent, 'utf8');
        
        // Update state
        state.files[fileName] = fileSize;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
        
        totalErrorsDetected += analysisResult.errorCount;
        processedCount++;
    }

    // Also analyze local printer_logs.txt if it exists
    const localLogsPath = path.join(printerFolder, 'printer_logs.txt');
    if (fs.existsSync(localLogsPath)) {
        const fileStats = fs.statSync(localLogsPath);
        const fileSize = fileStats.size;
        const lastProcessedSize = state.files['printer_logs.txt'] || 0;
        
        const runHeaderMarker = `📊 LOG KAYITLARI SENKRONİZASYON VE ANALİZİ - DOSYA: printer_logs.txt`;
        const hasBeenProcessedInReport = reportContentAtStart.includes(runHeaderMarker);

        if (fileSize !== lastProcessedSize || !hasBeenProcessedInReport) {
            try {
                const logContent = fs.readFileSync(localLogsPath, 'utf8');
                const analysisResult = parsePrinterLogsTxt(logContent);
                
                const runHeader = `\n===================================================================================================================\n` +
                                  `📊 LOG KAYITLARI SENKRONİZASYON VE ANALİZİ - DOSYA: printer_logs.txt\n` +
                                  `===================================================================================================================\n`;
                
                // For local logs, if they change, we append or overwrite. Since it's local log, let's append.
                fs.appendFileSync(analysisFilePath, runHeader + analysisResult.reportContent, 'utf8');
                state.files['printer_logs.txt'] = fileSize;
                fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
                totalErrorsDetected += analysisResult.errorCount;
                processedCount++;
            } catch (err) {
                console.error("[Log Analyzer] Error processing printer_logs.txt:", err);
            }
        }
    }

    return {
        success: true,
        processedCount,
        totalErrorsDetected
    };
}

function parsePrinterLogsTxt(content) {
    const lines = content.split('\n');
    const baskiRaporuLines = [];
    const printStats = { Success: 0, Cancelled: 0, Errors: 0 };
    const uniqueErrorsMap = {};
    
    const maxTemps = {
        extruder: 0,
        extruder1: 0,
        extruder2: 0,
        extruder3: 0,
        heater_bed: 0,
        env: 0
    };
    
    let currentPrintStart = null;
    let currentPrintFile = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const timeMatch = line.match(/^\[([^\]]+)\]/);
        const timestamp = timeMatch ? timeMatch[1] : '';

        if (line.includes('[PROGRESS]')) {
            const t0Match = line.match(/T0:\s*(\d+)°C/);
            if (t0Match) maxTemps.extruder = Math.max(maxTemps.extruder, parseFloat(t0Match[1]));

            const t1Match = line.match(/T1:\s*(\d+)°C/);
            if (t1Match) maxTemps.extruder1 = Math.max(maxTemps.extruder1, parseFloat(t1Match[1]));

            const t2Match = line.match(/T2:\s*(\d+)°C/);
            if (t2Match) maxTemps.extruder2 = Math.max(maxTemps.extruder2, parseFloat(t2Match[1]));

            const t3Match = line.match(/T3:\s*(\d+)°C/);
            if (t3Match) maxTemps.extruder3 = Math.max(maxTemps.extruder3, parseFloat(t3Match[1]));

            const envMatch = line.match(/Env:\s*(\d+)°C/);
            if (envMatch) maxTemps.env = Math.max(maxTemps.env, parseFloat(envMatch[1]));

            const bedMatch = line.match(/Bed:\s*(\d+)°C/);
            if (bedMatch) maxTemps.heater_bed = Math.max(maxTemps.heater_bed, parseFloat(bedMatch[1]));
            
            if (baskiRaporuLines.length > 0 && baskiRaporuLines[baskiRaporuLines.length - 1].includes('[PROGRESS]')) {
                baskiRaporuLines[baskiRaporuLines.length - 1] = line;
            } else {
                baskiRaporuLines.push(line);
            }

            if (!currentPrintStart && timestamp) {
                currentPrintStart = timestamp;
            }
        }

        if (line.includes('Baskı Başladı')) {
            const fileMatch = line.match(/Dosya:\s*(.+)$/i);
            currentPrintFile = fileMatch ? fileMatch[1].trim() : '';
            currentPrintStart = timestamp;
            
            baskiRaporuLines.push(`🚀 Baskı Başladı (${currentPrintFile}) : ${timestamp}`);
        }

        if (line.includes('Baskı Tamamlandı')) {
            printStats.Success++;
            const fileMatch = line.match(/Dosya:\s*(.+)$/i);
            const file = fileMatch ? fileMatch[1].trim() : currentPrintFile;
            
            let durationStr = '';
            if (currentPrintStart && timestamp) {
                try {
                    const parts1 = currentPrintStart.split(' ');
                    const parts2 = timestamp.split(' ');
                    if (parts1.length === 2 && parts2.length === 2) {
                        const [d1, m1, y1] = parts1[0].split('.').map(Number);
                        const [h1, min1, s1] = parts1[1].split(':').map(Number);
                        const [d2, m2, y2] = parts2[0].split('.').map(Number);
                        const [h2, min2, s2] = parts2[1].split(':').map(Number);
                        const date1 = new Date(y1, m1 - 1, d1, h1, min1, s1);
                        const date2 = new Date(y2, m2 - 1, d2, h2, min2, s2);
                        const diffMin = Math.round((date2 - date1) / 60000);
                        if (diffMin >= 0) durationStr = ` - Süre: ${diffMin} dk`;
                    }
                } catch(e){}
            }
            
            let peakStrList = [];
            if (maxTemps.extruder > 0) peakStrList.push(`extruder: ${maxTemps.extruder}°C`);
            if (maxTemps.extruder1 > 0) peakStrList.push(`extruder1: ${maxTemps.extruder1}°C`);
            if (maxTemps.extruder2 > 0) peakStrList.push(`extruder2: ${maxTemps.extruder2}°C`);
            if (maxTemps.extruder3 > 0) peakStrList.push(`extruder3: ${maxTemps.extruder3}°C`);
            if (maxTemps.heater_bed > 0) peakStrList.push(`heater_bed: ${maxTemps.heater_bed}°C`);
            if (maxTemps.env > 0) peakStrList.push(`env: ${maxTemps.env}°C`);
            const peakStr = peakStrList.length > 0 ? peakStrList.join(', ') : 'Yok';

            baskiRaporuLines.push(`✅ Baskı Bitti (${file})${durationStr} - Peak Sıcaklıklar: [${peakStr}] : ${timestamp}`);
            currentPrintStart = null;
            Object.keys(maxTemps).forEach(k => maxTemps[k] = 0);
        }

        if (line.includes('Baskı İptal Edildi')) {
            printStats.Cancelled++;
            const fileMatch = line.match(/Dosya:\s*([^\(]+)/i);
            const file = fileMatch ? fileMatch[1].trim() : currentPrintFile;
            
            let durationStr = '';
            if (currentPrintStart && timestamp) {
                try {
                    const parts1 = currentPrintStart.split(' ');
                    const parts2 = timestamp.split(' ');
                    if (parts1.length === 2 && parts2.length === 2) {
                        const [d1, m1, y1] = parts1[0].split('.').map(Number);
                        const [h1, min1, s1] = parts1[1].split(':').map(Number);
                        const [d2, m2, y2] = parts2[0].split('.').map(Number);
                        const [h2, min2, s2] = parts2[1].split(':').map(Number);
                        const date1 = new Date(y1, m1 - 1, d1, h1, min1, s1);
                        const date2 = new Date(y2, m2 - 1, d2, h2, min2, s2);
                        const diffMin = Math.round((date2 - date1) / 60000);
                        if (diffMin >= 0) durationStr = ` - Süre: ${diffMin} dk`;
                    }
                } catch(e){}
            }

            let peakStrList = [];
            if (maxTemps.extruder > 0) peakStrList.push(`extruder: ${maxTemps.extruder}°C`);
            if (maxTemps.extruder1 > 0) peakStrList.push(`extruder1: ${maxTemps.extruder1}°C`);
            if (maxTemps.extruder2 > 0) peakStrList.push(`extruder2: ${maxTemps.extruder2}°C`);
            if (maxTemps.extruder3 > 0) peakStrList.push(`extruder3: ${maxTemps.extruder3}°C`);
            if (maxTemps.heater_bed > 0) peakStrList.push(`heater_bed: ${maxTemps.heater_bed}°C`);
            if (maxTemps.env > 0) peakStrList.push(`env: ${maxTemps.env}°C`);
            const peakStr = peakStrList.length > 0 ? peakStrList.join(', ') : 'Yok';

            let progStr = '';
            if (baskiRaporuLines.length > 0 && baskiRaporuLines[baskiRaporuLines.length - 1].includes('%')) {
                const progMatch = baskiRaporuLines[baskiRaporuLines.length - 1].match(/%(\d+)/);
                if (progMatch) {
                    progStr = ` [%${progMatch[1]} İptal]`;
                }
            }

            baskiRaporuLines.push(`❌ Baskı İptal (${file})${progStr}${durationStr} - Peak Sıcaklıklar: [${peakStr}] : ${timestamp}`);
            currentPrintStart = null;
            Object.keys(maxTemps).forEach(k => maxTemps[k] = 0);
        }

        if (line.includes('[ERROR]')) {
            printStats.Errors++;
            const errDesc = line.split('[ERROR]').pop().trim();
            uniqueErrorsMap[errDesc] = {
                time: timestamp,
                type: "DASHBOARD_ERR",
                title: "Dashboard Hata Kaydı",
                desc: errDesc
            };
        }
    }

    let report = "";
    report += `\n============================================================\n`;
    report += `=== MAKERDASHBOARD GERÇEK BASKI RAPORU ===\n`;
    report += `Log Başlangıcı: -\n`;
    if (baskiRaporuLines.length > 0) {
        baskiRaporuLines.slice().reverse().forEach(line => {
            report += line + '\n';
        });
    } else {
        report += `Log periyodunda gerçek zamanlı bir baskı hareketi gerçekleşmedi.\n`;
    }
    report += `============================================================\n`;

    report += `\n=== BASKI ESNASINDA ÖLÇÜLEN MAKSIMUM GERÇEK SICAKLIKLAR ===\n`;
    if (maxTemps.extruder > 0) report += `extruder: ${maxTemps.extruder.toFixed(1)} °C\n`;
    if (maxTemps.extruder1 > 0) report += `extruder1: ${maxTemps.extruder1.toFixed(1)} °C\n`;
    if (maxTemps.extruder2 > 0) report += `extruder2: ${maxTemps.extruder2.toFixed(1)} °C\n`;
    if (maxTemps.extruder3 > 0) report += `extruder3: ${maxTemps.extruder3.toFixed(1)} °C\n`;
    if (maxTemps.heater_bed > 0) report += `heater_bed: ${maxTemps.heater_bed.toFixed(1)} °C\n`;
    report += `============================================================\n`;

    report += `\n===================================================================================================================\n`;
    report += `              📊 MAKERDASHBOARD GERÇEK ZAMANLI SENKRONİZE MAP TABLOSU               \n`;
    report += `===================================================================================================================\n`;
    report += `\n[GENEL ÖZET] Gerçek Başarılı: ${printStats.Success} | Gerçek İptal: ${printStats.Cancelled} | Yakalanan Hatalar: ${printStats.Errors}\n`;
    report += `\n[YAKALANAN TÜM KRİTİK HATALARIN LİSTESİ]\n`;
    
    const errorsList = Object.values(uniqueErrorsMap);
    if (errorsList.length > 0) {
        report += `+----------+---------------+---------------------------+--------------------------------------------------------+\n`;
        report += `| Saat     | Hata Kodu     | Hata Başlığı              | Ayıklanan Açıklama                                     |\n`;
        report += `+----------+---------------+---------------------------+--------------------------------------------------------+\n`;
        errorsList.forEach(err => {
            const shortDesc = err.desc.length <= 52 ? err.desc : err.desc.substring(0, 50) + "...";
            const paddedTime = err.time.padEnd(8);
            const paddedType = err.type.padEnd(13);
            const paddedTitle = err.title.padEnd(25);
            const paddedDesc = shortDesc.padEnd(54);
            report += `| ${paddedTime} | ${paddedType} | ${paddedTitle} | ${paddedDesc} |\n`;
        });
        report += `+----------+---------------+---------------------------+--------------------------------------------------------+\n`;
    } else {
        report += `+-----------------------------------------------------------------------------------------------------------------------+\n`;
        report += `| Şu an aktif log dosyasında eşleşen dinamik bir hata kaydı bulunmuyor.                                                 |\n`;
        report += `+-----------------------------------------------------------------------------------------------------------------------+\n`;
    }
    report += `===================================================================================================================\n`;

    return {
        printStats,
        errorCount: printStats.Errors,
        reportContent: report
    };
}

module.exports = {
    parseKlippyLogContent,
    syncAndAnalyzePrinterLogs
};
