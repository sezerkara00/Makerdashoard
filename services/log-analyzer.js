const fs = require('fs');
const path = require('path');
const { getPrinterDb } = require('./database');

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

const KLIPPY_TARGET_SENSORS = ['extruder', 'extruder1', 'extruder2', 'extruder3', 'heater_bed', 'heater_env', 'EBBCan', 'EBBCan1', 'EBBCan3'];

function createKlippyParserState(initialState = null) {
    return {
        running: initialState?.running ?? false,
        pText: initialState?.pText ?? '',
        statsStarted: initialState?.statsStarted ?? false,
        currentStartTimestamp: initialState?.currentStartTimestamp ?? '',
        currentStartSec: initialState?.currentStartSec ?? 0.0,
        currentPrintId: initialState?.currentPrintId ?? '',
        lastOpenedFilename: initialState?.lastOpenedFilename ?? '',
        lastStatsSec: initialState?.lastStatsSec ?? 0.0,
        lastPrintStatsState: initialState?.lastPrintStatsState ?? ''
    };
}

function collectTemperaturePeaks(pText, logLines, targetSensors = KLIPPY_TARGET_SENSORS) {
    const peaks = {};
    const printLines = pText.trim() ? pText.split('\n') : logLines;
    for (const s of targetSensors) {
        const r1 = new RegExp(s + ':\\s+[^:\\n]*temp=([\\d.-]+)');
        const r2 = new RegExp(s + ':\\s+target=[\\d.]+\\s+temp=([\\d.-]+)');
        const temps = [];
        for (const l of printLines) {
            if (!l.includes(s)) continue;
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
        if (temps.length > 0) {
            const maxVal = temps.reduce((max, val) => val > max ? val : max, temps[0]);
            peaks[s] = parseFloat(maxVal.toFixed(1));
        }
    }
    return peaks;
}

function isKlippyStartMarker(line, lineLower) {
    // Must be a real command dispatch, not a macro definition or config reference.
    // Reject lines that are clearly config/debug output:
    // - SET_GCODE_VARIABLE ... (macro variable assignments)
    // - gcode_macro START_PRINT (config section header)
    // - printer["gcode_macro START_PRINT"] (Jinja template references)
    // - Lines that are inside the config dump (no Stats lines seen yet → handled by statsStarted guard)
    if (lineLower.includes('set_gcode_variable') && lineLower.includes('start_print')) return false;
    if (lineLower.includes('gcode_macro start_print')) return false;
    if (lineLower.includes('printer[') && lineLower.includes('start_print')) return false;
    if (lineLower.includes('m118') && lineLower.includes('start_print')) return false;

    // Real start signals
    return line.includes('START_PRINT') && !lineLower.includes('variable_')
        || line.includes('START PRINT')
        || lineLower.includes('starting sd card print')
        || line.includes('Sending: START_PRINT');
}

function isKlippyEndMarker(line, lineLower) {
    return line.includes('Finished SD card print')
        || line.includes('Exiting SD card print')
        || line.includes('is_print_stats:complete')
        || line.includes('END_PRINT') || line.includes('END PRINT')
        || line.includes('CANCEL_PRINT') || line.includes('CANCEL PRINT')
        || line.includes('is_print_stats:cancelled')
        || /\bM315\b/.test(line);
}

function klippyAnalysisHasActivity(result) {
    return result.errorCount > 0
        || result.printStats.Success > 0
        || result.printStats.Cancelled > 0
        || result.reportContent.includes('🚀 Baskı Başladı')
        || result.reportContent.includes('❌ Baskı');
}

/**
 * Runs the exact Klipper log parsing algorithm translated from Python
 */
function parseKlippyLogContent(logContent, printerId = "edist_toolchanger_01", passedStartDt = null, initialState = null) {
    const logLines = logContent.split('\n');
    
    // Find rollover date and correct for Klipper uptime offset.
    //
    // Klipper logs do NOT contain real wall-clock timestamps. Every "Stats X:" line
    // records X = seconds elapsed since the Klipper daemon started.
    // The "Log rollover at <date>" line tells us when the log FILE was rotated
    // (typically at midnight), NOT when Klipper started.
    //
    // Problem: if Klipper started at 16:15 on Jun 17 and the log rotated at
    //          00:00 on Jun 18, the first Stats line after rollover will say
    //          ~27882 (7h 44m 42s). Using rolloverDate + 27882s gives 07:44:42
    //          which is WRONG — the event actually happened at ~00:00:00 on Jun 18.
    //
    // Fix: startDt = rolloverDate - firstStatsSec
    //      This gives the real Klipper start time.
    //      Then: eventTime = startDt + currentStatsSec  ← always correct.
    let startDt = passedStartDt;
    if (!startDt) {
        let rolloverDate = null;
        let firstStatsSec = null;

        for (const line of logLines) {
            if (!rolloverDate && line.includes('Log rollover at')) {
                try {
                    const dateStr = line.split('Log rollover at').pop().split('=')[0].trim();
                    rolloverDate = parseRolloverDate(dateStr);
                } catch (e) { /* ignore */ }
            }
            // After we have the rollover date, grab the first Stats line to get
            // the uptime-seconds value at the moment of rollover.
            if (rolloverDate && firstStatsSec === null) {
                const statsMatch = line.match(/^Stats\s+([\d.]+):/i);
                if (statsMatch) {
                    firstStatsSec = parseFloat(statsMatch[1]);
                }
            }
            if (rolloverDate && firstStatsSec !== null) break;
        }

        if (rolloverDate && firstStatsSec !== null) {
            // Real Klipper start = rollover moment − uptime at rollover
            startDt = new Date(rolloverDate.getTime() - firstStatsSec * 1000);
        } else if (rolloverDate) {
            startDt = rolloverDate;
        }
    }

    if (!startDt) {
        startDt = new Date();
    }
    
    const parserState = createKlippyParserState(initialState);
    let running = parserState.running;
    let pText = parserState.pText;
    let statsStarted = parserState.statsStarted;
    let currentStartTimestamp = parserState.currentStartTimestamp;
    let currentStartSec = parserState.currentStartSec;
    let currentPrintId = parserState.currentPrintId;
    let lastOpenedFilename = parserState.lastOpenedFilename;
    let lastStatsSec = parserState.lastStatsSec;
    let lastPrintStatsState = parserState.lastPrintStatsState;
    
    const targetSensors = KLIPPY_TARGET_SENSORS;
    
    const printStats = { Success: 0, Cancelled: 0, Errors: 0 };
    const uniqueErrorsMap = {};
    const baskiRaporuLines = [];
    const outgoingEvents = [];
    let currentPrintStats = { total_duration: 0, print_duration: 0 };

    const beginPrintSession = (idx, exactTimestamp) => {
        running = true;
        pText = '';
        currentPrintId = `baski_${idx}`;
        currentStartTimestamp = exactTimestamp;
        currentStartSec = lastStatsSec;
        currentPrintStats = { total_duration: 0, print_duration: 0 };

        const eventTime = formatDate(addSeconds(startDt, lastStatsSec));
        const lastLine = baskiRaporuLines[baskiRaporuLines.length - 1];
        if (!lastLine || !lastLine.includes(eventTime)) {
            if (lastOpenedFilename) {
                baskiRaporuLines.push(`🚀 Baskı Başladı (${lastOpenedFilename}) : ${eventTime}`);
            } else {
                baskiRaporuLines.push(`🚀 Baskı Başladı : ${eventTime}`);
            }
        }
    };

    const finalizePrintSession = (status, exactTimestamp, cancelReason = "Kullanıcı Manuel İptal Etti") => {
        // Session zaten kapandıysa tekrar kapatma
        if (!running) return;
        // Başlangıç zamanı ile bitiş zamanı aynıysa çok kısa bir baskı — yine de kaydet
        // (eski guard kaldırıldı: if (currentStartTimestamp === exactTimestamp) return; )

        printStats[status]++;
        const peaks = collectTemperaturePeaks(pText, logLines, targetSensors);
        const durationSec = currentStartSec > 0 ? (lastStatsSec - currentStartSec) : 0;
        const durationMin = currentStartSec > 0 ? Math.max(0, Math.round(durationSec / 60)) : '?';
        const peaksStr = Object.entries(peaks).map(([sensor, temp]) => `${sensor}: ${temp}°C`).join(', ');
        const eventTime = formatDate(addSeconds(startDt, lastStatsSec));
        const statusText = status === 'Success' ? 'Bitti' : 'İptal Edildi';
        const icon = status === 'Success' ? '✅' : '❌';
        let statsSuffix = '';
        if (currentPrintStats.print_duration > 0) {
            const pMin = Math.round(currentPrintStats.print_duration / 60);
            const tMin = Math.round(currentPrintStats.total_duration / 60);
            statsSuffix += ` - PrintTime: ${pMin} dk (${currentPrintStats.print_duration.toFixed(0)} sn) - TotalTime: ${tMin} dk (${currentPrintStats.total_duration.toFixed(0)} sn)`;
        }

        const filenameText = lastOpenedFilename ? ` (${lastOpenedFilename})` : '';
        baskiRaporuLines.push(`${icon} Baskı ${statusText}${filenameText} - Süre: ${durationMin} dk${statsSuffix} - Peak Sıcaklıklar: [${peaksStr || 'Yok'}] : ${eventTime}`);

        outgoingEvents.push({
            eventType: "PRINT_START",
            payload: {
                printer_id: printerId,
                event: "PRINT_START",
                timestamp: currentStartTimestamp,
                data: { print_id: currentPrintId, status: "Printing" }
            }
        });

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

        running = false;
        pText = '';
    };
    
    for (let idx = 0; idx < logLines.length; idx++) {
        const line = logLines[idx];
        const lineStrip = line.trim();
        const lineLower = lineStrip.toLowerCase();
        
        if (!lineStrip) continue;

        // ── Klipper yeniden başlatma / gece yarısı log döndürme tespiti ──
        // Her "Log rollover at" satırında startDt yeniden hesaplanır.
        // Böylece makine günde birden fazla açılıp kapansa bile her oturumun
        // zamanı doğru hesaplanır.
        if (lineStrip.includes('Log rollover at')) {
            try {
                const dateStr = lineStrip.split('Log rollover at').pop().split('=')[0].trim();
                const newRolloverDate = parseRolloverDate(dateStr);
                // Sonraki Stats satırına bak (ilk 50 satır içinde)
                let newFirstStatsSec = null;
                for (let k = idx + 1; k < Math.min(idx + 50, logLines.length); k++) {
                    const sm = logLines[k].match(/^Stats\s+([\d.]+):/i);
                    if (sm) {
                        newFirstStatsSec = parseFloat(sm[1]);
                        break;
                    }
                }
                if (newFirstStatsSec !== null) {
                    // Gerçek Klipper başlangıcı = rollover anı − rollover anındaki uptime
                    startDt = new Date(newRolloverDate.getTime() - newFirstStatsSec * 1000);
                } else {
                    startDt = newRolloverDate;
                }
                // Klipper yeniden başladıysa baskı oturumunu kapat
                if (running) {
                    finalizePrintSession('Cancelled', formatDate(startDt), 'Klipper Yeniden Başlatıldı');
                }
                running = false;
                pText = '';
                lastStatsSec = 0;
                statsStarted = false;
                lastPrintStatsState = '';
            } catch (e) { /* ignore */ }
            continue;
        }

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
                if (lastStatsSec > 0) {
                    const calculatedDate = addSeconds(startDt, lastStatsSec);
                    exactTimestamp = formatDate(calculatedDate);
                    currentTimeStr = formatTime(calculatedDate);
                } else {
                    exactTimestamp = formatDate(startDt);
                    currentTimeStr = "Sistem";
                }
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
        const hasErrorKeyword = lineStrip.includes('||') 
            || lineLower.includes('emergency stop') 
            || lineLower.includes('transition to shutdown')
            || lineLower.includes('configparser.error')
            || (lineLower.includes('config error') && !lineLower.includes('====='));
        
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
                if (lineLower.includes('configparser.error') || lineLower.includes('config error')) {
                    errorType = "CFG_0001";
                    errorTitle = "Yapılandırma Hatası (Config Error)";
                    errorDesc = cleanErrorLine;
                } else {
                    errorType = "COMM_1009";
                    errorTitle = "Emergency Stop (M112)";
                    errorDesc = cleanErrorLine;
                }
            }
            
            printStats.Errors++;
            let errorDuration = null;
            if (running) {
                const durationSec = currentStartSec > 0 ? (lastStatsSec - currentStartSec) : 0;
                const durationMin = currentStartSec > 0 ? Math.max(0, Math.round(durationSec / 60)) : null;
                if (durationMin !== null) errorDuration = durationMin;
            }
            
            // Extract the last 60 lines of context and last 5 received G-code commands leading up to this error.
            const contextLines = [];
            const recentGcodes = [];
            for (let i = Math.max(0, idx - 60); i < idx; i++) {
                const ctxLine = logLines[i].trim();
                if (ctxLine) {
                    contextLines.push(ctxLine);
                    const ctxLineLower = ctxLine.toLowerCase();
                    if (ctxLineLower.includes('gcode') || ctxLineLower.includes('received')) {
                        let cmd = ctxLine;
                        const gcodeIndex = ctxLineLower.indexOf('gcode:');
                        if (gcodeIndex !== -1) {
                            cmd = ctxLine.substring(gcodeIndex + 6).trim();
                        } else {
                            const receivedMatch = ctxLine.match(/received\s+[\d.]+:\s*(.*)/i);
                            if (receivedMatch) {
                                cmd = receivedMatch[1].trim();
                            }
                        }
                        if (cmd && cmd.length < 150 && !recentGcodes.includes(cmd)) {
                            recentGcodes.push(cmd);
                        }
                    }
                }
            }
            
            const errorKey = `${errorType}_${exactTimestamp}_${idx}`;
            uniqueErrorsMap[errorKey] = {
                time: exactTimestamp,
                type: errorType,
                code: errorType,
                title: errorTitle,
                desc: errorDesc,
                duration: errorDuration ? `${errorDuration} dk` : '-',
                context: contextLines.slice(-40).join('\n'),
                recentGcodes: recentGcodes.slice(-5)
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
                const eventTime = formatDate(addSeconds(startDt, lastStatsSec));
                const peaks = collectTemperaturePeaks(pText, logLines, targetSensors);
                const durationSec = currentStartSec > 0 ? (lastStatsSec - currentStartSec) : 0;
                const durationMin = currentStartSec > 0 ? Math.max(0, Math.round(durationSec / 60)) : '?';
                const peaksStr = Object.entries(peaks).map(([sensor, temp]) => `${sensor}: ${temp}°C`).join(', ');
                
                let statsSuffix = '';
                if (currentPrintStats.print_duration > 0) {
                    const pMin = Math.round(currentPrintStats.print_duration / 60);
                    const tMin = Math.round(currentPrintStats.total_duration / 60);
                    statsSuffix += ` - PrintTime: ${pMin} dk (${currentPrintStats.print_duration.toFixed(0)} sn) - TotalTime: ${tMin} dk (${currentPrintStats.total_duration.toFixed(0)} sn)`;
                }

                baskiRaporuLines.push(`❌ Baskı İptal (Hata: ${errorTitle}) - Süre: ${durationMin} dk${statsSuffix} - Peak Sıcaklıklar: [${peaksStr || 'Yok'}] : ${eventTime}`);
            } else {
                baskiRaporuLines.push(`❌ Sistem Hatası: ${errorTitle} (${errorDesc}) : ${exactTimestamp}`);
            }
            running = false;
            pText = '';
            continue;
        }

        if (statsStarted && isKlippyStartMarker(lineStrip, lineLower) && !running) {
            beginPrintSession(idx, exactTimestamp);
            continue;
        }

        if (lineLower.includes('print_stats:')) {
            const fnMatch = line.match(/filename=([^\s,]+)/i);
            if (fnMatch) {
                lastOpenedFilename = fnMatch[1];
            }

            const tdMatch = line.match(/total_duration=([\d.]+)/i);
            const pdMatch = line.match(/print_duration=([\d.]+)/i);
            if (tdMatch) currentPrintStats.total_duration = parseFloat(tdMatch[1]);
            if (pdMatch) currentPrintStats.print_duration = parseFloat(pdMatch[1]);

            const stateMatch = line.match(/print_stats:\s*state=(\w+)/i);
            if (stateMatch) {
                const psState = stateMatch[1].toLowerCase();
                if (psState === 'printing' && lastPrintStatsState !== 'printing' && !running) {
                    beginPrintSession(idx, exactTimestamp);
                } else if (running && psState !== lastPrintStatsState) {
                    if (psState === 'complete') {
                        finalizePrintSession('Success', exactTimestamp);
                    } else if (psState === 'cancelled' || (psState === 'standby' && lastPrintStatsState === 'printing')) {
                        finalizePrintSession('Cancelled', exactTimestamp);
                    }
                }
                lastPrintStatsState = psState;
            }
        }
        
        // ========================================================
        // ✅ SENARYO C: BASKI BİTİŞİ VEYA KULLANICI İPTALİ
        // ========================================================
        if ((running || statsStarted) && isKlippyEndMarker(lineStrip, lineLower)) {
            const status = (line.includes('CANCEL') || line.includes('Cancel') || /\bM315\b/.test(lineStrip)) ? 'Cancelled' : 'Success';
            finalizePrintSession(status, exactTimestamp);
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
            const shortDesc = (err.desc || '').length <= 52 ? (err.desc || '') : (err.desc || '').substring(0, 50) + "...";
            const paddedTime = String(err.time || '').padEnd(8);
            const paddedType = String(err.type || err.code || '').padEnd(13);
            const paddedTitle = String(err.title || '').padEnd(25);
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
        reportContent: report,
        errors: detectedErrorsList,
        parserState: {
            running,
            pText,
            statsStarted,
            currentStartTimestamp,
            currentStartSec,
            currentPrintId,
            lastOpenedFilename,
            lastStatsSec,
            lastPrintStatsState
        }
    };
}

/**
 * Connects to the LAN host, lists the log files, matches them,
 * retrieves/caches them, runs the parser, and writes the reports locally.
 */
function saveRunToDatabase(printerId, fileName, fileSize, analysisResult, incremental = false, skipStatsUpdate = false) {
    const db = getPrinterDb(printerId);
    const parsedSections = extractRunSections(analysisResult.reportContent);
    const rawErrors = analysisResult.errors || parsedSections.errors || [];
    
    if (incremental) {
        const existingRun = db.get('analysis_runs')
            .find({ fileName })
            .value();
            
        if (existingRun) {
            // Deduplicated merge — same event text must not appear twice.
            // This prevents Emergency Stop / cancel lines from accumulating on every incremental parse.
            const existingTexts = new Set(existingRun.baskiRaporu.map(e => e.text));
            const newEvents = parsedSections.baskiRaporu.filter(e => !existingTexts.has(e.text));
            existingRun.baskiRaporu.push(...newEvents);

            const existingServerTexts = new Set(existingRun.serverLogs.map(e => JSON.stringify(e)));
            parsedSections.serverLogs.forEach(e => {
                if (!existingServerTexts.has(JSON.stringify(e))) existingRun.serverLogs.push(e);
            });

            // Errors: use type+time+desc+context as unique key to prevent duplication while allowing separate occurrences
            const existingErrKeys = new Set(existingRun.errors.map(e => `${e.type || e.code || ''}|${e.time}|${e.desc}|${(e.context || '').substring(0, 100)}`));
            rawErrors.forEach(e => {
                const key = `${e.type || e.code || ''}|${e.time}|${e.desc}|${(e.context || '').substring(0, 100)}`;
                if (!existingErrKeys.has(key)) {
                    existingRun.errors.push(e);
                    existingErrKeys.add(key);
                }
            });
            existingRun.summary.success += parsedSections.summary.success || 0;
            existingRun.summary.cancelled += parsedSections.summary.cancelled || 0;
            existingRun.summary.paused += parsedSections.summary.paused || 0;
            existingRun.summary.errors += parsedSections.summary.errors || 0;
            
            parsedSections.maxTemps.forEach(incoming => {
                const existing = existingRun.maxTemps.find(item => item.sensor === incoming.sensor);
                if (existing) {
                    const incomingVal = parseFloat(incoming.value) || 0;
                    const existingVal = parseFloat(existing.value) || 0;
                    if (incomingVal > existingVal) {
                        existing.value = incoming.value;
                    }
                } else {
                    existingRun.maxTemps.push(incoming);
                }
            });
            
            // Recalculate printSessions for incremental merge
            existingRun.printSessions = buildPrintSessionsFromEvents(existingRun.baskiRaporu, existingRun.maxTemps);

            existingRun.lastSyncTime = new Date().toLocaleString('tr-TR');
            existingRun.fileSize = fileSize;
            existingRun.reportContent += '\n' + analysisResult.reportContent;
            
            db.write();
            if (!skipStatsUpdate) updateTotalPrintDuration(printerId);
            return;
        }
    }
    
    // Non-incremental or first-time incremental: overwrite
    db.get('analysis_runs').remove({ fileName }).write();
    db.get('analysis_runs').push({
        printerId,
        fileName,
        lastSyncTime: new Date().toLocaleString('tr-TR'),
        fileSize,
        summary: parsedSections.summary,
        baskiRaporu: parsedSections.baskiRaporu,
        errors: rawErrors,
        maxTemps: parsedSections.maxTemps,
        serverLogs: parsedSections.serverLogs,
        printSessions: parsedSections.printSessions,
        reportContent: analysisResult.reportContent
    }).write();
    if (!skipStatsUpdate) updateTotalPrintDuration(printerId);
}

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
    let state = { files: {}, parserStates: {}, rolloverDates: {} };
    if (fs.existsSync(statePath)) {
        try {
            state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            if (!state.files) state.files = {};
            if (!state.parserStates) state.parserStates = {};
            if (!state.rolloverDates) state.rolloverDates = {};
        } catch (e) {
            console.error("[Log Analyzer] State parsing error, resetting state:", e);
        }
    }

    // If the database has no runs, force a full sync by clearing the saved file sizes in state
    const db = getPrinterDb(printer.id);
    const dbRuns = db.get('analysis_runs').value() || [];
    if (dbRuns.length === 0) {
        console.log(`[Log Analyzer] Database runs are empty for printer ${printer.id}. Resetting sync state to force full re-sync.`);
        state.files = {};
        state.parserStates = {};
        state.rolloverDates = {};
        try {
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
        } catch (err) {
            console.warn(`[Log Analyzer] Failed to reset analysis_state file: ${err.message}`);
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

    for (const fileInfo of klippyLogFiles) {
        const fileName = fileInfo.filename;
        const fileSize = fileInfo.size;
        const isActiveLog = fileName === 'klippy.log';

        let lastProcessedSize = state.files[fileName] || 0;

        // Rollover detection: if active log size decreased, it was reset
        if (isActiveLog && fileSize < lastProcessedSize) {
            console.log(`[Log Analyzer] Rollover detected on active log (size decreased from ${lastProcessedSize} to ${fileSize}).`);
            lastProcessedSize = 0;
            delete state.parserStates[fileName];
            const _db = getPrinterDb(printer.id);
            _db.get('analysis_runs').remove({ fileName }).write();
        }

        const dbRun = getPrinterDb(printer.id).get('analysis_runs').find({ fileName }).value();
        const hasBeenProcessedInReport = !!dbRun;

        // If size matches and report contains the file analysis, skip it
        if (fileSize === lastProcessedSize && hasBeenProcessedInReport) {
            console.log(`[Log Analyzer] Skipping cached file ${fileName} - size unchanged (${fileSize} bytes) and already processed in report.`);
            continue;
        }

        // Retrieve log contents from Moonraker logs endpoint
        const downloadUrl = `http://${host}/server/files/logs/${encodeURIComponent(fileName)}`;
        console.log(`[Log Analyzer] Retrieving: ${downloadUrl}`);
        
        let newContent = '';
        let rolloverDateForFile = null;
        let rangeSucceeded = false;

        // For the active log with incremental data, use HTTP Range to fetch only new bytes
        if (isActiveLog && lastProcessedSize > 0) {
            // First, fetch the rollover date from the very beginning of the file (first 4KB)
            // to keep our reference date accurate.
            try {
                const headRes = await fetch(downloadUrl, {
                    headers: { 'Range': `bytes=0-4095` }
                });
                if (headRes.ok || headRes.status === 206) {
                    const headText = await headRes.text();
                    const rolloverMatch = headText.match(/Log rollover at\s+(.+?)(?:\n|=)/);
                    if (rolloverMatch) {
                        rolloverDateForFile = parseRolloverDate(rolloverMatch[1].trim());
                        // Persist so future incremental parses can use this if Range fails
                        state.rolloverDates[fileName] = rolloverDateForFile.getTime();
                    }
                }
            } catch (e) {
                console.warn(`[Log Analyzer] Failed to fetch rollover date header: ${e.message}`);
            }

            // Fall back to persisted rollover date if we couldn't fetch the header
            if (!rolloverDateForFile && state.rolloverDates[fileName]) {
                rolloverDateForFile = new Date(state.rolloverDates[fileName]);
                console.log(`[Log Analyzer] Using persisted rollover date for ${fileName}: ${rolloverDateForFile}`);
            }

            // Fetch only the new portion of the file
            try {
                const rangeRes = await fetch(downloadUrl, {
                    headers: { 'Range': `bytes=${lastProcessedSize}-` }
                });
                if (rangeRes.ok || rangeRes.status === 206) {
                    newContent = await rangeRes.text();
                    rangeSucceeded = true;
                    // Align to newline to avoid partial line fragments
                    const firstNewline = newContent.indexOf('\n');
                    if (firstNewline !== -1) {
                        newContent = newContent.substring(firstNewline + 1);
                    } else {
                        newContent = ''; // No new complete lines
                    }
                } else {
                    console.warn(`[Log Analyzer] Range request failed for ${fileName}: Status ${rangeRes.status}, falling back to full download`);
                    // Fall through to full download below
                }
            } catch (netErr) {
                console.warn(`[Log Analyzer] Failed to download ${fileName}: ${netErr.message}`);
                continue;
            }
        }
        
        // Full download path: for rotated logs or when Range request failed/not applicable
        if (!rangeSucceeded && !newContent) {
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
            if (isActiveLog && lastProcessedSize > 0) {
                newContent = logContent.substring(lastProcessedSize);
                // Align to newline to avoid partial line fragments
                const firstNewline = newContent.indexOf('\n');
                if (firstNewline !== -1) {
                    newContent = newContent.substring(firstNewline + 1);
                } else {
                    newContent = '';
                }
            } else {
                newContent = logContent;
            }

            // Find rollover date from the beginning of the file (scan first 4KB only)
            if (!rolloverDateForFile) {
                const scanSlice = logContent.substring(0, 4096);
                const rolloverMatch = scanSlice.match(/Log rollover at\s+(.+?)(?:\n|=)/);
                if (rolloverMatch) {
                    rolloverDateForFile = parseRolloverDate(rolloverMatch[1].trim());
                    // Persist for future incremental parses
                    state.rolloverDates[fileName] = rolloverDateForFile.getTime();
                }
            }
            // Release the full logContent reference immediately
            // (logContent goes out of scope here naturally)
        }

        if (newContent.trim().length === 0) {
            // No new contents to analyze, just update state size
            state.files[fileName] = fileSize;
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
            continue;
        }

        // Analyze new content (carry parser state for incremental klippy.log slices)
        const savedParserState = isActiveLog ? state.parserStates[fileName] : null;
        const analysisResult = parseKlippyLogContent(newContent, printer.id, rolloverDateForFile, savedParserState);
        // Release newContent after parsing
        newContent = null;
        
        if (isActiveLog) {
            state.parserStates[fileName] = analysisResult.parserState;
        } else {
            delete state.parserStates[fileName];
        }

        if (!klippyAnalysisHasActivity(analysisResult)) {
            state.files[fileName] = fileSize;
            fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
            console.log(`[Log Analyzer] Skipping empty analysis append for ${fileName}.`);
            continue;
        }
        
        // Save remote log run to database
        saveRunToDatabase(printer.id, fileName, fileSize, analysisResult, isActiveLog, true);
        
        // Update state
        state.files[fileName] = fileSize;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
        
        totalErrorsDetected += analysisResult.errorCount;
        processedCount++;
    }

    updateTotalPrintDuration(printer.id);

    return {
        success: true,
        processedCount,
        totalErrorsDetected
    };
}

function parsePrinterLogsTxt(content) {
    const lines = content.split('\n');
    const baskiRaporuLines = [];
    const printStats = { Success: 0, Cancelled: 0, Errors: 0, Paused: 0 };
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
    let progressSessionActive = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const timeMatch = line.match(/^\[([^\]]+)\]/);
        const timestamp = timeMatch ? timeMatch[1] : '';

        if (line.includes('[PROGRESS]')) {
            const fileInLine = line.match(/Dosya:\s*([^|]+)/i);
            if (fileInLine) currentPrintFile = fileInLine[1].trim();

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
            
            progressSessionActive = true;
            if (baskiRaporuLines.length > 0 && progressSessionActive && baskiRaporuLines[baskiRaporuLines.length - 1].includes('[PROGRESS]')) {
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
            progressSessionActive = true;
            
            baskiRaporuLines.push(`🚀 Baskı Başladı (${currentPrintFile}) : ${timestamp}`);
        }

        if (line.includes('Baskı Sürdürüldü')) {
            progressSessionActive = true;
            const fileMatch = line.match(/Dosya:\s*(.+)$/i);
            if (fileMatch) currentPrintFile = fileMatch[1].trim();
            baskiRaporuLines.push(`▶️ Baskı Sürdürüldü (${currentPrintFile || '-'}) : ${timestamp}`);
        }

        if (line.includes('Baskı Duraklatıldı')) {
            printStats.Paused++;
            progressSessionActive = false;
            const fileMatch = line.match(/Dosya:\s*(.+)$/i);
            if (fileMatch) currentPrintFile = fileMatch[1].trim();
            baskiRaporuLines.push(`⏸️ Baskı Duraklatıldı (${currentPrintFile || '-'}) : ${timestamp}`);
        }

        if (line.includes('Baskı Tamamlandı')) {
            printStats.Success++;
            const fileMatch = line.match(/Dosya:\s*(.*?)(?:\s*\(%|\s*-\s*PrintTime|\s*-\s*TotalTime|$)/i);
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
            
            let statsSuffix = '';
            const printTimeMatch = line.match(/PrintTime:\s*([\d.]+)\s*dk(?:\s*\(([\d.]+)\s*sn\))?/i);
            if (printTimeMatch) {
                statsSuffix += ` - PrintTime: ${printTimeMatch[1]} dk`;
                if (printTimeMatch[2]) statsSuffix += ` (${printTimeMatch[2]} sn)`;
            }
            const totalTimeMatch = line.match(/TotalTime:\s*([\d.]+)\s*dk(?:\s*\(([\d.]+)\s*sn\))?/i);
            if (totalTimeMatch) {
                statsSuffix += ` - TotalTime: ${totalTimeMatch[1]} dk`;
                if (totalTimeMatch[2]) statsSuffix += ` (${totalTimeMatch[2]} sn)`;
            }
            
            let peakStrList = [];
            if (maxTemps.extruder > 0) peakStrList.push(`extruder: ${maxTemps.extruder}°C`);
            if (maxTemps.extruder1 > 0) peakStrList.push(`extruder1: ${maxTemps.extruder1}°C`);
            if (maxTemps.extruder2 > 0) peakStrList.push(`extruder2: ${maxTemps.extruder2}°C`);
            if (maxTemps.extruder3 > 0) peakStrList.push(`extruder3: ${maxTemps.extruder3}°C`);
            if (maxTemps.heater_bed > 0) peakStrList.push(`heater_bed: ${maxTemps.heater_bed}°C`);
            if (maxTemps.env > 0) peakStrList.push(`env: ${maxTemps.env}°C`);
            const peakStr = peakStrList.length > 0 ? peakStrList.join(', ') : 'Yok';

            baskiRaporuLines.push(`✅ Baskı Bitti (${file})${durationStr}${statsSuffix} - Peak Sıcaklıklar: [${peakStr}] : ${timestamp}`);
            currentPrintStart = null;
            currentPrintFile = '';
            Object.keys(maxTemps).forEach(k => maxTemps[k] = 0);
        }

        if (line.includes('Baskı İptal Edildi')) {
            printStats.Cancelled++;
            progressSessionActive = false;
            const fileMatch = line.match(/Dosya:\s*(.*?)(?:\s*\(%|\s*-\s*PrintTime|\s*-\s*TotalTime|$)/i);
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

            let statsSuffix = '';
            const printTimeMatch = line.match(/PrintTime:\s*([\d.]+)\s*dk(?:\s*\(([\d.]+)\s*sn\))?/i);
            if (printTimeMatch) {
                statsSuffix += ` - PrintTime: ${printTimeMatch[1]} dk`;
                if (printTimeMatch[2]) statsSuffix += ` (${printTimeMatch[2]} sn)`;
            }
            const totalTimeMatch = line.match(/TotalTime:\s*([\d.]+)\s*dk(?:\s*\(([\d.]+)\s*sn\))?/i);
            if (totalTimeMatch) {
                statsSuffix += ` - TotalTime: ${totalTimeMatch[1]} dk`;
                if (totalTimeMatch[2]) statsSuffix += ` (${totalTimeMatch[2]} sn)`;
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

            baskiRaporuLines.push(`❌ Baskı İptal (${file})${progStr}${durationStr}${statsSuffix} - Peak Sıcaklıklar: [${peakStr}] : ${timestamp}`);
            currentPrintStart = null;
            currentPrintFile = '';
            Object.keys(maxTemps).forEach(k => maxTemps[k] = 0);
        }

        if (line.includes('[ERROR]')) {
            printStats.Errors++;
            const errDesc = line.split('[ERROR]').pop().trim();
            let errorDuration = null;
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
                        if (diffMin >= 0) errorDuration = diffMin;
                    }
                } catch (e) {}
            }
            const errorKey = `${errDesc}_${timestamp}_${i}`;
            uniqueErrorsMap[errorKey] = {
                time: timestamp,
                type: "DASHBOARD_ERR",
                code: "DASHBOARD_ERR",
                title: "Dashboard Hata Kaydı",
                desc: errDesc,
                duration: errorDuration
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
    report += `\n[GENEL ÖZET] Gerçek Başarılı: ${printStats.Success} | Gerçek İptal: ${printStats.Cancelled} | Duraklatıldı: ${printStats.Paused} | Yakalanan Hatalar: ${printStats.Errors}\n`;
    report += `\n[YAKALANAN TÜM KRİTİK HATALARIN LİSTESİ]\n`;
    
    const errorsList = Object.values(uniqueErrorsMap);
    if (errorsList.length > 0) {
        report += `+----------+---------------+---------------------------+----------+---------------------------------------------+\n`;
        report += `| Saat     | Hata Kodu     | Hata Başlığı              | Süre     | Ayıklanan Açıklama                          |\n`;
        report += `+----------+---------------+---------------------------+----------+---------------------------------------------+\n`;
        errorsList.forEach(err => {
            const shortDesc = (err.desc || '').length <= 46 ? (err.desc || '') : (err.desc || '').substring(0, 44) + "...";
            const paddedTime = String(err.time || '').padEnd(8);
            const paddedType = String(err.type || err.code || '').padEnd(13);
            const paddedTitle = String(err.title || '').padEnd(25);
            const durationStr = err.duration !== null && err.duration !== undefined ? `${err.duration} dk` : '-';
            const paddedDuration = durationStr.padEnd(8);
            const paddedDesc = shortDesc.padEnd(44);
            report += `| ${paddedTime} | ${paddedType} | ${paddedTitle} | ${paddedDuration} | ${paddedDesc} |\n`;
        });
        report += `+----------+---------------+---------------------------+----------+---------------------------------------------+\n`;
    } else {
        report += `+-----------------------------------------------------------------------------------------------------------------------+\n`;
        report += `| Şu an aktif log dosyasında eşleşen dinamik bir hata kaydı bulunmuyor.                                                 |\n`;
        report += `+-----------------------------------------------------------------------------------------------------------------------+\n`;
    }
    report += `===================================================================================================================\n`;

    return {
        printStats,
        errorCount: printStats.Errors,
        reportContent: report,
        errors: errorsList
    };
}

function extractRunSections(content) {
    const sections = {
        serverLogs: [],
        baskiRaporu: [],
        maxTemps: [],
        summary: { success: 0, cancelled: 0, paused: 0, errors: 0 },
        errors: [],
        printSessions: []
    };
    
    const serverLogRegex = /📡 \[SERVER LOG\] OUTGOING EVENT: ([^\n]+)[\s-]*(\{[\s\S]*?\})[\s-]*/g;
    let sMatch;
    while ((sMatch = serverLogRegex.exec(content)) !== null) {
        try {
            sections.serverLogs.push({
                type: sMatch[1].trim(),
                payload: JSON.parse(sMatch[2])
            });
        } catch (e) {
            sections.serverLogs.push({
                type: sMatch[1].trim(),
                raw: sMatch[2]
            });
        }
    }
    
    const baskiRaporuMatch = content.match(/=== MAKERDASHBOARD GERÇEK BASKI RAPORU ===([\s\S]*?)===/);
    if (baskiRaporuMatch) {
        const lines = baskiRaporuMatch[1].trim().split('\n');
        lines.forEach(line => {
            if (line.includes('🚀 Baskı Başladı') || (/Baskı Başladı/i.test(line) && !line.includes('[STATUS]'))) {
                sections.baskiRaporu.push({ type: 'start', text: line.replace('🚀', '').trim() });
            } else if (line.includes('✅ Baskı Bitti') || /Baskı Tamamlandı/i.test(line)) {
                sections.baskiRaporu.push({ type: 'success', text: line.replace('✅', '').trim() });
            } else if (line.includes('❌ Baskı İptal') || /Baskı İptal Edildi/i.test(line)) {
                sections.baskiRaporu.push({ type: 'cancel', text: line.replace('❌', '').trim() });
            } else if (line.includes('⏸️') || /Baskı Duraklatıldı/i.test(line)) {
                sections.baskiRaporu.push({ type: 'pause', text: line.replace(/^⏸️\s*/, '').trim() });
            } else if (line.includes('▶️') || /Baskı Sürdürüldü/i.test(line)) {
                sections.baskiRaporu.push({ type: 'resume', text: line.replace(/^▶️\s*/, '').trim() });
            } else if (line.includes('[STATUS]')) {
                if (/Baskı Duraklatıldı/i.test(line)) sections.baskiRaporu.push({ type: 'pause', text: line.trim() });
                else if (/Baskı Sürdürüldü/i.test(line)) sections.baskiRaporu.push({ type: 'resume', text: line.trim() });
                else if (/Baskı Başladı/i.test(line)) sections.baskiRaporu.push({ type: 'start', text: line.trim() });
                else if (/Baskı Tamamlandı/i.test(line)) sections.baskiRaporu.push({ type: 'success', text: line.trim() });
                else if (/Baskı İptal/i.test(line)) sections.baskiRaporu.push({ type: 'cancel', text: line.trim() });
            } else if (line.includes('[PROGRESS]') || line.includes('Yazdırılıyor:')) {
                sections.baskiRaporu.push({ type: 'progress', text: line.trim() });
            } else if (line.trim() && !line.includes('Log Başlangıcı') && !line.includes('Log periyodunda')) {
                sections.baskiRaporu.push({ type: 'info', text: line.trim() });
            }
        });
    }
    
    const maxTempsMatch = content.match(/=== BASKI ESNASINDA ÖLÇÜLEN MAKSIMUM GERÇEK SICAKLIKLAR ===([\s\S]*?)===/);
    if (maxTempsMatch) {
        const lines = maxTempsMatch[1].trim().split('\n');
        lines.forEach(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                sections.maxTemps.push({
                    sensor: parts[0].trim(),
                    value: parts[1].replace('°C', '').trim() + ' °C'
                });
            }
        });
    }
    
    const summaryMatch = content.match(/\[GENEL ÖZET\] Gerçek Başarılı:\s*(\d+)\s*\|\s*Gerçek İptal:\s*(\d+)(?:\s*\|\s*Duraklatıldı:\s*(\d+))?\s*\|\s*Yakalanan Hatalar:\s*(\d+)/);
    if (summaryMatch) {
        sections.summary = {
            success: parseInt(summaryMatch[1], 10),
            cancelled: parseInt(summaryMatch[2], 10),
            paused: summaryMatch[3] ? parseInt(summaryMatch[3], 10) : 0,
            errors: parseInt(summaryMatch[4], 10)
        };
    }
    
    const errorsMatch = content.match(/\[YAKALANAN TÜM KRİTİK HATALARIN LİSTESİ\][\s\S]*?\+[-+]+\+[\s\S]*?\+[-+]+\+([\s\S]*?)\+[-+]+\+/);
    if (errorsMatch) {
        const lines = errorsMatch[1].trim().split('\n');
        lines.forEach(line => {
            if (line.startsWith('|')) {
                const parts = line.split('|').map(p => p.trim());
                if (parts.length >= 7) {
                    sections.errors.push({
                        time: parts[1],
                        code: parts[2],
                        type: parts[2],
                        title: parts[3],
                        duration: parts[4],
                        desc: parts[5]
                    });
                } else if (parts.length === 6) {
                    sections.errors.push({
                        time: parts[1],
                        code: parts[2],
                        type: parts[2],
                        title: parts[3],
                        duration: '-',
                        desc: parts[4]
                    });
                }
            }
        });
    }

    // Build print sessions list
    sections.printSessions = buildPrintSessionsFromEvents(sections.baskiRaporu, sections.maxTemps);
    
    return sections;
}

function parseTrLogDate(str) {
    if (!str) return null;
    const parts = str.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const dateParts = parts[0].split('.');
    const timeParts = parts[1].split(':');
    if (dateParts.length < 3 || timeParts.length < 3) return null;
    return new Date(
        parseInt(dateParts[2], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[0], 10),
        parseInt(timeParts[0], 10),
        parseInt(timeParts[1], 10),
        parseInt(timeParts[2], 10)
    );
}

function extractAnalysisTime(text) {
    if (!text) return '';
    const bracket = text.match(/^\[([^\]]+)\]/);
    if (bracket) return bracket[1];
    const tail = text.match(/:\s*(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2})\s*$/);
    return tail ? tail[1] : '';
}

function extractAnalysisFile(text) {
    if (!text) return 'Bilinmeyen dosya';
    const paren = text.match(/\(([^)]+)\)\s*:/);
    if (paren) return paren[1].trim();
    const dosya = text.match(/Dosya:\s*(.+?)(?:\s*\(|$)/i);
    if (dosya) return dosya[1].trim();
    const progDosya = text.match(/Dosya:\s*([^|]+)/i);
    if (progDosya) return progDosya[1].trim();
    return 'Bilinmeyen dosya';
}

function buildPrintSessionsFromEvents(baskiRaporu, runMaxTemps) {
    const chronological = [...baskiRaporu]
        .filter(evt => {
            const time = extractAnalysisTime(evt.text);
            return time !== '' && parseTrLogDate(time) !== null;
        })
        .sort((a, b) => {
            const timeA = extractAnalysisTime(a.text);
            const timeB = extractAnalysisTime(b.text);
            if (!timeA) return 1;
            if (!timeB) return -1;
            const dateA = parseTrLogDate(timeA);
            const dateB = parseTrLogDate(timeB);
            if (!dateA) return 1;
            if (!dateB) return -1;
            
            const diff = dateA - dateB;
            if (diff !== 0) return diff;
            
            const eventTypePriority = {
                'start': 1,
                'resume': 2,
                'pause': 3,
                'progress': 4,
                'success': 5,
                'cancel': 6,
                'error': 7,
                'info': 8
            };
            
            const priorityA = eventTypePriority[a.type] || 9;
            const priorityB = eventTypePriority[b.type] || 9;
            return priorityA - priorityB;
        });

    const sessions = [];
    let current = null;

    const closeSession = () => { current = null; };

    const startSession = (file, time, item) => {
        current = {
            file: file || 'Bilinmeyen dosya',
            status: 'printing',
            startTime: time,
            endTime: null,
            lastProgress: null,
            peaksText: null,
            duration: null,
            printTime: 0,
            totalTime: 0,
            maxTemps: { extruder: 0, heater_bed: 0 },
            events: [item]
        };
        sessions.push(current);
    };

    for (const item of chronological) {
        const text = item.text || '';
        const time = extractAnalysisTime(text);
        const file = extractAnalysisFile(text);

        if (item.type === 'start' || /Baskı Başladı/i.test(text)) {
            closeSession();
            startSession(file, time, item);
            continue;
        }

        if (item.type === 'pause' || /Baskı Duraklatıldı/i.test(text)) {
            if (!current) startSession(file, time, item);
            current.status = 'paused';
            if (file && file !== 'Bilinmeyen dosya') current.file = file;
            current.events.push(item);
            continue;
        }

        if (item.type === 'resume' || /Baskı Sürdürüldü/i.test(text)) {
            if (!current) startSession(file, time, item);
            current.status = 'printing';
            current.events.push(item);
            continue;
        }

        if (item.type === 'success' || /Baskı Bitti/i.test(text) || /Baskı Tamamlandı/i.test(text)) {
            if (!current) startSession(file, time, item);
            current.status = 'completed';
            current.endTime = time;
            current.events.push(item);
            
            const peaksMatch = text.match(/Peak Sıcaklıklar:\s*\[(.*?)\]/i);
            if (peaksMatch) {
                current.peaksText = peaksMatch[1].trim();
            }
            const durationMatch = text.match(/Süre:\s*(\d+)\s*dk/i);
            if (durationMatch) {
                current.duration = `${durationMatch[1]} dk`;
            }

            let printTime = 0;
            let totalTime = 0;

            const printTimeMatch = text.match(/PrintTime:\s*([\d.]+)\s*dk(?:\s*\(([\d.]+)\s*sn\))?/i);
            if (printTimeMatch) {
                printTime = printTimeMatch[2] ? parseFloat(printTimeMatch[2]) : parseFloat(printTimeMatch[1]) * 60;
            }
            const totalTimeMatch = text.match(/TotalTime:\s*([\d.]+)\s*dk(?:\s*\(([\d.]+)\s*sn\))?/i);
            if (totalTimeMatch) {
                totalTime = totalTimeMatch[2] ? parseFloat(totalTimeMatch[2]) : parseFloat(totalTimeMatch[1]) * 60;
            } else if (durationMatch) {
                totalTime = parseInt(durationMatch[1], 10) * 60;
            }
            if (!printTime && totalTime) {
                printTime = totalTime;
            }

            current.printTime = printTime;
            current.totalTime = totalTime;
            
            closeSession();
            continue;
        }

        if (item.type === 'cancel' || /Baskı İptal/i.test(text)) {
            if (!current) startSession(file, time, item);
            current.status = 'cancelled';
            current.endTime = time;
            current.events.push(item);

            const peaksMatch = text.match(/Peak Sıcaklıklar:\s*\[(.*?)\]/i);
            if (peaksMatch) {
                current.peaksText = peaksMatch[1].trim();
            }
            const durationMatch = text.match(/Süre:\s*(\d+)\s*dk/i);
            if (durationMatch) {
                current.duration = `${durationMatch[1]} dk`;
            }

            let printTime = 0;
            let totalTime = 0;

            const printTimeMatch = text.match(/PrintTime:\s*([\d.]+)\s*dk(?:\s*\(([\d.]+)\s*sn\))?/i);
            if (printTimeMatch) {
                printTime = printTimeMatch[2] ? parseFloat(printTimeMatch[2]) : parseFloat(printTimeMatch[1]) * 60;
            }
            const totalTimeMatch = text.match(/TotalTime:\s*([\d.]+)\s*dk(?:\s*\(([\d.]+)\s*sn\))?/i);
            if (totalTimeMatch) {
                totalTime = totalTimeMatch[2] ? parseFloat(totalTimeMatch[2]) : parseFloat(totalTimeMatch[1]) * 60;
            } else if (durationMatch) {
                totalTime = parseInt(durationMatch[1], 10) * 60;
            }
            if (!printTime && totalTime) {
                printTime = totalTime;
            }

            current.printTime = printTime;
            current.totalTime = totalTime;
            
            closeSession();
            continue;
        }

        if (item.type === 'progress' || text.includes('[PROGRESS]') || text.includes('Yazdırılıyor:')) {
            const progMatch = text.match(/%(\d+)/);
            const newProg = progMatch ? parseInt(progMatch[1], 10) : null;

            if (current && newProg !== null && current.lastProgress !== null && newProg < current.lastProgress) {
                closeSession();
            }

            if (!current) {
                startSession(file !== 'Bilinmeyen dosya' ? file : 'Bilinmeyen dosya', time, item);
            }

            if (newProg !== null) current.lastProgress = newProg;
            if (current.status !== 'paused') current.status = 'printing';
            if (file && file !== 'Bilinmeyen dosya') current.file = file;

            // Track peaks from progress text
            if (current.maxTemps) {
                const t0Match = text.match(/(?:T0|extruder):\s*([\d.]+)/i);
                if (t0Match) current.maxTemps.extruder = Math.max(current.maxTemps.extruder, parseFloat(t0Match[1]));
                
                const t1Match = text.match(/T1:\s*([\d.]+)/i);
                if (t1Match) current.maxTemps.extruder1 = Math.max(current.maxTemps.extruder1 || 0, parseFloat(t1Match[1]));
                
                const t2Match = text.match(/T2:\s*([\d.]+)/i);
                if (t2Match) current.maxTemps.extruder2 = Math.max(current.maxTemps.extruder2 || 0, parseFloat(t2Match[1]));

                const t3Match = text.match(/T3:\s*([\d.]+)/i);
                if (t3Match) current.maxTemps.extruder3 = Math.max(current.maxTemps.extruder3 || 0, parseFloat(t3Match[1]));

                const bedMatch = text.match(/(?:Bed|heater_bed):\s*([\d.]+)/i);
                if (bedMatch) current.maxTemps.heater_bed = Math.max(current.maxTemps.heater_bed, parseFloat(bedMatch[1]));
                
                const envMatch = text.match(/Env:\s*([\d.]+)/i);
                if (envMatch) current.maxTemps.env = Math.max(current.maxTemps.env || 0, parseFloat(envMatch[1]));
            }

            const progIdx = current.events.findIndex(e => {
                const t = e.text || '';
                return t.includes('[PROGRESS]') || t.includes('Yazdırılıyor:');
            });
            if (progIdx >= 0) current.events[progIdx] = item;
            else current.events.push(item);
        }
    }

    // Final clean-up and formatting for each session
    for (const session of sessions) {
        if (!session.duration && session.startTime && session.endTime) {
            const startD = parseTrLogDate(session.startTime);
            const endD = parseTrLogDate(session.endTime);
            if (startD && endD) {
                const diffMin = Math.round((endD - startD) / 60000);
                if (diffMin >= 0) {
                    session.duration = `${diffMin} dk`;
                }
            }
        }
        if (!session.duration && session.startTime && !session.endTime) {
            const startD = parseTrLogDate(session.startTime);
            if (startD) {
                const endD = new Date();
                const diffMin = Math.round((endD - startD) / 60000);
                if (diffMin >= 0) {
                    session.activeDuration = `${diffMin} dk`;
                }
            }
        }
        
        // Populate peaksText for active sessions using maxTemps
        if (!session.peaksText && session.maxTemps) {
            const peakStrList = [];
            if (session.maxTemps.extruder > 0) peakStrList.push(`extruder: ${session.maxTemps.extruder}°C`);
            if (session.maxTemps.extruder1 > 0) peakStrList.push(`extruder1: ${session.maxTemps.extruder1}°C`);
            if (session.maxTemps.extruder2 > 0) peakStrList.push(`extruder2: ${session.maxTemps.extruder2}°C`);
            if (session.maxTemps.extruder3 > 0) peakStrList.push(`extruder3: ${session.maxTemps.extruder3}°C`);
            if (session.maxTemps.heater_bed > 0) peakStrList.push(`heater_bed: ${session.maxTemps.heater_bed}°C`);
            if (session.maxTemps.env > 0) peakStrList.push(`env: ${session.maxTemps.env}°C`);
            if (peakStrList.length > 0) {
                session.peaksText = peakStrList.join(', ');
            }
        }

        // Fallback for active sessions: use runMaxTemps
        if (!session.peaksText && runMaxTemps && runMaxTemps.length > 0) {
            session.peaksText = runMaxTemps.map(t => `${t.sensor}: ${t.value}`).join(', ');
        }
        
        // Remove progress lines from the events array (satisfying timeline cleanliness requirement)
        session.events = session.events.filter(e => {
            const t = e.text || '';
            if (e.type === 'progress' || t.includes('[PROGRESS]') || t.includes('Yazdırılıyor:')) {
                return false;
            }
            return e.type !== 'info';
        });

        // Clean up temporary parsing helper
        delete session.maxTemps;
    }

    // Filter sessions to only keep real print sessions (must contain a start, success, cancel, or error event)
    const filteredSessions = sessions.filter(session => {
        return session.events.some(evt => {
            const t = (evt.text || '').toLowerCase();
            return evt.type === 'start' ||
                   evt.type === 'success' ||
                   evt.type === 'cancel' ||
                   evt.type === 'error' ||
                   t.includes('baskı başladı') ||
                   t.includes('baskı bitti') ||
                   t.includes('baskı tamamlandı') ||
                   t.includes('baskı iptal');
        });
    });

    return filteredSessions.reverse();
}

function formatSecondsToTurkish(totalSecs) {
    if (!totalSecs || isNaN(totalSecs) || totalSecs <= 0) return '0sn';
    totalSecs = Math.round(totalSecs);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    
    let parts = [];
    if (hrs > 0) {
        parts.push(`${hrs}sa`);
    }
    if (mins > 0 || hrs > 0) {
        parts.push(`${mins}dk`);
    }
    parts.push(`${secs}sn`);
    return parts.join(' ');
}

function updateTotalPrintDuration(printerId) {
    const db = getPrinterDb(printerId);
    const runs = db.get('analysis_runs').value() || [];
    
    // Gather all sessions from all runs
    let allSessions = [];
    runs.forEach(run => {
        const sessions = run.printSessions || [];
        sessions.forEach(s => {
            const sCopy = JSON.parse(JSON.stringify(s));
            sCopy.fileName = run.fileName;
            allSessions.push(sCopy);
        });
    });
    
    // Sort chronologically by startTime
    allSessions.sort((a, b) => {
        const dateA = parseTrLogDate(a.startTime);
        const dateB = parseTrLogDate(b.startTime);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
    });
    
    // Stitch sessions that span across files
    const stitchedSessions = [];
    let activeOpenSession = null;
    
    for (const sess of allSessions) {
        const hasStart = sess.events && sess.events.some(e => e.type === 'start' || /Baskı Başladı/i.test(e.text || ''));
        
        if (sess.status === 'printing' || sess.status === 'paused') {
            if (activeOpenSession) {
                // Auto-close previous printing session as cancelled at the start of this new print session
                activeOpenSession.status = 'cancelled';
                activeOpenSession.endTime = sess.startTime;
                
                const startD = parseTrLogDate(activeOpenSession.startTime);
                const endD = parseTrLogDate(activeOpenSession.endTime);
                if (startD && endD) {
                    const diffMs = endD - startD;
                    const diffMin = Math.round(diffMs / 60000);
                    if (diffMin >= 0) {
                        activeOpenSession.duration = `${diffMin} dk`;
                        activeOpenSession.totalTime = Math.round(diffMs / 1000);
                        activeOpenSession.printTime = activeOpenSession.totalTime;
                    }
                }
                delete activeOpenSession.activeDuration;
                
                stitchedSessions.push(activeOpenSession);
            }
            activeOpenSession = sess;
        } else if (sess.status === 'completed' || sess.status === 'cancelled') {
            const startD = parseTrLogDate(sess.startTime);
            const endD = parseTrLogDate(sess.endTime);
            const isZeroDuration = sess.duration === '0 dk' || (startD && endD && startD.getTime() === endD.getTime());

            if (activeOpenSession && (!hasStart || isZeroDuration)) {
                // Stitch! Merge the end event into the active open start session
                activeOpenSession.status = isZeroDuration ? 'cancelled' : sess.status;
                activeOpenSession.endTime = sess.endTime;
                activeOpenSession.peaksText = sess.peaksText || activeOpenSession.peaksText;
                activeOpenSession.events = activeOpenSession.events.concat(sess.events);
                
                const startD_active = parseTrLogDate(activeOpenSession.startTime);
                const endD_active = parseTrLogDate(activeOpenSession.endTime);
                if (startD_active && endD_active) {
                    const diffMs = endD_active - startD_active;
                    const diffMin = Math.round(diffMs / 60000);
                    if (diffMin >= 0) {
                        activeOpenSession.duration = `${diffMin} dk`;
                        activeOpenSession.totalTime = Math.round(diffMs / 1000);
                    }
                }
                
                if (sess.printTime) {
                    activeOpenSession.printTime = sess.printTime;
                } else if (activeOpenSession.totalTime) {
                    activeOpenSession.printTime = activeOpenSession.totalTime;
                }
                
                delete activeOpenSession.activeDuration;
                
                stitchedSessions.push(activeOpenSession);
                activeOpenSession = null;
            } else {
                if (activeOpenSession) {
                    // Close the activeOpenSession as cancelled!
                    activeOpenSession.status = 'cancelled';
                    let lastEventTime = activeOpenSession.startTime;
                    if (activeOpenSession.events && activeOpenSession.events.length > 0) {
                        const lastEvt = activeOpenSession.events[activeOpenSession.events.length - 1];
                        const t = extractAnalysisTime(lastEvt.text || '');
                        if (t) lastEventTime = t;
                    }
                    activeOpenSession.endTime = lastEventTime;
                    const startD = parseTrLogDate(activeOpenSession.startTime);
                    const endD = parseTrLogDate(activeOpenSession.endTime);
                    if (startD && endD) {
                        const diffMs = endD - startD;
                        const diffMin = Math.round(diffMs / 60000);
                        if (diffMin >= 0) {
                            activeOpenSession.duration = `${diffMin} dk`;
                            activeOpenSession.totalTime = Math.round(diffMs / 1000);
                            activeOpenSession.printTime = activeOpenSession.totalTime;
                        }
                    }
                    delete activeOpenSession.activeDuration;
                    
                    stitchedSessions.push(activeOpenSession);
                    activeOpenSession = null;
                }
                stitchedSessions.push(sess);
            }
        } else {
            if (activeOpenSession) {
                // Close the activeOpenSession as cancelled!
                activeOpenSession.status = 'cancelled';
                let lastEventTime = activeOpenSession.startTime;
                if (activeOpenSession.events && activeOpenSession.events.length > 0) {
                    const lastEvt = activeOpenSession.events[activeOpenSession.events.length - 1];
                    const t = extractAnalysisTime(lastEvt.text || '');
                    if (t) lastEventTime = t;
                }
                activeOpenSession.endTime = lastEventTime;
                const startD = parseTrLogDate(activeOpenSession.startTime);
                const endD = parseTrLogDate(activeOpenSession.endTime);
                if (startD && endD) {
                    const diffMs = endD - startD;
                    const diffMin = Math.round(diffMs / 60000);
                    if (diffMin >= 0) {
                        activeOpenSession.duration = `${diffMin} dk`;
                        activeOpenSession.totalTime = Math.round(diffMs / 1000);
                        activeOpenSession.printTime = activeOpenSession.totalTime;
                    }
                }
                delete activeOpenSession.activeDuration;
                
                stitchedSessions.push(activeOpenSession);
                activeOpenSession = null;
            }
            stitchedSessions.push(sess);
        }
    }
    if (activeOpenSession) {
        if (activeOpenSession.fileName && activeOpenSession.fileName !== 'klippy.log' && activeOpenSession.fileName !== 'printer_logs.txt') {
            activeOpenSession.status = 'cancelled';
            let lastEventTime = activeOpenSession.startTime;
            if (activeOpenSession.events && activeOpenSession.events.length > 0) {
                const lastEvt = activeOpenSession.events[activeOpenSession.events.length - 1];
                const t = extractAnalysisTime(lastEvt.text || '');
                if (t) lastEventTime = t;
            }
            activeOpenSession.endTime = lastEventTime;
            const startD = parseTrLogDate(activeOpenSession.startTime);
            const endD = parseTrLogDate(activeOpenSession.endTime);
            if (startD && endD) {
                const diffMs = endD - startD;
                const diffMin = Math.round(diffMs / 60000);
                if (diffMin >= 0) {
                    activeOpenSession.duration = `${diffMin} dk`;
                    activeOpenSession.totalTime = Math.round(diffMs / 1000);
                    activeOpenSession.printTime = activeOpenSession.totalTime;
                }
            }
            delete activeOpenSession.activeDuration;
        }
        stitchedSessions.push(activeOpenSession);
    }
    
    let totalPrintJobs = 0;
    let maxJobSeconds = 0;
    let sumTotalSeconds = 0;
    let sumPrintSeconds = 0;
    
    stitchedSessions.forEach(sess => {
        // Count completed and cancelled jobs
        if (sess.status === 'completed' || sess.status === 'cancelled') {
            totalPrintJobs++;
            
            let sessionSec = 0;
            if (sess.totalTime) {
                sessionSec = sess.totalTime;
            } else if (sess.duration) {
                const match = String(sess.duration).match(/(\d+)/);
                if (match) sessionSec = parseInt(match[1], 10) * 60;
            }
            
            let printSec = 0;
            if (sess.printTime) {
                printSec = sess.printTime;
            } else {
                printSec = sessionSec;
            }
            
            if (sessionSec > maxJobSeconds) {
                maxJobSeconds = sessionSec;
            }
            
            sumTotalSeconds += sessionSec;
            sumPrintSeconds += printSec;
        }
    });
    
    let totalMinutesForLegacyField = Math.round(sumPrintSeconds / 60);
    
    // Add current active print duration (if any)
    const activeSess = stitchedSessions.find(sess => (sess.status === 'printing' || sess.status === 'paused') && (sess.fileName === 'klippy.log' || sess.fileName === 'printer_logs.txt'));
    if (activeSess && activeSess.activeDuration) {
        const match = String(activeSess.activeDuration).match(/(\d+)/);
        if (match) {
            totalMinutesForLegacyField += parseInt(match[1], 10);
        }
    }
    
    const avgTimeSec = totalPrintJobs > 0 ? (sumPrintSeconds / totalPrintJobs) : 0;
    
    const stats = {
        totalPrintJobs: totalPrintJobs,
        longestJob: formatSecondsToTurkish(maxJobSeconds),
        totalTime: formatSecondsToTurkish(sumTotalSeconds),
        totalPrintTime: formatSecondsToTurkish(sumPrintSeconds),
        avgTimePerPrint: formatSecondsToTurkish(avgTimeSec)
    };
    
    db.set('totalPrintDuration', totalMinutesForLegacyField).write();
    db.set('stats', stats).write();
    
    console.log(`[DB] Recalculated stats for ${printerId}:`, stats);
    return totalMinutesForLegacyField;
}

module.exports = {
    parseKlippyLogContent,
    parsePrinterLogsTxt,
    syncAndAnalyzePrinterLogs,
    extractRunSections,
    extractAnalysisTime,
    extractAnalysisFile,
    buildPrintSessionsFromEvents,
    updateTotalPrintDuration
};
