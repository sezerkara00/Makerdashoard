const { ipcRenderer, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const userDataPath = ipcRenderer.sendSync('get-user-data-path');
const printersFilePath = path.join(userDataPath, 'printers.json');

// ─── Theme Initialization ─────────────────────────────────────────────────────
const settingsFilePath = path.join(userDataPath, 'settings.json');
let appSettings = { theme: 'orange', webhookNotifications: true, soundAlerts: true, windowsNotifications: true, minimizeToTray: false, printerModeFilter: 'all', printerStatusFilter: 'all' };

try {
    if (fs.existsSync(settingsFilePath)) {
        const loaded = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
        appSettings = Object.assign(appSettings, loaded);
    }
} catch (e) {
    console.error('Failed to read settings file:', e);
}

const savedTheme = appSettings.theme || 'orange';
document.body.className = `theme-${savedTheme}`;

// ─── Ses Sentezi (Web Audio API) ─────────────────────────────────────────────
function playSynthSound(type) {
    if (!appSettings.soundAlerts) return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        if (type === 'complete') {
            // Hoş çift tınlama: C5 sonra E5 (baskı tamamlandı)
            const notes = [523.25, 659.25];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.22);
                gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.22);
                gain.gain.linearRampToValueAtTime(0.32, ctx.currentTime + i * 0.22 + 0.04);
                gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.22 + 0.32);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.22);
                osc.stop(ctx.currentTime + i * 0.22 + 0.35);
            });
        } else if (type === 'error') {
            // Üçgen dalga pes tonlu 3 ardışık uyarı (cihaz hatası/shutdown)
            [0, 0.22, 0.44].forEach(offset => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(280, ctx.currentTime + offset);
                osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + offset + 0.15);
                gain.gain.setValueAtTime(0, ctx.currentTime + offset);
                gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + offset + 0.03);
                gain.gain.linearRampToValueAtTime(0, ctx.currentTime + offset + 0.18);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + offset);
                osc.stop(ctx.currentTime + offset + 0.20);
            });
        }
    } catch (e) {
        // Ses çalma desteklenmiyorsa sessizce devam et
    }
}


window.changeTheme = function (themeName) {
    document.body.className = `theme-${themeName}`;

    // Update settings object and save to file
    appSettings.theme = themeName;
    saveAppSettings();

    // Fallback to localStorage
    localStorage.setItem('app-theme', themeName);

    // Update theme card active classes in DOM
    document.querySelectorAll('.theme-card').forEach(card => {
        const cTheme = card.getAttribute('data-theme');
        if (cTheme === themeName) {
            card.classList.add('active');
            const statusEl = card.querySelector('.theme-status');
            if (statusEl) statusEl.innerText = t('settings.active');
        } else {
            card.classList.remove('active');
            const statusEl = card.querySelector('.theme-status');
            if (statusEl) statusEl.innerText = t('settings.select');
        }
    });
    // Dynamically redraw stats chart to update its canvas colors immediately if visible
    const isWorkspaceVisible = workspaceView && !workspaceView.classList.contains('hidden');
    if (isWorkspaceVisible && window._chartJobs && typeof drawStatsChart === 'function') {
        drawStatsChart(window._chartJobs, _currentChartPeriod || '7d');
    }
};

// ─── i18n (loaded via <script src="i18n.js"> in HTML) ────────────────────────
// t(), setLang(), applyTranslations() are globally available

// ─── Settings Helper ──────────────────────────────────────────────────────────
function saveAppSettings() {
    try {
        fs.writeFileSync(settingsFilePath, JSON.stringify(appSettings, null, 2), 'utf8');
    } catch (e) {
        console.error('Failed to save settings file:', e);
    }
}

console.log('Home script loaded');


// ─── Tool Card Launchers ─────────────────────────────────────────────────────

const orcaBtn = document.getElementById('orca-btn');
if (orcaBtn) {
    orcaBtn.addEventListener('click', () => {
        console.log('Launching OrcaSlicer...');
        ipcRenderer.send('launch-app', 'orca-slicer.exe');
    });
}

const laserBtn = document.getElementById('laser-btn');
if (laserBtn) {
    laserBtn.addEventListener('click', () => {
        console.log('Launching LaserGRBL...');
        ipcRenderer.send('launch-laser');
    });
}

const printersBtn = document.getElementById('printers-btn');
if (printersBtn) {
    printersBtn.addEventListener('click', () => {
        console.log('Opening Printers...');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navPrinters = document.getElementById('nav-printers');
        if (navPrinters) navPrinters.classList.add('active');
        showPrinters();
    });
}

const workspaceBtn = document.getElementById('workspace-btn');
if (workspaceBtn) {
    workspaceBtn.addEventListener('click', () => {
        console.log('Opening Workspace...');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navWorkshop = document.getElementById('nav-workshop');
        if (navWorkshop) navWorkshop.classList.add('active');
        showWorkspace();
    });
}

// ─── Nav Active State + Navigation Views ──────────────────────────────────────

const contentArea = document.querySelector('.content-area');
const wikiView = document.getElementById('wiki-view');
const wikiWebview = document.getElementById('wiki-webview');
const printersView = document.getElementById('printers-view');
const projectsView = document.getElementById('projects-view');
const printerHostView = document.getElementById('printer-host-view');
const printerHostWebview = document.getElementById('printer-host-webview');
const printerHostTitle = document.getElementById('printer-host-title');
const detailedAnalysisView = document.getElementById('detailed-analysis-view');
const workspaceView = document.getElementById('workspace-view');
const profileView = document.getElementById('profile-view');
const settingsView = document.getElementById('settings-view');
const sessionStartTime = Date.now();

function releaseAllWebcams() {
    const grid = document.getElementById('printers-grid');
    if (grid) {
        grid.querySelectorAll('.camera-stream-img').forEach(img => {
            try {
                img.src = 'about:blank';
            } catch (e) { }
        });
    }
}

function showDashboard() {
    releaseAllWebcams();
    // Immediately hide all views first
    wikiView.classList.add('hidden');
    printersView.classList.add('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    printerHostView.classList.add('hidden');
    if (detailedAnalysisView) detailedAnalysisView.classList.add('hidden');
    if (workspaceView) workspaceView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    hideNotificationsView();

    // Then show the target view
    contentArea.classList.remove('hidden');
}

function showWiki() {
    releaseAllWebcams();
    // Immediately hide all views first
    contentArea.classList.add('hidden');
    printersView.classList.add('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    printerHostView.classList.add('hidden');
    if (detailedAnalysisView) detailedAnalysisView.classList.add('hidden');
    if (workspaceView) workspaceView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    hideNotificationsView();

    // Then show the target view
    wikiView.classList.remove('hidden');

    // Lazy load the wiki page on first view to make startup/login navigation instant!
    if (wikiWebview && (wikiWebview.src === 'about:blank' || !wikiWebview.src || wikiWebview.getAttribute('src') === 'about:blank')) {
        wikiWebview.src = 'https://wiki.layerstech.website/home/';
    }
}

function showPrinters() {
    // Immediately hide all views first
    contentArea.classList.add('hidden');
    wikiView.classList.add('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    printerHostView.classList.add('hidden');
    if (detailedAnalysisView) detailedAnalysisView.classList.add('hidden');
    if (workspaceView) workspaceView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');

    // Restore last used filters from saved settings
    const savedMode = appSettings.printerModeFilter || 'all';
    const savedStatus = appSettings.printerStatusFilter || 'all';
    currentModeFilter = savedMode;
    currentStatusFilter = savedStatus;
    document.querySelectorAll('.filter-tab-mode').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-mode') === savedMode);
    });
    document.querySelectorAll('.filter-tab-status').forEach(t => {
        t.classList.toggle('active', t.getAttribute('data-status') === savedStatus);
    });

    // Then show the target view
    printersView.classList.remove('hidden');
    hideNotificationsView();
    renderPrinters();
}

function showDetailedAnalysis() {
    contentArea.classList.add('hidden');
    wikiView.classList.add('hidden');
    printersView.classList.add('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    printerHostView.classList.add('hidden');
    if (detailedAnalysisView) detailedAnalysisView.classList.remove('hidden');
    if (workspaceView) workspaceView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    hideNotificationsView();
}

function closeDetailedAnalysis() {
    if (detailedAnalysisView) detailedAnalysisView.classList.add('hidden');
    const analysisModal = document.getElementById('analysis-results-modal');
    if (analysisModal) analysisModal.classList.remove('hidden');
}

function showProjects() {
    releaseAllWebcams();
    // Immediately hide all views first
    contentArea.classList.add('hidden');
    wikiView.classList.add('hidden');
    printersView.classList.add('hidden');
    printerHostView.classList.add('hidden');
    if (detailedAnalysisView) detailedAnalysisView.classList.add('hidden');
    if (workspaceView) workspaceView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    hideNotificationsView();

    // Then show the target view
    if (projectsView) {
        projectsView.classList.remove('hidden');
    }

    // Reset search/filter state
    projectSearchQuery = '';
    projectStatusFilter = 'all';
    projectPrinterFilter = 'all';
    projectsCurrentPage = 1;

    // Reset UI controls
    const searchInput = document.getElementById('projects-search-input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = () => {
            projectSearchQuery = searchInput.value;
            projectsCurrentPage = 1;
            const clearBtn = document.getElementById('projects-search-clear');
            if (clearBtn) clearBtn.classList.toggle('hidden', !searchInput.value);
            renderAllProjects();
        };
    }
    const clearBtn = document.getElementById('projects-search-clear');
    if (clearBtn) {
        clearBtn.classList.add('hidden');
        clearBtn.onclick = () => {
            if (searchInput) searchInput.value = '';
            projectSearchQuery = '';
            projectsCurrentPage = 1;
            clearBtn.classList.add('hidden');
            renderAllProjects();
        };
    }

    // Status chips
    document.querySelectorAll('.proj-chip').forEach(chip => {
        chip.onclick = () => {
            document.querySelectorAll('.proj-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            projectStatusFilter = chip.dataset.projStatus;
            projectsCurrentPage = 1;
            renderAllProjects();
        };
        chip.classList.toggle('active', chip.dataset.projStatus === 'all');
    });

    populateProjectPrinterFilter();
    renderAllProjects();
}


function showPrinterHost(url, printerName) {
    releaseAllWebcams();
    // Immediately hide all views first
    contentArea.classList.add('hidden');
    wikiView.classList.add('hidden');
    printersView.classList.add('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    if (detailedAnalysisView) detailedAnalysisView.classList.add('hidden');
    if (workspaceView) workspaceView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    hideNotificationsView();

    // Then show the target view
    printerHostView.classList.remove('hidden');

    printerHostTitle.innerText = printerName + " - Arayüz";

    let formattedUrl = url;
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'http://' + formattedUrl;
    }
    printerHostWebview.src = formattedUrl;
}

function showWorkspace() {
    releaseAllWebcams();
    // Immediately hide all views first
    contentArea.classList.add('hidden');
    wikiView.classList.add('hidden');
    printersView.classList.add('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    printerHostView.classList.add('hidden');
    if (detailedAnalysisView) detailedAnalysisView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    hideNotificationsView();

    // Then show the target view
    if (workspaceView) {
        workspaceView.classList.remove('hidden');
    }

    // Draw chart immediately from cache to prevent canvas distortion/stretch during network fetch
    if (window._chartJobs && typeof drawStatsChart === 'function') {
        drawStatsChart(window._chartJobs, _currentChartPeriod || '7d');
    }

    loadWorkspaceStats();
}

function showProfile() {
    releaseAllWebcams();
    // Immediately hide all views first
    contentArea.classList.add('hidden');
    wikiView.classList.add('hidden');
    printersView.classList.add('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    printerHostView.classList.add('hidden');
    if (detailedAnalysisView) detailedAnalysisView.classList.add('hidden');
    if (workspaceView) workspaceView.classList.add('hidden');
    if (settingsView) settingsView.classList.add('hidden');
    hideNotificationsView();

    // Then show the target view
    if (profileView) {
        profileView.classList.remove('hidden');
    }
    updateProfileSessionTime();
}

function showSettings() {
    releaseAllWebcams();
    // Immediately hide all views first
    contentArea.classList.add('hidden');
    wikiView.classList.add('hidden');
    printersView.classList.add('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    printerHostView.classList.add('hidden');
    if (detailedAnalysisView) detailedAnalysisView.classList.add('hidden');
    if (workspaceView) workspaceView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');
    hideNotificationsView();

    // Then show the target view
    if (settingsView) {
        settingsView.classList.remove('hidden');
    }

    // Update theme card active styles in settings view
    const currentTheme = appSettings.theme || 'orange';
    document.querySelectorAll('.theme-card').forEach(card => {
        const cTheme = card.getAttribute('data-theme');
        if (cTheme === currentTheme) {
            card.classList.add('active');
            const statusEl = card.querySelector('.theme-status');
            if (statusEl) statusEl.innerText = t('settings.active');
        } else {
            card.classList.remove('active');
            const statusEl = card.querySelector('.theme-status');
            if (statusEl) statusEl.innerText = t('settings.select');
        }
    });

    // ─── Bildirim Toggle'larını Başlat ───────────────────────────────────────
    const webhookToggle = document.getElementById('toggle-webhook-notifs');
    const soundToggle = document.getElementById('toggle-sound-alerts');
    const windowsToggle = document.getElementById('toggle-windows-notifs');

    if (webhookToggle) {
        webhookToggle.checked = appSettings.webhookNotifications !== false;
        // Aynı elementi üst üste dinlemekten kaçın
        webhookToggle.onchange = () => {
            appSettings.webhookNotifications = webhookToggle.checked;
            saveAppSettings();
            // Anında topbar uyarısını güncelle
            if (typeof updateWebhookAlerts === 'function') updateWebhookAlerts();
        };
    }
    if (soundToggle) {
        soundToggle.checked = appSettings.soundAlerts !== false;
        soundToggle.onchange = () => {
            appSettings.soundAlerts = soundToggle.checked;
            saveAppSettings();
            // Sesi test et
            if (soundToggle.checked) playSynthSound('complete');
        };
    }
    if (windowsToggle) {
        windowsToggle.checked = appSettings.windowsNotifications !== false;
        windowsToggle.onchange = () => {
            appSettings.windowsNotifications = windowsToggle.checked;
            saveAppSettings();
        };
    }
    const minimizeToggle = document.getElementById('toggle-minimize-to-tray');
    if (minimizeToggle) {
        minimizeToggle.checked = appSettings.minimizeToTray === true;
        minimizeToggle.onchange = () => {
            appSettings.minimizeToTray = minimizeToggle.checked;
            saveAppSettings();
        };
    }
}


function updateProfileSessionTime() {
    const elapsedMs = Date.now() - sessionStartTime;
    const elapsedMins = Math.floor(elapsedMs / 60000);
    const timeVal = document.getElementById('profile-session-time');
    if (timeVal) {
        if (currentLang === 'tr') {
            timeVal.innerText = elapsedMins > 0 ? `${elapsedMins} dk` : 'Az önce';
        } else {
            timeVal.innerText = elapsedMins > 0 ? `${elapsedMins} min` : 'Just now';
        }
    }
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        if (item.id === 'nav-wiki') {
            showWiki();
        } else if (item.id === 'nav-printers') {
            showPrinters();
        } else if (item.id === 'nav-projects') {
            showProjects();
        } else if (item.id === 'nav-workshop') {
            showWorkspace();
        } else if (item.id === 'nav-profile') {
            showProfile();
        } else if (item.id === 'nav-settings') {
            showSettings();
        } else {
            showDashboard();
        }
    });
});

const viewAllBtn = document.getElementById('view-all-btn');
if (viewAllBtn) {
    viewAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const navProj = document.getElementById('nav-projects');
        if (navProj) navProj.click();
    });
}

// ─── Print Quality Options Navigation ─────────────────────────────────────────
function openWikiUrl(url) {
    if (wikiWebview) {
        wikiWebview.src = url;
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navWiki = document.getElementById('nav-wiki');
    if (navWiki) navWiki.classList.add('active');
    showWiki();
}

const optPressureAdvance = document.getElementById('opt-pressure-advance');
if (optPressureAdvance) {
    optPressureAdvance.addEventListener('click', () => {
        openWikiUrl('https://wiki.layerstech.website/home/print-quality/#pressure-advance');
    });
}

const optFlowRate = document.getElementById('opt-flow-rate');
if (optFlowRate) {
    optFlowRate.addEventListener('click', () => {
        openWikiUrl('https://wiki.layerstech.website/home/print-quality/#flow-rate-extrusion-multiplier');
    });
}

const optVibrationComp = document.getElementById('opt-vibration-comp');
if (optVibrationComp) {
    optVibrationComp.addEventListener('click', () => {
        openWikiUrl('https://wiki.layerstech.website/home/print-quality/#vibration-compensation');
    });
}

// ─── Topbar Global Search ─────────────────────────────────────────────────────
(function initGlobalSearch() {
    const searchInput = document.getElementById('search-input');
    const searchWrap = document.getElementById('search-wrap');
    const resultsBox = document.getElementById('topbar-search-results');
    if (!searchInput || !resultsBox) return;

    function getSearchSources() {
        const items = [];
        // Printers
        printersState.forEach(p => {
            items.push({
                type: 'printer',
                label: p.name,
                sub: p.model || '',
                icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>`,
                action: () => {
                    const navEl = document.getElementById('nav-printers');
                    if (navEl) navEl.click();
                }
            });
        });
        // Projects (real)
        allProjectsState.forEach(p => {
            items.push({
                type: 'project',
                label: p.name,
                sub: p.printerName || '',
                icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>`,
                action: () => {
                    projectSearchQuery = p.name;
                    const navEl = document.getElementById('nav-projects');
                    if (navEl) navEl.click();
                    // Pre-fill projects search too
                    const psi = document.getElementById('projects-search-input');
                    if (psi) { psi.value = p.name; psi.dispatchEvent(new Event('input')); }
                }
            });
        });
        return items;
    }

    function highlight(text, q) {
        if (!q) return text;
        const idx = text.toLowerCase().indexOf(q.toLowerCase());
        if (idx === -1) return text;
        return text.substring(0, idx)
            + `<mark class="proj-highlight">${text.substring(idx, idx + q.length)}</mark>`
            + text.substring(idx + q.length);
    }

    function showResults(q) {
        const trimmed = q.trim();
        if (!trimmed) { closeResults(); return; }
        const sources = getSearchSources();
        const matched = sources.filter(s =>
            s.label.toLowerCase().includes(trimmed.toLowerCase())
        ).slice(0, 8);

        if (matched.length === 0) {
            resultsBox.innerHTML = `<div class="tsearch-empty">${currentLang === 'tr' ? 'Sonuç bulunamadı' : 'No results found'}</div>`;
        } else {
            resultsBox.innerHTML = matched.map((m, i) => `
                <div class="tsearch-item" data-idx="${i}" tabindex="-1">
                    <span class="tsearch-item-icon">${m.icon}</span>
                    <div class="tsearch-item-info">
                        <span class="tsearch-item-label">${highlight(m.label, trimmed)}</span>
                        <span class="tsearch-item-sub">${m.sub}</span>
                    </div>
                    <span class="tsearch-item-type">${m.type === 'printer' ? (currentLang === 'tr' ? 'Yazıcı' : 'Printer') : (currentLang === 'tr' ? 'Proje' : 'Project')}</span>
                </div>
            `).join('');
            resultsBox.querySelectorAll('.tsearch-item').forEach((el, i) => {
                el.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    matched[i].action();
                    searchInput.value = '';
                    closeResults();
                });
            });
        }
        resultsBox.classList.remove('hidden');
    }

    function closeResults() {
        resultsBox.classList.add('hidden');
        resultsBox.innerHTML = '';
    }

    searchInput.addEventListener('input', () => showResults(searchInput.value));
    searchInput.addEventListener('focus', () => { if (searchInput.value) showResults(searchInput.value); });
    searchInput.addEventListener('blur', () => setTimeout(closeResults, 150));
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
            // Navigate to projects view with query applied
            projectSearchQuery = searchInput.value.trim();
            const navEl = document.getElementById('nav-projects');
            if (navEl) navEl.click();
            const psi = document.getElementById('projects-search-input');
            if (psi) { psi.value = projectSearchQuery; psi.dispatchEvent(new Event('input')); }
            searchInput.value = '';
            closeResults();
        } else if (e.key === 'Escape') {
            searchInput.value = '';
            closeResults();
        }
    });
})();



let currentModeFilter = 'all';
let currentStatusFilter = 'all';

function matchesPrinterFilters(p) {
    if (currentModeFilter !== 'all' && p.mode !== currentModeFilter) return false;
    if (currentStatusFilter === 'all') return true;
    if (currentStatusFilter === 'printing') {
        return p.status === 'printing' || p.status === 'paused';
    }
    return p.status === currentStatusFilter;
}

function getPrinterFilterEmptyLabel() {
    const modeLabels = { all: '', lan: 'LAN modundaki ', online: 'Online modundaki ' };
    const statusLabels = {
        all: '',
        printing: 'yazdırılan ',
        idle: 'hazır durumdaki ',
        offline: 'çevrimdışı '
    };
    const mode = modeLabels[currentModeFilter] || '';
    const status = statusLabels[currentStatusFilter] || 'Bu filtreye uygun ';
    if (currentModeFilter === 'all' && currentStatusFilter === 'all') return 'Bu filtreye uygun';
    return (mode + status).trim();
}

const defaultPrinters = [];

let printersState = [];
let printerTotalDurations = {};
let lastTotalDurationUpdate = 0;

async function loadAllPrinterTotalDurations() {
    for (const p of printersState) {
        try {
            const mins = await ipcRenderer.invoke('get-printer-total-duration', p.id);
            printerTotalDurations[p.id] = mins || 0;
        } catch (e) {
            console.error('Failed to get total duration for printer:', p.id, e);
        }
    }
    let grandTotalMins = 0;
    printersState.forEach(p => {
        grandTotalMins += printerTotalDurations[p.id] || 0;
    });
    const el = document.getElementById('stat-total-print-time');
    if (el) el.innerText = formatDuration(grandTotalMins);
}

function getMoonrakerUrl(address, apiPath, extraQuery = '') {
    if (!address) return '';
    let clean = address.trim().replace(/^https?:\/\//i, '');
    const hashIdx = clean.indexOf('#');
    if (hashIdx !== -1) {
        clean = clean.substring(0, hashIdx);
    }
    let hostPart = clean;
    let queryPart = '';
    const questionIdx = clean.indexOf('?');
    if (questionIdx !== -1) {
        hostPart = clean.substring(0, questionIdx);
        queryPart = clean.substring(questionIdx + 1);
    }
    if (hostPart.endsWith('/')) {
        hostPart = hostPart.slice(0, -1);
    }
    if (!hostPart.includes(':') && !hostPart.toLowerCase().startsWith('com') && !hostPart.toLowerCase().startsWith('/dev/')) {
        hostPart = `${hostPart}:7125`;
    }
    let finalQuery = '';
    let queryParams = [];
    if (queryPart) queryParams.push(queryPart);
    if (extraQuery) queryParams.push(extraQuery);
    if (queryParams.length > 0) {
        finalQuery = '?' + queryParams.join('&');
    }
    let cleanPath = apiPath;
    if (cleanPath && !cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
    }
    return `http://${hostPart}${cleanPath}${finalQuery}`;
}

function simulateHwStats(p) {
    const num = parseInt(p.id.replace(/\D/g, ''), 10) || 123;

    // Initialize individually if undefined, null, 0, or NaN
    if (p.cpuUsage === undefined || p.cpuUsage === null || p.cpuUsage === 0 || isNaN(p.cpuUsage)) {
        p.cpuUsage = 8 + (num % 8);
    }
    if (p.ramUsagePct === undefined || p.ramUsagePct === null || p.ramUsagePct === 0 || isNaN(p.ramUsagePct)) {
        p.ramUsagePct = 20 + (num % 15);
    }
    if (p.sdUsagePct === undefined || p.sdUsagePct === null || p.sdUsagePct === 0 || isNaN(p.sdUsagePct)) {
        p.sdUsagePct = 30 + (num % 40);
    }

    // Always ensure minimum healthy values (system isn't dead)
    if (p.cpuUsage < 2) p.cpuUsage = 2 + Math.floor(Math.random() * 3);
    if (p.ramUsagePct < 5) p.ramUsagePct = 15 + Math.floor(Math.random() * 5);
    if (p.sdUsagePct < 5) p.sdUsagePct = 10 + Math.floor(Math.random() * 10);

    // Fluctuate CPU and RAM slightly
    p.cpuUsage = Math.max(2, Math.min(95, Math.round(p.cpuUsage + (Math.random() - 0.5) * 3)));
    p.ramUsagePct = Math.max(10, Math.min(90, Math.round(p.ramUsagePct + (Math.random() - 0.5) * 1.5)));

    // Slowly fluctuate SD Card usage very slightly
    p.sdUsagePct = Math.max(5, Math.min(99, Math.round(p.sdUsagePct + (Math.random() - 0.5) * 0.2)));
}

function loadPrinters() {
    try {
        // Migration from old app path (if exists) to userData path
        if (!fs.existsSync(printersFilePath)) {
            const oldPrintersPath = path.join(__dirname, '../../printers.json');
            if (fs.existsSync(oldPrintersPath)) {
                try {
                    const oldData = fs.readFileSync(oldPrintersPath, 'utf8');
                    fs.writeFileSync(printersFilePath, oldData, 'utf8');
                    console.log('Successfully migrated printers.json to userData:', printersFilePath);
                } catch (migrationErr) {
                    console.error('Failed to migrate old printers file:', migrationErr);
                }
            }
        }

        if (fs.existsSync(printersFilePath)) {
            const data = fs.readFileSync(printersFilePath, 'utf8');
            printersState = JSON.parse(data);
            // Normalize: ensure new fields exist on every loaded printer
            printersState.forEach(p => {
                if (p.mode === undefined) p.mode = 'online';
                if (p.logFolderPath === undefined) p.logFolderPath = '';
            });
            console.log('Loaded printers from file:', printersFilePath);
        } else {
            printersState = JSON.parse(JSON.stringify(defaultPrinters));
            // Apply defaults to initial printers too
            printersState.forEach(p => {
                if (p.mode === undefined) p.mode = 'online';
                if (p.logFolderPath === undefined) p.logFolderPath = '';
            });
            savePrinters();
            console.log('Created and loaded default printers file:', printersFilePath);
        }
    } catch (e) {
        console.error('Failed to read/write printers file, falling back to defaults:', e);
        printersState = JSON.parse(JSON.stringify(defaultPrinters));
    }
}

function savePrinters() {
    try {
        fs.writeFileSync(printersFilePath, JSON.stringify(printersState, null, 4), 'utf8');
        console.log('Saved printers to file:', printersFilePath);
    } catch (e) {
        console.error('Failed to save printers to file:', e);
    }
}

// Initialize printers immediately
loadPrinters();
loadAllPrinterTotalDurations().then(() => renderPrinters());

// ─── NOTIFICATION SYSTEM ────────────────────────────────────────────────────

const NOTIF_STORAGE_KEY = 'layerstech_notifications';
const NOTIF_TYPE_ICONS = {
    start: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    resume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`,
    cancel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    complete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    fail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
};

let notifications = [];
let notifDropdownOpen = false;
let notifHasUnread = false;

// Load persisted notifications
try {
    const stored = localStorage.getItem(NOTIF_STORAGE_KEY);
    if (stored) notifications = JSON.parse(stored);
} catch (e) { }

function saveNotifications() {
    try { localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(notifications.slice(0, 100))); } catch (e) { }
}

function formatNotifTime(ts) {
    const now = Date.now();
    const diff = Math.floor((now - ts) / 1000);
    if (diff < 60) return t('time.just_now');
    if (diff < 3600) return Math.floor(diff / 60) + t('time.minutes_ago');
    if (diff < 86400) return Math.floor(diff / 3600) + t('time.hours_ago');
    return new Date(ts).toLocaleDateString(currentLang === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short' });
}

function addNotification(type, title, message) {
    const notif = { id: Date.now(), type, title, message, ts: Date.now(), unread: true };
    notifications.unshift(notif);
    saveNotifications();
    notifHasUnread = true;

    // ─── Sesli uyarı ────────────────────────────────────────────────────────
    if (type === 'complete') {
        playSynthSound('complete');
    } else if (type === 'cancel' || type === 'error' || type === 'pause') {
        playSynthSound('error');
    }

    // ─── OS Native Bildirim (pencere arka planda/minimize iken) ─────────────
    // complete ve start her zaman gönderilir; error/cancel/pause sadece
    // webhookNotifications açıksa gönderilir. windowsNotifications kapalıysa hiç gönderilmez.
    const isErrorType = (type === 'error' || type === 'cancel' || type === 'pause');
    const sendOsNotif = appSettings.windowsNotifications !== false && (!isErrorType || appSettings.webhookNotifications !== false);
    if (sendOsNotif) {
        try {
            ipcRenderer.send('show-os-notification', {
                title: title || 'Layerstech Studio',
                body: message || '',
                type: type
            });
        } catch (e) { /* IPC hatası sessizce devam */ }
    }

    // ─── Topbar (webhook) bildirim koşulu ───────────────────────────────────
    if (!appSettings.webhookNotifications && isErrorType) {
        // Webhook bildirimleri kapalı: sadece dahili notif listesine ekle, UI'ya taşıma
        return;
    }

    renderNotifications();
    // Auto-refresh the full page if it's visible
    const nv = document.getElementById('notifications-view');
    if (nv && !nv.classList.contains('hidden')) {
        renderNotificationsPage();
    }
}



function renderNotifications() {
    const list = document.getElementById('notif-list');
    const dot = document.getElementById('notif-dot');
    const emptyEl = document.getElementById('notif-empty');
    if (!list) return;

    // Update unread dot visibility
    if (dot) {
        if (notifHasUnread && notifications.length > 0) {
            dot.classList.remove('hidden');
        } else {
            dot.classList.add('hidden');
        }
    }

    // Remove previous items (keep the empty placeholder)
    Array.from(list.querySelectorAll('.notif-item')).forEach(el => el.remove());

    if (notifications.length === 0) {
        if (emptyEl) emptyEl.style.display = '';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    notifications.forEach(n => {
        const icon = NOTIF_TYPE_ICONS[n.type] || NOTIF_TYPE_ICONS.start;
        const item = document.createElement('div');
        item.className = `notif-item notif-type-${n.type}${n.unread ? ' unread' : ''}`;
        item.innerHTML = `
            <div class="notif-icon">${icon}</div>
            <div class="notif-body">
                <div class="notif-body-title">${n.title}</div>
                <div class="notif-body-msg">${n.message}</div>
            </div>
            <div class="notif-time">${formatNotifTime(n.ts)}</div>
        `;
        list.appendChild(item);
    });
}

function openNotifDropdown() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;
    dropdown.classList.remove('hidden');
    notifDropdownOpen = true;
    // Mark all as read
    notifications.forEach(n => n.unread = false);
    notifHasUnread = false;
    saveNotifications();
    renderNotifications();
}

function closeNotifDropdown() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;
    dropdown.classList.add('hidden');
    notifDropdownOpen = false;
}

// Toggle on bell click
const notifBtn = document.getElementById('notification-btn');
if (notifBtn) {
    notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (notifDropdownOpen) closeNotifDropdown();
        else openNotifDropdown();
    });
}

// Printer Warning Dropdown Helpers & Listeners
let printerWarningDropdownOpen = false;

function openPrinterWarningDropdown() {
    const dropdown = document.getElementById('printer-warning-dropdown');
    if (!dropdown) return;
    dropdown.classList.remove('hidden');
    printerWarningDropdownOpen = true;
}

function closePrinterWarningDropdown() {
    const dropdown = document.getElementById('printer-warning-dropdown');
    if (!dropdown) return;
    dropdown.classList.add('hidden');
    printerWarningDropdownOpen = false;
}

const warningBtn = document.getElementById('printer-warning-btn');
if (warningBtn) {
    warningBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (printerWarningDropdownOpen) closePrinterWarningDropdown();
        else openPrinterWarningDropdown();
    });
}

// Close on outside click
document.addEventListener('click', (e) => {
    if (notifDropdownOpen) {
        const wrapper = document.getElementById('notif-wrapper');
        if (wrapper && !wrapper.contains(e.target)) closeNotifDropdown();
    }
    if (printerWarningDropdownOpen) {
        const wrapper = document.getElementById('printer-warning-wrapper');
        if (wrapper && !wrapper.contains(e.target)) closePrinterWarningDropdown();
    }
});

// Clear all button
const notifClearBtn = document.getElementById('notif-clear-btn');
if (notifClearBtn) {
    notifClearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifications = [];
        notifHasUnread = false;
        saveNotifications();
        renderNotifications();
    });
}

// Initial render
renderNotifications();

// ─── NOTIFICATIONS FULL PAGE ─────────────────────────────────────────────────

const notificationsView = document.getElementById('notifications-view');

let notifPageTypeFilter = 'all';
let notifPagePrinterFilter = 'all';

function showNotifications() {
    releaseAllWebcams();
    // Hide all main views
    contentArea.classList.add('hidden');
    wikiView.classList.add('hidden');
    printersView.classList.add('hidden');
    if (projectsView) projectsView.classList.add('hidden');
    printerHostView.classList.add('hidden');
    if (notificationsView) notificationsView.classList.remove('hidden');
    if (workspaceView) workspaceView.classList.add('hidden');
    if (profileView) profileView.classList.add('hidden');
    closeNotifDropdown();
    populateNotifMachineFilters();
    renderNotificationsPage();
}

function hideNotificationsView() {
    if (notificationsView) notificationsView.classList.add('hidden');
}

function populateNotifMachineFilters() {
    const sel = document.getElementById('notif-machine-select');
    if (!sel) return;

    // Extract unique printer names from notifications
    const knownNames = new Set();
    notifications.forEach(n => {
        const colonIdx = n.message ? n.message.indexOf(':') : -1;
        if (colonIdx > 0) knownNames.add(n.message.substring(0, colonIdx).trim());
    });
    // Also add currently loaded printers
    printersState.forEach(p => knownNames.add(p.name));

    // Build options — keep current selection if still valid
    let html = `<option value="all">Tümü</option>`;
    knownNames.forEach(name => {
        const selected = notifPagePrinterFilter === name ? ' selected' : '';
        html += `<option value="${name}"${selected}>${name}</option>`;
    });
    sel.innerHTML = html;

    // Bind change (only once, but rebuilding select so add each time — idempotent via select value)
    sel.onchange = () => {
        notifPagePrinterFilter = sel.value;
        renderNotificationsPage();
    };

    // Restore selected value
    sel.value = notifPagePrinterFilter;
}

function renderNotificationsPage() {
    const list = document.getElementById('notif-full-list');
    if (!list) return;

    // Filter
    let filtered = notifications.filter(n => {
        const typeOk = notifPageTypeFilter === 'all' || n.type === notifPageTypeFilter;
        let printerOk = true;
        if (notifPagePrinterFilter !== 'all') {
            const colonIdx = n.message ? n.message.indexOf(':') : -1;
            const msgPrinter = colonIdx > 0 ? n.message.substring(0, colonIdx).trim() : '';
            printerOk = msgPrinter === notifPagePrinterFilter;
        }
        return typeOk && printerOk;
    });

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="notif-full-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <span>Bu filtre için bildirim bulunmuyor</span>
            </div>
        `;
        return;
    }

    const typeLabels = {
        start: t('notif_label.start'), resume: t('notif_label.resume'), pause: t('notif_label.pause'),
        cancel: t('notif_label.cancel'), complete: t('notif_label.complete'), fail: t('notif_label.fail')
    };

    list.innerHTML = filtered.map(n => {
        const icon = NOTIF_TYPE_ICONS[n.type] || NOTIF_TYPE_ICONS.start;
        const label = typeLabels[n.type] || n.type;
        return `
            <div class="notif-row notif-row-type-${n.type}${n.unread ? ' unread' : ''}">
                <div class="notif-row-icon">${icon}</div>
                <div class="notif-row-body">
                    <div class="notif-row-title">${n.title}</div>
                    <div class="notif-row-msg">${n.message}</div>
                </div>
                <div class="notif-row-meta">
                    <span class="notif-row-time">${formatNotifTime(n.ts)}</span>
                    <span class="notif-row-badge badge-type-${n.type}">${label}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Type chip filter on notifications page
const notifTypeFiltersEl = document.getElementById('notif-type-filters');
if (notifTypeFiltersEl) {
    notifTypeFiltersEl.querySelectorAll('[data-notif-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            notifPageTypeFilter = btn.dataset.notifType;
            notifTypeFiltersEl.querySelectorAll('[data-notif-type]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderNotificationsPage();
        });
    });
}

// "View All" button in dropdown
const notifViewAllBtn = document.getElementById('notif-view-all-btn');
if (notifViewAllBtn) {
    notifViewAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Mark nav items as inactive (no nav item represents this view)
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        showNotifications();
    });
}

// Clear all on notifications page
const notifClearPageBtn = document.getElementById('notif-clear-all-page-btn');
if (notifClearPageBtn) {
    notifClearPageBtn.addEventListener('click', () => {
        notifications = [];
        notifHasUnread = false;
        saveNotifications();
        renderNotifications();
        renderNotificationsPage();
        populateNotifMachineFilters();
    });
}

// ─── PRINTER STATUS SNAPSHOT (for change detection) ─────────────────────────
// Stores last known status+file per printer id so we can detect transitions
const printerStatusSnapshot = {};

function markPrintSessionCancelled(printer, file, progressPct) {
    const snap = printerStatusSnapshot[printer.id];
    let statsSuffix = '';
    if (snap) {
        const pMins = Math.round((snap.lastPrintDuration || 0) / 60);
        const tMins = Math.round((snap.lastTotalDuration || 0) / 60);

        if (snap.lastPrintDuration > 0) {
            statsSuffix += ` - PrintTime: ${pMins} dk (${Math.round(snap.lastPrintDuration)} sn) - TotalTime: ${tMins} dk (${Math.round(snap.lastTotalDuration)} sn)`;
        }
    }
    logPrinterEvent(printer, 'status', `Baskı İptal Edildi - Dosya: ${file} (%${Math.round(progressPct)})${statsSuffix}`);
    if (snap) {
        snap.status = 'idle';
        snap.file = '-';
        snap.progress = 0;
        snap.lastLoggedProgress = -1;
        snap.pendingNewPrint = true;
        snap.initialized = true;

        snap.lastPrintDuration = 0;
        snap.lastTotalDuration = 0;
    }
}

function markPrintSessionCompleted(printer, file, progressPct) {
    const snap = printerStatusSnapshot[printer.id];
    let statsSuffix = '';
    if (snap) {
        const pMins = Math.round((snap.lastPrintDuration || 0) / 60);
        const tMins = Math.round((snap.lastTotalDuration || 0) / 60);

        if (snap.lastPrintDuration > 0) {
            statsSuffix += ` - PrintTime: ${pMins} dk (${Math.round(snap.lastPrintDuration)} sn) - TotalTime: ${tMins} dk (${Math.round(snap.lastTotalDuration)} sn)`;
        }
    }
    logPrinterEvent(printer, 'status', `Baskı Tamamlandı - Dosya: ${file} (%${Math.round(progressPct)})${statsSuffix}`);
    if (snap) {
        snap.status = 'idle';
        snap.file = '-';
        snap.progress = 0;
        snap.lastLoggedProgress = -1;
        snap.pendingNewPrint = false;
        snap.initialized = true;

        snap.lastPrintDuration = 0;
        snap.lastTotalDuration = 0;
    }
}

function handlePrintStartTransition(printer, snap, prevStatus, curFile, isResume) {
    if (isResume) {
        addNotification('resume', 'Baskı Sürdürüldü', `${printer.name}: ${curFile}`);
        logPrinterEvent(printer, 'status', `Baskı Sürdürüldü - Dosya: ${curFile}`);
    } else {
        snap.pendingNewPrint = false;
        snap.lastLoggedProgress = -1;
        addNotification('start', 'Baskı Başladı', `${printer.name}: ${curFile}`);
        logPrinterEvent(printer, 'status', `Baskı Başladı - Dosya: ${curFile}`);
    }
}

const renderTempControl = (id, heaterKey, current, target) => {
    if (current === null || current === undefined) {
        return `<span class="detail-value">-</span>`;
    }

    const inputId = `temp-input-${heaterKey}-${id}`;
    const activeEl = document.activeElement;
    const isFocused = activeEl && activeEl.id === inputId;
    const displayTarget = isFocused ? activeEl.value : (target !== null && target !== undefined ? Math.round(target) : 0);

    return `
        <div class="temp-control-row">
            <span class="temp-current" id="temp-current-${heaterKey}-${id}">${Math.round(current)}°C</span>
            <span class="temp-slash">/</span>
            <input type="number" class="temp-input" id="${inputId}" min="0" max="300" value="${displayTarget}"
                onkeydown="if(event.key==='Enter') { this.blur(); setTargetTemp('${id}', '${heaterKey}', this.value); }"
                onblur="setTargetTemp('${id}', '${heaterKey}', this.value)">
        </div>
    `;
};

const renderEnvControl = (id, heaterKey, current, target, availableObjects) => {
    if (current === null || current === undefined) {
        return `<span class="detail-value">-</span>`;
    }

    const isHeater = availableObjects && availableObjects.includes('heater_generic Env_heater');
    if (!isHeater) {
        return `
            <div class="temp-control-row">
                <span class="temp-current" id="temp-current-${heaterKey}-${id}">${Math.round(current)}°C</span>
            </div>
        `;
    }

    const inputId = `temp-input-${heaterKey}-${id}`;
    const activeEl = document.activeElement;
    const isFocused = activeEl && activeEl.id === inputId;
    const displayTarget = isFocused ? activeEl.value : (target !== null && target !== undefined ? Math.round(target) : 0);

    return `
        <div class="temp-control-row">
            <span class="temp-current" id="temp-current-${heaterKey}-${id}">${Math.round(current)}°C</span>
            <span class="temp-slash">/</span>
            <input type="number" class="temp-input" id="${inputId}" min="0" max="100" value="${displayTarget}"
                onkeydown="if(event.key==='Enter') { this.blur(); setTargetTemp('${id}', '${heaterKey}', this.value); }"
                onblur="setTargetTemp('${id}', '${heaterKey}', this.value)">
        </div>
    `;
};

// ─── WEBCAM STREAM UTILITIES & ANIMATIONS ────────────────────────────────────

function getWebcamAbsoluteUrl(printerAddress, streamUrl) {
    if (!streamUrl) return '';
    if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
        return streamUrl;
    }
    if (streamUrl.startsWith('//')) {
        return 'http:' + streamUrl;
    }
    // Extract host/ip
    let cleanAddress = printerAddress.replace(/^(https?:\/\/)/i, '');
    let host = cleanAddress.split(':')[0];
    const slash = streamUrl.startsWith('/') ? '' : '/';
    return `http://${host}${slash}${streamUrl}`;
}

window.handleCameraError = function (printerId, imgEl) {
    imgEl.style.display = 'none';
    const fallbackEl = document.getElementById(`camera-fallback-${printerId}`);
    if (fallbackEl) {
        fallbackEl.classList.remove('hidden');
    }
};

window.handleCameraLoad = function (printerId, imgEl) {
    imgEl.style.display = 'block';
    const fallbackEl = document.getElementById(`camera-fallback-${printerId}`);
    if (fallbackEl) {
        fallbackEl.classList.add('hidden');
    }
};

window.changeSelectedWebcam = function (printerId, webcamName) {
    const p = printersState.find(x => x.id === printerId);
    if (p) {
        p.selectedWebcamName = webcamName;
        savePrinters();
        renderPrinters();
    }
};

// Canvas Mock Webcam Animation State
const mockWebcamStates = {};

function drawMockWebcam(p, canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    if (!mockWebcamStates[p.id]) {
        mockWebcamStates[p.id] = {
            nozzleX: w / 2,
            nozzleY: h / 2,
            targetX: w / 2,
            targetY: h / 2,
            printLines: [],
            progress: 0,
            layer: 1
        };
    }

    const state = mockWebcamStates[p.id];

    // Clear background (dark theme CRT/grid style)
    ctx.fillStyle = '#0f1115';
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 107, 0, 0.03)';
    ctx.lineWidth = 1;
    const gridSpacing = 20;
    for (let x = 0; x < w; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Draw 3D bed outline in perspective
    ctx.strokeStyle = 'rgba(255, 107, 0, 0.1)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, h - 30);
    ctx.lineTo(w - 40, h - 30);
    ctx.lineTo(w - 70, 40);
    ctx.lineTo(70, 40);
    ctx.closePath();
    ctx.stroke();

    const isPrinting = p.status === 'printing';

    if (isPrinting) {
        const dx = state.targetX - state.nozzleX;
        const dy = state.targetY - state.nozzleY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 4) {
            state.targetX = 60 + Math.random() * (w - 120);
            state.targetY = 50 + Math.random() * (h - 90);

            state.printLines.push({
                x1: state.nozzleX,
                y1: state.nozzleY,
                x2: state.targetX,
                y2: state.targetY,
                color: `hsla(${15 + state.layer * 12}, 90%, 55%, 0.6)`
            });
            if (state.printLines.length > 50) {
                state.printLines.shift();
            }

            if (Math.random() < 0.05) {
                state.layer = (state.layer % 5) + 1;
            }
        } else {
            const speed = 5;
            state.nozzleX += (dx / dist) * speed;
            state.nozzleY += (dy / dist) * speed;
        }
    } else {
        state.targetX = w / 2;
        state.targetY = h / 2;
        const dx = state.targetX - state.nozzleX;
        const dy = state.targetY - state.nozzleY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
            state.nozzleX += (dx / dist) * 2;
            state.nozzleY += (dy / dist) * 2;
        }
        if (state.printLines.length > 0 && Math.random() < 0.1) {
            state.printLines.shift();
        }
    }

    // Draw printed lines
    ctx.lineWidth = 2;
    for (const line of state.printLines) {
        ctx.strokeStyle = line.color;
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
    }

    // Draw printing nozzle/head representation
    ctx.fillStyle = '#4a4e59';
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(state.nozzleX, state.nozzleY);
    ctx.lineTo(state.nozzleX - 7, state.nozzleY - 14);
    ctx.lineTo(state.nozzleX + 7, state.nozzleY - 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff6b00';
    ctx.fillRect(state.nozzleX - 10, state.nozzleY - 22, 20, 8);
    ctx.strokeRect(state.nozzleX - 10, state.nozzleY - 22, 20, 8);

    if (isPrinting) {
        ctx.fillStyle = 'rgba(255, 107, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(state.nozzleX, state.nozzleY, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    // REC icon & Overlay text
    const isRecOn = Math.floor(Date.now() / 600) % 2 === 0;
    if (isPrinting && isRecOn) {
        ctx.fillStyle = '#ef476f';
        ctx.beginPath();
        ctx.arc(18, 20, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8.5px monospace';
        ctx.fillText('REC', 26, 23);
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '8px monospace';
    ctx.fillText(`CAM: ${p.name.toUpperCase()}`, 15, h - 15);

    let speedText = `SPD: ${p.speed || 0}mm/s`;
    let tempText = `T0: ${p.t0Temp ? Math.round(p.t0Temp) : 0}°C`;
    ctx.fillText(`${speedText} | ${tempText}`, w - 110, h - 15);

    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const dateString = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    ctx.fillText(dateString, w - 110, 23);

    // CRT scanline effect
    ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
    for (let y = 0; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1);
    }
}

function animateMockWebcams() {
    const canvases = document.querySelectorAll('.mock-camera-canvas');
    canvases.forEach(canvas => {
        const printerId = canvas.getAttribute('data-printer-id');
        const p = printersState.find(x => x.id === printerId);
        if (p) {
            drawMockWebcam(p, canvas);
        }
    });
    requestAnimationFrame(animateMockWebcams);
}

// Start simulation loop once
if (!window.mockWebcamAnimationStarted) {
    window.mockWebcamAnimationStarted = true;
    requestAnimationFrame(animateMockWebcams);
}

function renderPrinters() {

    const activeId = document.activeElement ? document.activeElement.id : null;
    const selectionStart = document.activeElement ? document.activeElement.selectionStart : null;
    const selectionEnd = document.activeElement ? document.activeElement.selectionEnd : null;

    const grid = document.getElementById('printers-grid');
    if (!grid) return;

    // Release MJPEG streams to prevent Chromium socket starvation/exhaustion
    grid.querySelectorAll('.camera-stream-img').forEach(img => {
        try {
            img.src = 'about:blank';
        } catch (e) { }
    });

    const filtered = printersState.filter(matchesPrinterFilters);

    if (filtered.length === 0) {
        if (printersState.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; text-align: center; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 12px; color: var(--text-muted, #888);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.6; color: var(--accent);">
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                        <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/>
                        <rect x="6" y="14" width="12" height="8" rx="1"/>
                    </svg>
                    <h3 style="font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 8px;">Kayıtlı Yazıcı Bulunmuyor</h3>
                    <p style="font-size: 13px; max-width: 320px; margin-bottom: 20px; line-height: 1.5; color: var(--text-muted);">Yazıcı durumlarını izlemek ve kontrol etmek için ilk yazıcınızı ekleyin.</p>
                    <button class="btn-add-printer" style="width: auto; padding: 10px 18px;" onclick="document.getElementById('open-add-modal-btn').click()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>Yeni Yazıcı Ekle
                    </button>
                </div>
            `;
        } else {
            const filterLabel = getPrinterFilterEmptyLabel();
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; text-align: center; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 12px; color: var(--text-muted, #888);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; opacity: 0.6;">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <h3 style="font-size: 16px; font-weight: 600; color: #fff; margin-bottom: 8px;">Sonuç Bulunamadı</h3>
                    <p style="font-size: 13px; max-width: 320px; line-height: 1.5; color: var(--text-muted);">${filterLabel} yazıcı bulunmamaktadır.</p>
                </div>
            `;
        }
    } else {
        grid.innerHTML = filtered.map(p => {
            const isPrinting = p.status === 'printing';
            const isPaused = p.status === 'paused';
            const isIdle = p.status === 'idle';
            const isOffline = p.status === 'offline';
            const isConnecting = p.status === 'connecting';
            const isLan = p.mode === 'lan';
            const lanButtonHtml = isLan ? `
                <button class="btn-printer-action" style="flex: 1; background: rgba(255, 107, 0, 0.12); color: var(--accent); border: 1px solid rgba(255, 107, 0, 0.3);" onclick="analyzeLanLogs('${p.id}')" title="LAN Loglarını Analiz Et">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg> Analiz Et
                </button>
                <button class="btn-printer-action" style="flex: 1; background: rgba(46, 196, 182, 0.08); color: #2ec4b6; border: 1px solid rgba(46, 196, 182, 0.25);" onclick="showAnalysisResults('${p.id}')" title="Analiz Raporunu Gör">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg> Raporu Gör
                </button>
            ` : '';

            let statusText = t('status.offline');
            let badgeClass = 'offline';
            if (isPrinting) {
                statusText = t('status.printing');
                badgeClass = 'printing';
            } else if (isPaused) {
                statusText = t('status.paused');
                badgeClass = 'paused';
            } else if (isIdle) {
                statusText = t('status.idle');
                badgeClass = 'idle';
            } else if (isConnecting) {
                statusText = t('status.connecting');
                badgeClass = 'connecting';
            }

            let progressHtml = '';
            if (isPrinting || isPaused) {
                progressHtml = `
                    <div class="printer-progress-section">
                        <div class="printer-progress-text">
                            <span id="progress-file-${p.id}" style="font-weight: 500; font-size:11.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;" title="${p.file}">${p.file}</span>
                            <strong id="progress-pct-${p.id}">%${Math.round(p.progress)}</strong>
                        </div>
                        <div class="progress-track">
                            <div id="progress-fill-${p.id}" class="progress-fill" style="width: ${p.progress}%; background: var(--accent); box-shadow: 0 0 8px var(--accent);"></div>
                        </div>
                        <div style="font-size: 11px; color: var(--text-muted); display: flex; justify-content: space-between; margin-top: 2px;">
                            <span id="progress-time-${p.id}">${t('printer.remaining')}: ${p.remainingTime}</span>
                            <span id="progress-speed-${p.id}">${t('printer.speed')}: ${p.speed} mm/s · ${t('printer.flow')}: ${(p.flow || 0).toFixed(2)} mm³/s</span>
                        </div>
                    </div>
                `;
            }

            let detailsHtml = '';
            if (p.uploading) {
                detailsHtml = `
                    <div class="upload-progress-container" id="upload-container-${p.id}">
                        <div style="display:flex; justify-content:space-between; font-weight:600; font-family:'Outfit', sans-serif; margin-bottom: 4px;">
                            <span>${currentLang === 'tr' ? 'G-code Dosyası Yüklüyor...' : 'Uploading G-code File...'}</span>
                            <span id="upload-pct-${p.id}">%${p.uploadProgress || 0}</span>
                        </div>
                        <div class="upload-progress-bar-wrap">
                            <div id="upload-fill-${p.id}" class="upload-progress-bar-fill" style="width: ${p.uploadProgress || 0}%"></div>
                        </div>
                    </div>
                `;
            } else if (!isOffline && !isConnecting) {
                detailsHtml = `
                    <div class="printer-details-grid" style="grid-template-columns: repeat(3, 1fr); gap: 6px;">
                        <div class="detail-item">
                            <span class="detail-label">T0 (Kafa 1)</span>
                            <span class="detail-value" id="temp-t0-${p.id}">${renderTempControl(p.id, 't0', p.t0Temp, p.targetT0Temp)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">T1 (Kafa 2)</span>
                            <span class="detail-value" id="temp-t1-${p.id}">${renderTempControl(p.id, 't1', p.t1Temp, p.targetT1Temp)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">T2 (Kafa 3)</span>
                            <span class="detail-value" id="temp-t2-${p.id}">${renderTempControl(p.id, 't2', p.t2Temp, p.targetT2Temp)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">T3 (Kafa 4)</span>
                            <span class="detail-value" id="temp-t3-${p.id}">${renderTempControl(p.id, 't3', p.t3Temp, p.targetT3Temp)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">BED (Yatak)</span>
                            <span class="detail-value" id="temp-bed-${p.id}">${renderTempControl(p.id, 'bed', p.bedTemp, p.targetBedTemp)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">ENV (Ortam)</span>
                            <span class="detail-value" id="temp-env-${p.id}">${renderEnvControl(p.id, 'env', p.envTemp, p.targetEnvTemp, p.availableObjects)}</span>
                        </div>
                    </div>
                    <div class="printer-hw-stats">
                        <div class="hw-item">
                            <span class="hw-label">CPU</span>
                            <div class="hw-bar-wrap">
                                <div class="hw-bar cpu" id="hw-cpu-bar-${p.id}" style="width: ${p.cpuUsage || 12}%;"></div>
                            </div>
                            <span class="hw-value" id="hw-cpu-val-${p.id}">${p.cpuUsage || 12}%</span>
                        </div>
                        <div class="hw-item">
                            <span class="hw-label">RAM</span>
                            <div class="hw-bar-wrap">
                                <div class="hw-bar ram" id="hw-ram-bar-${p.id}" style="width: ${p.ramUsagePct || 24}%;"></div>
                            </div>
                            <span class="hw-value" id="hw-ram-val-${p.id}">${p.ramUsagePct || 24}%</span>
                        </div>
                        <div class="hw-item">
                            <span class="hw-label" data-i18n="printer.sd_card">SD KART</span>
                            <div class="hw-bar-wrap">
                                <div class="hw-bar sd" id="hw-sd-bar-${p.id}" style="width: ${p.sdUsagePct || 42}%;"></div>
                            </div>
                            <span class="hw-value" id="hw-sd-val-${p.id}">${p.sdUsagePct || 42}%</span>
                        </div>
                    </div>
                `;
            } else if (isConnecting) {
                detailsHtml = `
                    <div style="text-align: center; color: var(--text-muted); padding: 12px; font-size: 12px; background: var(--surface-2); border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-weight: 500;">
                        ${t('printer.connecting_msg')} (${p.address || 'Serial'})...
                    </div>
                `;
            } else {
                detailsHtml = `
                    <div style="text-align: center; color: var(--text-light); padding: 12px; font-size: 12px; background: var(--surface-2); border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-weight: 500;">
                        ${t('printer.disconnected')}
                    </div>
                `;
            }

            let actionsHtml = '';
            if (isPrinting) {
                actionsHtml = `
                    <div class="printer-actions">
                        <button class="btn-printer-action btn-printer-primary" onclick="togglePausePrinter('${p.id}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                            </svg> ${t('printer.pause')}
                        </button>
                        <button class="btn-printer-action" onclick="goToPrinterWebUI('${p.id}')" title="Go Host">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                            </svg> ${t('printer.go_host')}
                        </button>
                        ${lanButtonHtml}
                        <button class="btn-printer-action btn-printer-danger" onclick="stopPrinter('${p.id}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="4" y="4" width="16" height="16"/>
                            </svg> ${t('printer.cancel')}
                        </button>
                    </div>
                `;
            } else if (isPaused) {
                actionsHtml = `
                    <div class="printer-actions">
                        <button class="btn-printer-action btn-printer-primary" onclick="resumePrinter('${p.id}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg> ${t('printer.resume')}
                        </button>
                        <button class="btn-printer-action" onclick="goToPrinterWebUI('${p.id}')" title="Go Host">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                            </svg> ${t('printer.go_host')}
                        </button>
                        ${lanButtonHtml}
                        <button class="btn-printer-action btn-printer-danger" onclick="stopPrinter('${p.id}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="4" y="4" width="16" height="16"/>
                            </svg> ${t('printer.cancel')}
                        </button>
                    </div>
                `;
            } else if (isIdle) {
                actionsHtml = `
                    <div class="printer-actions">
                        <button class="btn-printer-action" style="flex:2" onclick="goToPrinterWebUI('${p.id}')" title="Arayüze Git (Go Host)">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                            </svg> ${t('printer.go_host')}
                        </button>
                        ${lanButtonHtml}
                        <button class="btn-printer-action btn-printer-danger" style="flex:1" onclick="deletePrinter('${p.id}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg> ${t('printer.delete')}
                        </button>
                    </div>
                `;
            } else if (isConnecting) {
                actionsHtml = `
                    <div class="printer-actions">
                        <button class="btn-printer-action" style="flex:1" disabled>
                            ${t('printer.wait')}
                        </button>
                    </div>
                `;
            } else {
                actionsHtml = `
                    <div class="printer-actions">
                        <button class="btn-printer-action btn-printer-primary" style="flex:2" onclick="connectPrinter('${p.id}')">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>
                            </svg> ${t('printer.connect')}
                        </button>
                        ${lanButtonHtml}
                        <button class="btn-printer-action btn-printer-danger" style="flex:1" onclick="deletePrinter('${p.id}')" title="Yazıcıyı Sil">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg> ${t('printer.delete')}
                        </button>
                    </div>
                `;
            }

            let cameraHtml = '';
            if (!isOffline && !isConnecting) {
                const webcams = p.webcams || [];
                const hasWebcams = webcams.length > 0;
                let streamUrl = '';
                let webcamSelectorHtml = '';

                if (hasWebcams) {
                    const selectedWebcam = webcams.find(w => w.name === p.selectedWebcamName) || webcams[0];
                    streamUrl = getWebcamAbsoluteUrl(p.address, selectedWebcam.stream_url);

                    const optionsHtml = webcams.map(w => `
                        <option value="${w.name}" ${w.name === p.selectedWebcamName ? 'selected' : ''}>${w.name}</option>
                    `).join('');

                    webcamSelectorHtml = `
                        <div class="camera-selector-wrap" onclick="event.stopPropagation()">
                            <span class="camera-selector-label">${t('printer.camera_select')}</span>
                            <select class="camera-select" onchange="changeSelectedWebcam('${p.id}', this.value)">
                                ${optionsHtml}
                            </select>
                        </div>
                    `;
                } else {
                    if (!p.address) {
                        streamUrl = 'mock';
                        webcamSelectorHtml = `
                            <div class="camera-selector-wrap">
                                <span class="camera-selector-badge">${t('printer.mock_camera')}</span>
                            </div>
                        `;
                    } else {
                        streamUrl = getWebcamAbsoluteUrl(p.address, '/webcam/?action=stream');
                    }
                }

                let mediaHtml = '';
                if (streamUrl === 'mock') {
                    mediaHtml = `<canvas class="mock-camera-canvas" data-printer-id="${p.id}" width="320" height="180" style="width:100%; height:100%; object-fit:cover; display:block; border-radius: var(--radius-sm);"></canvas>`;
                } else {
                    mediaHtml = `
                        <img class="camera-stream-img" src="${streamUrl}" 
                             onerror="handleCameraError('${p.id}', this)" 
                             onload="handleCameraLoad('${p.id}', this)"
                             style="width: 100%; height: 100%; object-fit: cover; display: block; border-radius: var(--radius-sm);">
                        <div class="camera-fallback-msg hidden" id="camera-fallback-${p.id}">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 6px; opacity: 0.6; color: var(--text-muted);">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                <circle cx="12" cy="13" r="4"/>
                                <line x1="1" y1="1" x2="23" y2="23"/>
                            </svg>
                            <span>${t('printer.no_camera')}</span>
                        </div>
                    `;
                }

                cameraHtml = `
                    <div class="printer-camera-section">
                        <div class="camera-section-header">
                            <span class="camera-title-wrap">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="camera-icon-svg">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                    <circle cx="12" cy="13" r="4"/>
                                </svg>
                                <span>CAM</span>
                            </span>
                            ${webcamSelectorHtml}
                        </div>
                        <div class="printer-camera-container" id="camera-container-${p.id}">
                            ${mediaHtml}
                        </div>
                    </div>
                `;
            }

            return `
                <div class="printer-card" data-id="${p.id}">
                    <div class="printer-card-header">
                        <div style="flex: 1; min-width: 0;">
                            <h4 class="printer-card-title">
                                ${p.name}
                                <span class="edit-printer-btn" onclick="openEditPrinterModal('${p.id}')" title="Yazıcıyı Düzenle" style="cursor: pointer; margin-left: 6px; color: var(--text-muted); opacity: 0.7; transition: opacity 0.15s, color 0.15s; display: inline-flex; align-items: center; vertical-align: middle;">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1"/>
                                    </svg>
                                </span>
                            </h4>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px; gap: 8px; flex-wrap: wrap;">
                                <span class="printer-card-model">
                                    ${p.model} ${p.address ? `· <span style="color: var(--accent); cursor: pointer; text-decoration: underline; font-weight: 500;" onclick="goToPrinterWebUI('${p.id}')" title="Arayüze Git (Go Host)">${p.address} ↗</span>` : ''}
                                    ${printerTotalDurations[p.id] ? ` · ⏱️ ${formatDuration(printerTotalDurations[p.id])}` : ''}
                                </span>
                                <span class="printer-mode-badge ${isLan ? 'mode-lan' : 'mode-online'}" onclick="openEditPrinterModal('${p.id}')" title="${isLan ? 'LAN Modu - Düzenlemek için tıklayın' : 'Online Modu - Düzenlemek için tıklayın'}" style="cursor:pointer;">
                                    ${isLan
                    ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg> LAN`
                    : `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> Online`
                }
                                </span>
                            </div>
                        </div>
                        <span class="printer-status-badge ${badgeClass}" style="margin-left: 10px;">
                            <span class="stat-dot ${isPrinting ? 'orange pulsing' : isPaused ? 'orange' : isIdle ? 'green' : isConnecting ? 'blue pulsing' : 'gray'}"></span>
                            ${statusText}
                        </span>
                    </div>
                    
                    ${progressHtml}
                    
                    ${detailsHtml}
                    
                    ${cameraHtml}
                    
                    ${actionsHtml}
                </div>
            `;

        }).join('');
    }

    const totalPrinters = printersState.length;
    const activePrinters = printersState.filter(p => p.status === 'printing' || p.status === 'paused').length;
    const idlePrinters = printersState.filter(p => p.status === 'idle').length;
    const offlinePrinters = printersState.filter(p => p.status === 'offline').length;

    document.getElementById('stat-total-printers').innerText = totalPrinters;
    document.getElementById('stat-active-printers').innerText = activePrinters;
    document.getElementById('stat-idle-printers').innerText = idlePrinters;
    document.getElementById('stat-offline-printers').innerText = offlinePrinters;

    let grandTotalMins = 0;
    printersState.forEach(p => {
        grandTotalMins += printerTotalDurations[p.id] || 0;
    });
    const totalTimeEl = document.getElementById('stat-total-print-time');
    if (totalTimeEl) totalTimeEl.innerText = formatDuration(grandTotalMins);

    // Restore active element focus and selection
    if (activeId) {
        const el = document.getElementById(activeId);
        if (el) {
            el.focus();
            if (selectionStart !== null && selectionEnd !== null) {
                try {
                    el.setSelectionRange(selectionStart, selectionEnd);
                } catch (e) { }
            }
        }
    }
}

function updatePrinterDom(p) {
    // 1. Update progress elements if status is 'printing' or 'paused'
    if (p.status === 'printing' || p.status === 'paused') {
        const fileEl = document.getElementById(`progress-file-${p.id}`);
        const pctEl = document.getElementById(`progress-pct-${p.id}`);
        const fillEl = document.getElementById(`progress-fill-${p.id}`);
        const timeEl = document.getElementById(`progress-time-${p.id}`);
        const speedEl = document.getElementById(`progress-speed-${p.id}`);

        const roundedPct = Math.round(p.progress);
        if (fileEl && fileEl.innerText !== p.file) {
            fileEl.innerText = p.file;
            fileEl.title = p.file;
        }
        if (pctEl) {
            pctEl.innerText = `%${roundedPct}`;
        }
        if (fillEl) {
            fillEl.style.width = `${p.progress}%`;
        }
        if (timeEl) {
            timeEl.innerText = `${t('printer.remaining')}: ${p.remainingTime}`;
        }
        if (speedEl) {
            speedEl.innerText = `${t('printer.speed')}: ${p.speed} mm/s · ${t('printer.flow')}: ${(p.flow || 0).toFixed(2)} mm³/s`;
        }
    }

    // 2. Update temperatures
    const heaterKeys = ['t0', 't1', 't2', 't3', 'bed', 'env'];
    for (const key of heaterKeys) {
        const propName = key === 't0' ? 't0Temp' :
            key === 't1' ? 't1Temp' :
                key === 't2' ? 't2Temp' :
                    key === 't3' ? 't3Temp' :
                        key === 'bed' ? 'bedTemp' : 'envTemp';
        const targetPropName = key === 't0' ? 'targetT0Temp' :
            key === 't1' ? 'targetT1Temp' :
                key === 't2' ? 'targetT2Temp' :
                    key === 't3' ? 'targetT3Temp' :
                        key === 'bed' ? 'targetBedTemp' : 'targetEnvTemp';

        const currentVal = p[propName];
        const targetVal = p[targetPropName];

        // Update current temperature text
        const curEl = document.getElementById(`temp-current-${key}-${p.id}`);
        if (curEl && currentVal !== null && currentVal !== undefined) {
            const newText = `${Math.round(currentVal)}°C`;
            if (curEl.innerText !== newText) {
                curEl.innerText = newText;
            }
        }

        // Update target input value
        const inputId = `temp-input-${key}-${p.id}`;
        const inputEl = document.getElementById(inputId);
        if (inputEl) {
            if (document.activeElement !== inputEl) {
                const roundedTarget = targetVal !== null && targetVal !== undefined ? Math.round(targetVal) : 0;
                if (parseInt(inputEl.value, 10) !== roundedTarget) {
                    inputEl.value = roundedTarget;
                }
            }
        }
    }

    // 3. Update hardware resources
    if (p.status !== 'offline' && p.status !== 'connecting') {
        const cpuBar = document.getElementById(`hw-cpu-bar-${p.id}`);
        const cpuVal = document.getElementById(`hw-cpu-val-${p.id}`);
        const ramBar = document.getElementById(`hw-ram-bar-${p.id}`);
        const ramVal = document.getElementById(`hw-ram-val-${p.id}`);
        const sdBar = document.getElementById(`hw-sd-bar-${p.id}`);
        const sdVal = document.getElementById(`hw-sd-val-${p.id}`);

        const cpuPct = (typeof p.cpuUsage === 'number' && !isNaN(p.cpuUsage)) ? Math.round(p.cpuUsage) : 0;
        const ramPct = (typeof p.ramUsagePct === 'number' && !isNaN(p.ramUsagePct)) ? Math.round(p.ramUsagePct) : 0;
        const sdPct = (typeof p.sdUsagePct === 'number' && !isNaN(p.sdUsagePct)) ? Math.round(p.sdUsagePct) : 0;

        if (cpuBar) cpuBar.style.width = `${cpuPct}%`;
        if (cpuVal) cpuVal.innerText = `${cpuPct}%`;
        if (ramBar) ramBar.style.width = `${ramPct}%`;
        if (ramVal) ramVal.innerText = `${ramPct}%`;
        if (sdBar) sdBar.style.width = `${sdPct}%`;
        if (sdVal) sdVal.innerText = `${sdPct}%`;
    }
}

// Window actions for HTML event triggers
window.setTargetTemp = async function (printerId, heaterKey, value) {
    const p = printersState.find(x => x.id === printerId);
    if (!p) return;

    const numVal = parseInt(value, 10);
    if (isNaN(numVal) || numVal < 0) return;

    // Update local state first (simulation fallback and quick UI update)
    if (heaterKey === 't0') p.targetT0Temp = numVal;
    else if (heaterKey === 't1') p.targetT1Temp = numVal;
    else if (heaterKey === 't2') p.targetT2Temp = numVal;
    else if (heaterKey === 't3') p.targetT3Temp = numVal;
    else if (heaterKey === 'bed') p.targetBedTemp = numVal;
    else if (heaterKey === 'env') p.targetEnvTemp = numVal;

    savePrinters();

    // If connected to real Klipper/Moonraker, send the command
    if (p.status !== 'offline' && p.status !== 'connecting' && p.address) {
        let gcodeCmd = '';
        if (heaterKey === 't0') gcodeCmd = `SET_HEATER_TEMPERATURE HEATER=extruder TARGET=${numVal}`;
        else if (heaterKey === 't1') gcodeCmd = `SET_HEATER_TEMPERATURE HEATER=extruder1 TARGET=${numVal}`;
        else if (heaterKey === 't2') gcodeCmd = `SET_HEATER_TEMPERATURE HEATER=extruder2 TARGET=${numVal}`;
        else if (heaterKey === 't3') gcodeCmd = `SET_HEATER_TEMPERATURE HEATER=extruder3 TARGET=${numVal}`;
        else if (heaterKey === 'bed') gcodeCmd = `SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=${numVal}`;
        else if (heaterKey === 'env') {
            gcodeCmd = `SET_HEATER_TEMPERATURE HEATER=Env_heater TARGET=${numVal}`;
        }

        if (gcodeCmd) {
            console.log(`Sending target temp to Klipper (${p.name}): ${gcodeCmd}`);
            try {
                const url = getMoonrakerUrl(p.address, '/printer/gcode/script', `script=${encodeURIComponent(gcodeCmd)}`);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                await fetch(url, { method: 'POST', signal: controller.signal });
                clearTimeout(timeoutId);
            } catch (e) {
                console.error(`Failed to set target temp on Klipper:`, e);
            }
        }
    }

    updatePrinterDom(p);
};

async function sendKlipperPrintControl(p, action) {
    let address = p.address;
    if (!address) return false;
    try {
        const url = getMoonrakerUrl(address, `/printer/print/${action}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 50000);
        const res = await fetch(url, { method: 'POST', signal: controller.signal });
        clearTimeout(timeoutId);
        return res.ok;
    } catch (e) {
        console.error(`Failed to send print control ${action} to Klipper:`, e);
        return false;
    }
}

window.togglePausePrinter = async function (id) {
    const p = printersState.find(x => x.id === id);
    if (!p) return;

    if (p.address) {
        // Send pause command to real Klipper
        const success = await sendKlipperPrintControl(p, 'pause');
        if (success) {
            p.status = 'paused';
            savePrinters();
            renderPrinters();
            addNotification('pause', 'Baskı Duraklatıldı', `${p.name}: ${p.file || '-'}`);
        } else {
            await showCustomConfirm('Hata', 'Yazıcı duraklatılamadı. Lütfen tekrar deneyin.', 'Tamam', null, 'error');
        }
    } else {
        // Mock simulation fallback
        if (p.status === 'printing') {
            p.status = 'paused';
            p.speed = 0;
            savePrinters();
            renderPrinters();
            addNotification('pause', 'Baskı Duraklatıldı', `${p.name}: ${p.file || '-'}`);
        }
    }
};

window.resumePrinter = async function (id) {
    const p = printersState.find(x => x.id === id);
    if (!p) return;

    if (p.address) {
        // Send resume command to real Klipper
        const success = await sendKlipperPrintControl(p, 'resume');
        if (success) {
            p.status = 'printing';
            savePrinters();
            renderPrinters();
            addNotification('resume', 'Baskı Sürdürüldü', `${p.name}: ${p.file || '-'}`);
        } else {
            await showCustomConfirm('Hata', 'Yazıcı sürdürülemedi. Lütfen tekrar deneyin.', 'Tamam', null, 'error');
        }
    } else {
        // Mock simulation fallback
        if (p.status === 'paused') {
            p.status = 'printing';
            p.speed = 120;
            savePrinters();
            renderPrinters();
            addNotification('resume', 'Baskı Sürdürüldü', `${p.name}: ${p.file || '-'}`);
        }
    }
};

window.stopPrinter = async function (id) {
    const p = printersState.find(x => x.id === id);
    if (!p) return;

    const confirmed = await showCustomConfirm(
        'Baskıyı İptal Et',
        `'${p.name}' yazıcısındaki aktif baskı işlemini iptal etmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`,
        'Evet, İptal Et',
        'Vazgeç'
    );
    if (confirmed) {
        const cancelledFile = p.file || '-';
        if (p.address) {
            // 1. Send M315 G-code command to Klipper
            try {
                console.log(`Sending M315 command to Klipper (${p.name})...`);
                const gcodeUrl = getMoonrakerUrl(p.address, '/printer/gcode/script', 'script=M315');
                const gcodeController = new AbortController();
                const gcodeTimeoutId = setTimeout(() => gcodeController.abort(), 50000); // 50s timeout
                await fetch(gcodeUrl, { method: 'POST', signal: gcodeController.signal });
                clearTimeout(gcodeTimeoutId);
            } catch (e) {
                console.error('Failed to send M315 to Klipper before cancel:', e);
            }

            // 2. Send cancel command to real Klipper
            const success = await sendKlipperPrintControl(p, 'cancel');
            if (success) {
                markPrintSessionCancelled(p, cancelledFile, p.progress || 0);
                p.status = 'idle';
                p.progress = 0;
                p.remainingTime = '-';
                p.file = '-';
                p.speed = 0;
                savePrinters();
                renderPrinters();
                addNotification('cancel', 'Baskı İptal Edildi', `${p.name}: ${cancelledFile}`);
            } else {
                await showCustomConfirm('Hata', 'Baskı iptal edilemedi. Lütfen tekrar deneyin.', 'Tamam', null, 'error');
            }
        } else {
            // Mock simulation fallback
            markPrintSessionCancelled(p, cancelledFile, p.progress || 0);
            p.status = 'idle';
            p.progress = 0;
            p.remainingTime = '-';
            p.file = '-';
            p.speed = 0;
            p.targetT0Temp = 0;
            p.targetT1Temp = 0;
            p.targetT2Temp = 0;
            p.targetT3Temp = 0;
            p.targetBedTemp = 0;
            p.targetEnvTemp = 0;
            savePrinters();
            renderPrinters();
            addNotification('cancel', 'Baskı İptal Edildi', `${p.name}: ${cancelledFile}`);
        }
    }
};

window.preheatPrinter = function (id) {
    const p = printersState.find(x => x.id === id);
    if (!p) return;
    const isM1Pro = p.model === 'Layerstech M1pro';
    const isM1 = p.model === 'Layerstech M1';

    p.targetT0Temp = 220;
    p.targetT1Temp = (isM1Pro || isM1) ? 220 : 0;
    p.targetT2Temp = isM1Pro ? 150 : 0;
    p.targetT3Temp = 0;
    p.targetBedTemp = 60;
    p.targetEnvTemp = isM1Pro ? 40 : 0;
    savePrinters();
    renderPrinters();
};

window.startMockPrint = function (id) {
    const p = printersState.find(x => x.id === id);
    if (!p) return;
    const isM1Pro = p.model === 'Layerstech M1pro';
    const isM1 = p.model === 'Layerstech M1';

    p.status = 'printing';
    p.file = 'Layerstech_Job_' + Math.floor(1000 + Math.random() * 9000) + '.gcode';
    p.progress = 1;
    p.remainingTime = '45dk';
    p.speed = 120;
    p.targetT0Temp = 215;
    p.targetT1Temp = (isM1Pro || isM1) ? 150 : 0;
    p.targetT2Temp = isM1Pro ? 0 : 0;
    p.targetT3Temp = 0;
    p.targetBedTemp = 60;
    p.targetEnvTemp = isM1Pro ? 45 : 0;
    savePrinters();
    renderPrinters();
    addNotification('start', 'Baskı Başladı', `${p.name}: ${p.file}`);
};

window.connectPrinter = function (id) {
    const p = printersState.find(x => x.id === id);
    if (!p) return;

    p.status = 'connecting';
    renderPrinters();

    const address = p.address;
    console.log(`Connecting to printer ${p.name} at ${address}...`);

    setTimeout(async () => {
        let connected = false;
        let details = null;

        if (address && (address.startsWith('192.') || address.startsWith('10.') || address.startsWith('172.') || address.startsWith('localhost') || address.includes('.'))) {
            try {
                // Try Klipper/Moonraker API
                const url = getMoonrakerUrl(address, '/printer/info');
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (res.ok) {
                    details = await res.json();
                    connected = true;
                    console.log('Klipper connected:', details);
                }
            } catch (e) {
                try {
                    // Try OctoPrint API
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 1000);
                    const res = await fetch(`http://${address}/api/version`, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (res.ok) {
                        details = await res.json();
                        connected = true;
                        console.log('OctoPrint connected:', details);
                    }
                } catch (e2) {
                    console.log('Endpoints failed, using simulation.');
                }
            }
        }

        if (connected) {
            p.status = 'idle';
            p.t0Temp = 24; p.t1Temp = 23; p.t2Temp = 24; p.t3Temp = 24;
            p.bedTemp = 25; p.envTemp = 25;
            p.targetT0Temp = 0; p.targetT1Temp = 0; p.targetT2Temp = 0; p.targetT3Temp = 0;
            p.targetBedTemp = 0; p.targetEnvTemp = 0;
            p.extruderSpeed = 0;
            p.flow = 0;
            await showCustomConfirm('Bağlantı Başarılı', `Yazıcı bağlantısı kuruldu: ${p.name} (${address})`, 'Tamam', null, 'success');
        } else {
            // Mock connection fallback only if no address
            if (address) {
                p.status = 'offline';
                await showCustomConfirm('Bağlantı Başarısız', `Yazıcıya bağlanılamadı: ${p.name} (${address}). Lütfen yazıcının açık ve ağa bağlı olduğundan emin olun.`, 'Tamam', null, 'error');
            } else {
                p.status = 'idle';
                p.t0Temp = 24; p.t1Temp = 24; p.t2Temp = 24; p.t3Temp = 24;
                p.bedTemp = 25; p.envTemp = 25;
                p.targetT0Temp = 0; p.targetT1Temp = 0; p.targetT2Temp = 0; p.targetT3Temp = 0;
                p.targetBedTemp = 0; p.targetEnvTemp = 0;
                p.extruderSpeed = 0;
                p.flow = 0;
            }
        }

        savePrinters();
        renderPrinters();
    }, 1500);
};

function showCustomConfirm(title, message, okText = 'Tamam', cancelText = null, type = 'warning') {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const okBtn = document.getElementById('confirm-modal-ok-btn');
        const cancelBtn = document.getElementById('confirm-modal-cancel-btn');
        const iconContainer = document.getElementById('confirm-modal-icon-container');

        if (!modal || !okBtn || !cancelBtn || !iconContainer) {
            if (cancelText) {
                resolve(confirm(message));
            } else {
                alert(message);
                resolve(true);
            }
            return;
        }

        titleEl.innerText = title;
        msgEl.innerText = message;
        okBtn.innerText = okText;

        // Manage Cancel button visibility
        if (cancelText) {
            cancelBtn.innerText = cancelText;
            cancelBtn.style.display = 'block';
        } else {
            cancelBtn.style.display = 'none';
        }

        // Reset glow classes on the modal content
        const contentEl = modal.querySelector('.modal-content');
        if (contentEl) {
            contentEl.classList.remove('modal-glow-success', 'modal-glow-info', 'modal-glow-warning', 'modal-glow-error');
        }

        // Customize Icon & Colors based on Type
        if (type === 'success') {
            if (contentEl) contentEl.classList.add('modal-glow-success');
            iconContainer.style.background = 'rgba(46, 196, 182, 0.12)';
            iconContainer.style.color = '#2ec4b6';
            iconContainer.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            `;
            okBtn.style.background = '#2ec4b6';
        } else if (type === 'info') {
            if (contentEl) contentEl.classList.add('modal-glow-info');
            iconContainer.style.background = 'rgba(58, 134, 200, 0.12)';
            iconContainer.style.color = '#3a86c8';
            iconContainer.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
            `;
            okBtn.style.background = 'var(--accent)';
        } else if (type === 'warning') {
            if (contentEl) contentEl.classList.add('modal-glow-warning');
            iconContainer.style.background = 'rgba(255, 107, 0, 0.12)';
            iconContainer.style.color = 'var(--accent)';
            iconContainer.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
            `;
            okBtn.style.background = 'var(--accent)';
        } else { // 'error'
            if (contentEl) contentEl.classList.add('modal-glow-error');
            iconContainer.style.background = 'rgba(239, 71, 111, 0.12)';
            iconContainer.style.color = '#ef476f';
            iconContainer.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <octagon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
            `;
            okBtn.style.background = '#ef476f';
        }

        modal.classList.remove('hidden');

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup(null);
            }
        };

        const cleanup = (value) => {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeyDown);
            resolve(value);
        };

        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onOverlayClick = (e) => {
            if (e.target === modal) cleanup(null);
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeyDown);
    });
}

window.deletePrinter = async function (id) {
    const p = printersState.find(x => x.id === id);
    const confirmed = await showCustomConfirm(
        'Yazıcıyı Kaldır',
        `'${p ? p.name : 'Yazıcı'}' isimli yazıcıyı listeden kaldırmak istediğinizden emin misiniz?`,
        'Evet, Kaldır',
        'Vazgeç'
    );
    if (confirmed) {
        printersState = printersState.filter(x => x.id !== id);
        savePrinters();
        renderPrinters();
    }
};

window.goToPrinterWebUI = function (id) {
    const p = printersState.find(x => x.id === id);
    if (!p || !p.address) return;
    console.log('Opening printer Web UI in app webview:', p.address);
    showPrinterHost(p.address, p.name);
};

window.analyzeLanLogs = async function (id, silent = false) {
    const p = printersState.find(x => x.id === id);
    if (!p) return { success: false };

    if (!silent) {
        const startAnalysis = await showCustomConfirm(
            'Log Analizi',
            `'${p.name}' yazıcısının hostundaki tüm log dosyaları (.log ve arşivlenen geçmiş loglar) indirilip analiz edilecek ve yerel veritabanına kaydedilecektir.\n\nDevam etmek istiyor musunuz?`,
            'Analizi Başlat',
            'Vazgeç',
            'info'
        );
        if (!startAnalysis) return { success: false, userCancelled: true };

        addNotification('start', 'Log Analizi Başladı', `${p.name} logları analiz ediliyor...`);
    }

    const loadingModal = document.getElementById('analysis-loading-modal');
    const loadingText = document.getElementById('analysis-loading-text');

    if (loadingModal && !silent) {
        if (loadingText) {
            loadingText.innerText = `'${p.name}' yazıcısından log dosyaları çekiliyor ve analiz ediliyor... Lütfen bekleyin.`;
        }
        loadingModal.classList.remove('hidden');
    }

    try {
        const res = await ipcRenderer.invoke('printer-sync-logs', p);

        if (!silent) {
            if (loadingModal) {
                loadingModal.classList.add('hidden');
            }

            if (res && res.success) {
                addNotification(
                    'complete',
                    'Log Analizi Tamamlandı',
                    `${p.name}: ${res.processedCount} log dosyası tarandı. Toplam ${res.totalErrorsDetected} kritik hata tespit edildi.`
                );
                await showCustomConfirm(
                    'Analiz Tamamlandı',
                    `Başarıyla tamamlandı!\n\n${res.processedCount} adet log dosyası işlendi.\nToplam ${res.totalErrorsDetected} adet kritik hata yerel veritabanına kaydedildi.`,
                    'Tamam',
                    null,
                    'success'
                );
            } else {
                const errMsg = res ? res.error : 'Bilinmeyen bir hata oluştu.';
                addNotification('fail', 'Log Analizi Hatası', `${p.name}: ${errMsg}`);
                await showCustomConfirm('Analiz Hatası', `İşlem başarısız oldu:\n${errMsg}`, 'Tamam', null, 'error');
            }
        }
        return res;
    } catch (e) {
        if (!silent) {
            if (loadingModal) {
                loadingModal.classList.add('hidden');
            }
            console.error("Log analizi hatası:", e);
            addNotification('fail', 'Log Analizi Hatası', `${p.name}: ${e.message}`);
            await showCustomConfirm('Analiz Hatası', `Beklenmeyen bir hata oluştu:\n${e.message}`, 'Tamam', null, 'error');
        }
        return { success: false, error: e.message };
    }
};

window.toggleAnalysisCard = function (headerElement) {
    const card = headerElement.closest('.analysis-run-card');
    if (!card) return;
    const body = card.querySelector('.analysis-run-card-body');
    if (!body) return;
    const chevron = card.querySelector('.analysis-chevron');

    const isCollapsed = card.classList.contains('collapsed');
    if (isCollapsed) {
        card.classList.remove('collapsed');
        body.style.display = 'flex';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
    } else {
        card.classList.add('collapsed');
        body.style.display = 'none';
        if (chevron) chevron.style.transform = '';
    }
};

window.toggleErrorDetail = function (rowElement) {
    const nextRow = rowElement.nextElementSibling;
    if (nextRow && nextRow.classList.contains('error-detail-row')) {
        if (nextRow.style.display === 'none') {
            nextRow.style.display = 'table-row';
            nextRow.classList.remove('hidden');
            rowElement.classList.add('expanded');
            rowElement.style.background = 'rgba(239, 71, 111, 0.04)'; // Soft crimson highlight for the parent row
        } else {
            nextRow.style.display = 'none';
            nextRow.classList.add('hidden');
            rowElement.classList.remove('expanded');
            rowElement.style.background = rowElement.dataset.originalBg || 'transparent';
        }
    }
};

function parseTrLogDate(timeStr) {
    if (!timeStr) return null;
    const cleanStr = timeStr.trim();

    // 1. Format: DD.MM.YYYY HH:MM:SS
    const parts = cleanStr.split(/\s+/);
    if (parts.length >= 2) {
        const dateParts = parts[0].split('.');
        const timeParts = parts[1].split(':');
        if (dateParts.length === 3 && timeParts.length >= 2) {
            const d = parseInt(dateParts[0], 10);
            const m = parseInt(dateParts[1], 10);
            const y = parseInt(dateParts[2], 10);
            const h = parseInt(timeParts[0], 10) || 0;
            const min = parseInt(timeParts[1], 10) || 0;
            const s = parseInt(timeParts[2], 10) || 0;
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                return new Date(y, m - 1, d, h, min, s);
            }
        }
    }

    // 2. Format: HH:MM:SS (fallback to today)
    const timeParts = cleanStr.split(':');
    if (timeParts.length >= 2 && timeParts.length <= 3) {
        const h = parseInt(timeParts[0], 10);
        const min = parseInt(timeParts[1], 10);
        const s = parseInt(timeParts[2], 10) || 0;
        if (!isNaN(h) && !isNaN(min)) {
            const now = new Date();
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, min, s);
        }
    }

    return null;
}

function formatDuration(totalMins) {
    if (isNaN(totalMins) || totalMins < 0) return '0 dk';
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) {
        return `${hours} sa ${mins} dk`;
    }
    return `${mins} dk`;
}

function getPrintSessionMinutes(session) {
    // 0. C2P: printer-reported exact duration in seconds (most accurate)
    if (session.totalTime && session.totalTime > 0) {
        return Math.round(session.totalTime / 60);
    }

    // 1. Try to find duration from session events
    for (const evt of session.events) {
        const text = evt.text || '';
        const match = text.match(/Süre:\s*(\d+)\s*dk/i);
        if (match) {
            return parseInt(match[1], 10);
        }
    }

    // 2. Fallback to calculation from startTime and endTime/lastEventTime
    const startStr = session.startTime;
    const endStr = session.endTime || (session.events.length > 0 ? extractAnalysisTime(session.events[session.events.length - 1].text) : null);

    if (!startStr || !endStr) return 0;

    const startDate = parseTrLogDate(startStr);
    const endDate = parseTrLogDate(endStr);

    if (!startDate || !endDate) return 0;

    const diffMs = endDate - startDate;
    if (diffMs < 0) return 0;

    return Math.round(diffMs / 60000);
}

function getPrintSessionDuration(session) {
    // C2P: pre-formatted "X dk" string set directly from duration_s
    if (session.duration) return session.duration;
    const mins = getPrintSessionMinutes(session);
    return mins > 0 ? formatDuration(mins) : null;
}


function getPrintSessionPeaks(session) {
    if (session.peaksText) return session.peaksText;
    for (const evt of session.events) {
        const text = evt.text || '';
        const match = text.match(/Peak Sıcaklıklar:\s*\[(.*?)\]/i);
        if (match) {
            return match[1].trim();
        }
    }
    return null;
}

window.toggleSessionTimeDetail = function (el) {
    const state = el.getAttribute('data-state');
    if (state === 'duration') {
        el.innerHTML = el.getAttribute('data-original');
        el.setAttribute('data-state', 'original');
        el.style.color = '';
    } else {
        el.innerHTML = el.getAttribute('data-duration');
        el.setAttribute('data-state', 'duration');
        el.style.color = 'var(--text-main)';
    }
};

function extractAnalysisTime(text) {
    const bracket = text.match(/^\[([^\]]+)\]/);
    if (bracket) return bracket[1];
    const tail = text.match(/:\s*(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2})\s*$/);
    return tail ? tail[1] : '';
}

function extractAnalysisFile(text) {
    // Find all (group) before the trailing ': timestamp'
    // Pick the FIRST group that looks like a filename (contains a dot or slash)
    // This prevents resume/status annotations like "(Kaldığı Yerden Devam)" from being mistaken as filenames
    const allParens = [];
    const parenRe = /\(([^)]+)\)/g;
    let m;
    while ((m = parenRe.exec(text)) !== null) {
        allParens.push(m[1].trim());
    }
    // First pass: look for an entry that contains a dot (e.g. "file.gcode")
    for (const p of allParens) {
        if (p.includes('.') && !p.includes('Yerden') && !p.includes('Devam') && !p.includes('Hata')) {
            return p;
        }
    }
    // Second pass: if no dotted entry, fall back to first entry (excludes known non-file labels)
    const NON_FILE = ['Kaldığı Yerden Devam', 'Devam', 'DEVAM', 'İptal', 'Hata', 'Sistem Hatası'];
    for (const p of allParens) {
        if (!NON_FILE.some(nf => p.includes(nf))) {
            return p;
        }
    }
    const dosya = text.match(/Dosya:\s*(.+?)(?:\s*\(|$)/i);
    if (dosya) return dosya[1].trim();
    const progDosya = text.match(/Dosya:\s*([^|]+)/i);
    if (progDosya) return progDosya[1].trim();
    return 'Bilinmeyen dosya';
}


function buildPrintSessions(baskiRaporu) {
    // Sort all events chronologically by their timestamps
    const chronological = [...baskiRaporu].sort((a, b) => {
        const timeA = extractAnalysisTime(a.text);
        const timeB = extractAnalysisTime(b.text);
        if (!timeA) return 1;
        if (!timeB) return -1;
        const dateA = parseTrLogDate(timeA);
        const dateB = parseTrLogDate(timeB);
        if (!dateA) return 1;
        if (!dateB) return -1;
        return dateA - dateB;
    });

    const sessions = [];
    let current = null;

    const closeSession = () => { current = null; };

    const startSession = (file, time, item, hasExplicitStart = false) => {
        // Prevent duplicate sessions with the exact same startTime
        const existing = sessions.find(s => s.startTime === time && s.file === (file || 'Bilinmeyen dosya'));
        if (existing) {
            current = existing;
            return;
        }
        current = {
            file: file || 'Bilinmeyen dosya',
            status: 'printing',
            startTime: time,
            endTime: null,
            lastProgress: null,
            hasExplicitStart,   // true only when a real 'Baskı Başladı' event started this session
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
            startSession(file, time, item, true);
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
            closeSession();
            continue;
        }

        if (item.type === 'cancel' || /Baskı İptal/i.test(text)) {
            if (!current) startSession(file, time, item);
            current.status = 'cancelled';
            current.endTime = time;
            current.events.push(item);
            closeSession();
            continue;
        }

        if (item.type === 'error' || /Baskı İptal \(Hata/i.test(text) || /Sistem Hatası/i.test(text) || /Hata/i.test(text)) {
            if (!current) startSession(file, time, item);
            current.status = 'failed';
            current.endTime = time;
            current.events.push(item);
            closeSession();
            continue;
        }

        if (item.type === 'progress' || text.includes('[PROGRESS]') || text.includes('Yazdırılıyor:')) {
            const progMatch = text.match(/%(\d+)/);
            const newProg = progMatch ? parseInt(progMatch[1], 10) : null;

            // Only close on progress regression if this was an orphaned progress-only session.
            // If a real 'Baskı Başladı' started this session, keep it open — the same print
            // can report progress fluctuations or re-reports from multiple log files.
            if (current && newProg !== null && current.lastProgress !== null &&
                newProg < current.lastProgress && !current.hasExplicitStart) {
                closeSession();
            }

            if (!current) {
                startSession(file !== 'Bilinmeyen dosya' ? file : 'Bilinmeyen dosya', time, item);
            }

            if (newProg !== null) current.lastProgress = newProg;
            if (current.status !== 'paused') current.status = 'printing';
            if (file && file !== 'Bilinmeyen dosya') current.file = file;

            // Replace existing progress event instead of appending
            const progIdx = current.events.findIndex(e => {
                const t = e.text || '';
                return t.includes('[PROGRESS]') || t.includes('Yazdırılıyor:');
            });
            if (progIdx >= 0) current.events[progIdx] = item;
            else current.events.push(item);
        }
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

function getPrintSessionMeta(status) {
    const map = {
        printing: { label: 'Printing', color: '#ff6b00', bg: 'rgba(255, 107, 0, 0.12)', icon: '🖨️' },
        paused: { label: 'Paused', color: '#ffc107', bg: 'rgba(255, 193, 7, 0.12)', icon: '⏸️' },
        completed: { label: 'Completed', color: '#2ec4b6', bg: 'rgba(46, 196, 182, 0.12)', icon: '✅' },
        cancelled: { label: 'Cancelled', color: '#ef476f', bg: 'rgba(239, 71, 111, 0.12)', icon: '❌' },
        failed: { label: 'Failed', color: '#ef476f', bg: 'rgba(239, 71, 111, 0.12)', icon: '⚠️' }
    };
    return map[status] || map.printing;
}

function renderPrintSessionsHtml(sessions, page = 1, perPage = 10) {
    if (!sessions.length) {
        return {
            html: `<span style="font-size: 12px; color: var(--text-muted);">No print sessions found.</span>`,
            totalPages: 1,
            safePage: 1,
            totalItems: 0,
            rangeStart: 0,
            rangeEnd: 0
        };
    }

    const styleHtml = `
        <style>
            details.session-timeline-details[open] .timeline-summary-chevron {
                transform: rotate(90deg);
            }
            details.session-timeline-details summary::-webkit-details-marker {
                display: none;
            }
            details.session-timeline-details summary {
                list-style: none;
            }

            details.print-session-details {
                flex-shrink: 0;
            }
            details.print-session-details[open] .print-session-chevron {
                transform: rotate(90deg);
            }
            details.print-session-details summary::-webkit-details-marker {
                display: none;
            }
            details.print-session-details summary {
                list-style: none;
            }
        </style>
    `;

    const totalItems = sessions.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const offset = (safePage - 1) * perPage;
    const pageSessions = sessions.slice(offset, offset + perPage);
    const globalOffset = offset;

    const html = pageSessions.map((session, idx) => {
        const globalIdx = globalOffset + idx;
        const meta = getPrintSessionMeta(session.status);
        const progressText = session.lastProgress !== null ? `%${session.lastProgress}` : '-';
        const timeText = session.endTime || session.startTime || '-';
        const shortFile = session.file.length > 52 ? session.file.substring(0, 50) + '…' : session.file;
        const durationText = getPrintSessionDuration(session) || 'Unknown duration';
        const startTimeText = session.startTime || '-';

        const originalTimeHtml = `<strong>Last event:</strong> ${timeText}`;
        const durationTimeHtml = `<strong>Duration:</strong> <span style="color: var(--accent); font-weight: 700;">${durationText}</span> <span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">(Start: ${startTimeText})</span>`;

        const timeline = session.events
            .filter(e => {
                const t = e.text || '';
                if (e.type === 'progress' || t.includes('[PROGRESS]') || t.includes('Yazdırılıyor:')) {
                    return false;
                }
                return e.type !== 'info';
            })
            .map(e => {
                let icon = '•';
                const t = e.text || '';
                if (e.type === 'start' || /Başladı/i.test(t)) icon = '🚀';
                else if (e.type === 'pause' || /Duraklatıldı/i.test(t)) icon = '⏸️';
                else if (e.type === 'resume' || /Sürdürüldü/i.test(t)) icon = '▶️';
                else if (e.type === 'success' || /Bitti|Tamamlandı/i.test(t)) icon = '✅';
                else if (e.type === 'cancel' || /İptal/i.test(t)) icon = '❌';
                else if (t.includes('[PROGRESS]') || t.includes('Yazdırılıyor:')) icon = '📊';
                const display = t.replace(/^\[[^\]]+\]\s*/, '');
                return `<div style="font-size: 11px; color: var(--text-muted); line-height: 1.45;">${icon} ${escapeHtml(display)}</div>`;
            }).join('');

        const timelineHtml = (session.status === 'cancelled' && timeline)
            ? `
                <details class="session-timeline-details" style="cursor: pointer; outline: none; margin-top: 6px; border-top: 1px solid var(--border-light); padding-top: 6px;">
                    <summary class="session-timeline-summary" style="font-size: 10.5px; font-weight: 700; color: #ef476f; user-select: none; display: flex; align-items: center; gap: 4px; outline: none;">
                        <svg class="timeline-summary-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.15s; margin-right: 2px;">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        Show Event History
                    </summary>
                    <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4.5px; cursor: default; padding-left: 12px; border-left: 1px solid rgba(255, 255, 255, 0.05);" onclick="event.stopPropagation();">
                        ${timeline}
                    </div>
                </details>
              `
            : (timeline ? `<div style="border-top: 1px solid var(--border-light); padding-top: 6px; display: flex; flex-direction: column; gap: 3px;">${timeline}</div>` : '');

        const isOpen = session.status === 'printing' || session.status === 'paused';
        const peaksText = getPrintSessionPeaks(session);
        const peaksHtml = peaksText ? `<span style="color: #ffc107;"><strong>Peak:</strong> ${peaksText}</span>` : '';

        // ── C2P Metadata Badges ──────────────────────────────────────
        const isC2p = !!session.jobId;

        // Job ID chip
        const jobIdHtml = isC2p
            ? `<span style="font-size: 9.5px; font-family: monospace; background: rgba(0,206,201,0.1); color: #00cec9; border: 1px solid rgba(0,206,201,0.25); border-radius: 4px; padding: 1px 6px; white-space: nowrap; letter-spacing: 0.3px;" title="C2P Job ID">🔖 ${session.jobId}</span>`
            : '';

        // Resume badge
        const resumeHtml = (isC2p && session.resume === 1)
            ? `<span style="font-size: 9.5px; background: rgba(108,92,231,0.15); color: #a29bfe; border: 1px solid rgba(108,92,231,0.3); border-radius: 4px; padding: 1px 6px; white-space: nowrap;">▶ Resumed</span>`
            : '';

        // Tool badge
        const toolHtml = (isC2p && session.tool !== null && session.tool !== undefined)
            ? `<span style="font-size: 9.5px; background: rgba(253,203,110,0.12); color: #fdcb6e; border: 1px solid rgba(253,203,110,0.25); border-radius: 4px; padding: 1px 6px; white-space: nowrap;">🔧 T${session.tool}</span>`
            : '';

        // Z height badge
        const zHtml = (isC2p && session.z !== null && session.z !== undefined)
            ? `<span style="font-size: 9.5px; background: rgba(116,185,255,0.1); color: #74b9ff; border: 1px solid rgba(116,185,255,0.25); border-radius: 4px; padding: 1px 6px; white-space: nowrap;">Z: ${parseFloat(session.z).toFixed(2)} mm</span>`
            : '';

        // Error message row
        const errorHtml = (isC2p && session.error)
            ? `<div style="margin-top: 5px; padding: 5px 8px; background: rgba(239,71,111,0.1); border: 1px solid rgba(239,71,111,0.25); border-radius: 5px; font-size: 10.5px; color: #ef476f; display: flex; align-items: flex-start; gap: 5px; word-break: break-word;">
                   <span style="flex-shrink:0;">⚠️</span>
                   <span><strong>Error:</strong> ${escapeHtml(session.error)}</span>
               </div>`
            : '';

        const c2pMetaBadgesHtml = (jobIdHtml || resumeHtml || toolHtml || zHtml)
            ? `<div style="display: flex; flex-wrap: wrap; gap: 5px; align-items: center; margin-top: 5px;">${jobIdHtml}${resumeHtml}${toolHtml}${zHtml}</div>`
            : '';

        return `
            <details class="print-session-details" ${isOpen ? 'open' : ''} style="background: var(--surface-2); border: 1px solid var(--border-light); border-left: 3px solid ${meta.color}; border-radius: 8px; margin-bottom: 8px; outline: none; display: block; overflow: hidden; box-shadow: var(--shadow-xs); flex-shrink: 0;">
                <summary style="display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; list-style: none; outline: none; user-select: none;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                        <svg class="print-session-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; color: var(--text-muted); flex-shrink: 0;">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <div style="min-width: 0; flex: 1;">
                            <div style="font-size: 10px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;">Print #${totalItems - globalIdx}${isC2p ? ' <span style="font-size: 9px; color: #00cec9; font-weight: 700; text-transform: none; letter-spacing: 0;">· C2P</span>' : ''}</div>
                            <div style="font-size: 12px; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(session.file)}">${escapeHtml(shortFile)}</div>
                        </div>
                    </div>
                    <span style="flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; color: ${meta.color}; background: ${meta.bg}; border: 1px solid ${meta.color}33; white-space: nowrap;">${meta.icon} ${meta.label}</span>
                </summary>
                <div style="padding: 0 12px 12px 12px; border-top: 1px solid var(--border-light); padding-top: 8px; display: flex; flex-direction: column; gap: 8px;" onclick="event.stopPropagation();">
                    <div style="display: flex; gap: 14px; font-size: 11px; color: var(--text-light); margin-bottom: ${(c2pMetaBadgesHtml || errorHtml || timeline) ? '0' : '0'}; flex-wrap: wrap; align-items: center;">
                        <span><strong>Progress:</strong> ${progressText}</span>
                        <span class="session-time-toggle" style="cursor: pointer; user-select: none; border-bottom: 1px dashed rgba(255, 255, 255, 0.35); padding-bottom: 1px; transition: color 0.15s;" 
                              data-original="${originalTimeHtml.replace(/"/g, '&quot;')}" 
                              data-duration="${durationTimeHtml.replace(/"/g, '&quot;')}" 
                              data-state="original" 
                              onclick="toggleSessionTimeDetail(this)">
                            <strong>Last event:</strong> ${timeText}
                        </span>
                        ${peaksHtml ? `<span>${peaksHtml}</span>` : ''}
                    </div>
                    ${timelineHtml}
                </div>
            </details>
        `;
    }).join('');

    return {
        html: styleHtml + html,
        totalPages,
        safePage,
        totalItems,
        rangeStart: totalItems > 0 ? offset + 1 : 0,
        rangeEnd: Math.min(offset + perPage, totalItems)
    };
}

const ANALYSIS_FILES_PER_PAGE = 5;
const ANALYSIS_SESSIONS_PER_PAGE = 10;
const analysisViewState = { filesPage: 1, sessionPages: {}, printerId: null };

function renderAnalysisPaginationBar(scope, currentPage, totalPages, metaText) {
    if (totalPages <= 1) return '';
    const prevDisabled = currentPage <= 1;
    const nextDisabled = currentPage >= totalPages;
    return `
        <div class="analysis-pagination-bar" data-analysis-scope="${scope}" style="display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 10px; padding: 8px 10px; background: var(--surface-2); border-radius: 8px; border: 1px solid var(--border-light); flex-wrap: wrap;">
            <button type="button" class="btn-secondary" data-analysis-scope="${scope}" data-analysis-page="prev" ${prevDisabled ? 'disabled' : ''} style="padding: 4px 10px; font-size: 11px; height: 28px; margin: 0; width: auto; opacity: ${prevDisabled ? 0.45 : 1}; cursor: ${prevDisabled ? 'not-allowed' : 'pointer'};">← Prev</button>
            <span style="font-size: 11.5px; font-weight: 600; color: var(--text-light); text-align: center;">${metaText}</span>
            <button type="button" class="btn-secondary" data-analysis-scope="${scope}" data-analysis-page="next" ${nextDisabled ? 'disabled' : ''} style="padding: 4px 10px; font-size: 11px; height: 28px; margin: 0; width: auto; opacity: ${nextDisabled ? 0.45 : 1}; cursor: ${nextDisabled ? 'not-allowed' : 'pointer'};">Next →</button>
        </div>
    `;
}

function escapeAnalysisScopeKey(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatLogFileName(fileName) {
    if (fileName === 'klippy.log') return 'Today';
    const match = fileName.match(/klippy\.log\.(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        return `${match[2]}/${match[3]}/${match[1]}`; // MM/DD/YYYY format
    }
    return fileName;
}

window.showAnalysisResults = async function (id) {
    let rawTextContent = '';
    const p = printersState.find(x => x.id === id);
    if (!p) {
        console.error('[Analysis] Printer not found with ID:', id);
        console.error('[Analysis] Available printers:', printersState.map(x => ({ id: x.id, name: x.name })));
        showCustomConfirm('Error', 'Printer not found. Please refresh the page.', 'OK', null, 'error');
        return;
    }

    console.log('[Analysis] Opening modal for printer:', p.name, 'ID:', id);

    if (!p.logFolderPath) {
        showCustomConfirm('Error', 'Log folder path is not configured for this printer. Please edit it in settings.', 'OK', null, 'error');
        return;
    }

    const printerFolder = getPrinterFolderPath(p);
    if (!printerFolder) {
        showCustomConfirm('Error', 'Log folder path is not configured for this printer. Please edit it in settings.', 'OK', null, 'error');
        return;
    }

    const modal = document.getElementById('analysis-results-modal');
    const titleEl = document.getElementById('analysis-results-title');
    const pathEl = document.getElementById('analysis-results-file-path');
    const preEl = document.getElementById('analysis-results-pre');
    const structuredDiv = document.getElementById('analysis-results-structured');
    const tabStructured = document.getElementById('analysis-tab-structured');
    const tabRaw = document.getElementById('analysis-tab-raw');

    // Clear previous content immediately when switching printers
    titleEl.innerText = `${p.name || 'Unknown'} - Log Analysis Report`;

    // Fetch and display total printing duration asynchronously
    ipcRenderer.invoke('get-printer-total-duration', id).then(totalMins => {
        const totalDurationText = formatDuration(totalMins);
        titleEl.innerText = `${p.name || 'Unknown'} - Log Analysis Report (Total Print Time: ${totalDurationText})`;
    }).catch(err => {
        console.error('[Analysis] Failed to load total print duration:', err);
    });
    pathEl.innerText = 'Local Database';
    preEl.innerText = '';
    structuredDiv.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px;">Loading...</div>';
    tabStructured.classList.add('active');
    tabRaw.classList.remove('active');
    preEl.classList.add('hidden');
    structuredDiv.classList.remove('hidden');

    console.log('[Analysis] Loaded printer data:', {
        printerId: id,
        printerName: p.name,
        printerFolder
    });

    if (analysisViewState.printerId !== id) {
        analysisViewState.printerId = id;
        analysisViewState.filesPage = 1;
        analysisViewState.customStartDate = '';
        analysisViewState.customEndDate = '';
        Object.keys(analysisViewState.sessionPages).forEach(k => delete analysisViewState.sessionPages[k]);
    }

    // Tab switching event listeners
    tabStructured.onclick = () => {
        tabStructured.classList.add('active');
        tabRaw.classList.remove('active');
        structuredDiv.classList.remove('hidden');
        preEl.classList.add('hidden');
    };

    tabRaw.onclick = () => {
        tabRaw.classList.add('active');
        tabStructured.classList.remove('active');
        preEl.classList.remove('hidden');
        structuredDiv.classList.add('hidden');

        // Lazy load the raw logs text to prevent UI freezing/crashing on large files
        if (preEl.innerText === '' && rawTextContent) {
            preEl.innerText = rawTextContent;
            setTimeout(() => {
                preEl.scrollTop = preEl.scrollHeight;
            }, 50);
        }
    };

    // Default to the structured tab
    tabStructured.click();

    function renderStructuredReport(runs, printerStats) {
        if (runs.length === 0) {
            structuredDiv.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">No analysis data to display.</div>`;
            return;
        }

        let totalSuccess = 0;
        let totalCancelled = 0;
        let totalErrors = 0;

        runs.forEach(run => {
            totalSuccess += run.sections.summary.success || 0;
            totalCancelled += run.sections.summary.cancelled || 0;
            totalErrors += run.sections.summary.errors || 0;
        });

        const localTotalMins = printerTotalDurations[id] || 0;
        const formattedTotalDuration = formatDuration(localTotalMins);

        const statsTitleHtml = `<h3 style="font-size: 13px; font-weight: 700; color: var(--text-main, #fff); margin: 0 0 12px 0; display: flex; align-items: center; gap: 8px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9;">📊 Detailed Print Statistics</h3>`;

        const statsGridHtml = `
            <div class="analysis-stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px;">
                <div class="analysis-stat-card" style="background: var(--surface-2, rgba(255, 255, 255, 0.02)); border: 1px solid var(--border, rgba(255, 255, 255, 0.08)); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px; transition: all 0.3s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
                    <span style="font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">📦 Total Print Jobs</span>
                    <strong style="font-size: 18px; color: var(--text-main, #fff); font-family: 'Outfit', sans-serif;">${printerStats ? printerStats.totalPrintJobs : 0}</strong>
                </div>
                <div class="analysis-stat-card" style="background: var(--surface-2, rgba(255, 255, 255, 0.02)); border: 1px solid var(--border, rgba(255, 255, 255, 0.08)); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px; transition: all 0.3s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
                    <span style="font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">🏆 Longest Print</span>
                    <strong style="font-size: 18px; color: var(--accent); font-family: 'Outfit', sans-serif;">${printerStats ? printerStats.longestJob : '0s'}</strong>
                </div>
                <div class="analysis-stat-card" style="background: var(--surface-2, rgba(255, 255, 255, 0.02)); border: 1px solid var(--border, rgba(255, 255, 255, 0.08)); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px; transition: all 0.3s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
                    <span style="font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">⏱️ Total Runtime</span>
                    <strong style="font-size: 18px; color: #2ec4b6; font-family: 'Outfit', sans-serif;">${printerStats ? printerStats.totalTime : '0s'}</strong>
                </div>
                <div class="analysis-stat-card" style="background: var(--surface-2, rgba(255, 255, 255, 0.02)); border: 1px solid var(--border, rgba(255, 255, 255, 0.08)); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px; transition: all 0.3s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
                    <span style="font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Net Print Time</span>
                    <strong style="font-size: 18px; color: #ffbc42; font-family: 'Outfit', sans-serif;">${printerStats ? printerStats.totalPrintTime : '0s'}</strong>
                </div>
                <div class="analysis-stat-card" style="background: var(--surface-2, rgba(255, 255, 255, 0.02)); border: 1px solid var(--border, rgba(255, 255, 255, 0.08)); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px; transition: all 0.3s ease; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
                    <span style="font-size: 10px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">📈 Avg. Time / Print</span>
                    <strong style="font-size: 18px; color: #9b5de5; font-family: 'Outfit', sans-serif;">${printerStats ? printerStats.avgTimePerPrint : '0sn'}</strong>
                </div>
            </div>
            <style>
                .analysis-stat-card:hover {
                    background: var(--surface-3, rgba(255, 255, 255, 0.04)) !important;
                    border-color: var(--accent, rgba(255, 255, 255, 0.15)) !important;
                    transform: translateY(-2px);
                }
            </style>
        `;

        const summaryBarHtml = `
            <div class="analysis-summary-bar" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; background: rgba(255, 255, 255, 0.02); padding: 12px; border-radius: 8px; border: 1px solid var(--border-light, rgba(255,255,255,0.08));">
                <div class="summary-item" style="text-align: center;">
                    <span style="display: block; font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">⏱️ Total Print Time</span>
                    <strong style="font-size: 16px; color: var(--accent); font-family: 'Outfit', sans-serif;">${formattedTotalDuration}</strong>
                </div>
                <div class="summary-item" style="text-align: center; border-left: 1px solid var(--border-light, rgba(255,255,255,0.08));">
                    <span style="display: block; font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">✅ Successful Prints</span>
                    <strong style="font-size: 16px; color: #2ec4b6; font-family: 'Outfit', sans-serif;">${totalSuccess}</strong>
                </div>
                <div class="summary-item" style="text-align: center; border-left: 1px solid var(--border-light, rgba(255,255,255,0.08));">
                    <span style="display: block; font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">❌ Cancelled</span>
                    <strong style="font-size: 16px; color: #ef476f; font-family: 'Outfit', sans-serif;">${totalCancelled}</strong>
                </div>
                <div class="summary-item" style="text-align: center; border-left: 1px solid var(--border-light, rgba(255,255,255,0.08));">
                    <span style="display: block; font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">⚠️ Captured Errors</span>
                    <strong style="font-size: 16px; color: #ffbc42; font-family: 'Outfit', sans-serif;">${totalErrors}</strong>
                </div>
            </div>
        `;

        const customStartDate = analysisViewState.customStartDate || '';
        const customEndDate = analysisViewState.customEndDate || '';

        function formatDateToYYYYMMDD(d) {
            if (!d) return '';
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function parseYYYYMMDDToLocal(dateStr) {
            if (!dateStr) return null;
            const parts = dateStr.split('-');
            if (parts.length !== 3) return null;
            return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }

        const controlsHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 2px; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                    <!-- Date Filter -->
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);">Date Filter:</span>
                        <div id="analysis-custom-date-container" style="display: flex; align-items: center; gap: 6px;">
                            <input type="date" id="analysis-start-date" value="${customStartDate}" style="background: var(--surface-3, #090a0f); border: 1px solid var(--border-light, rgba(255, 255, 255, 0.08)); border-radius: 6px; color: #fff; font-size: 11.5px; padding: 4px 8px; height: 28px; outline: none; transition: border-color 0.2s;">
                            <span style="font-size: 11px; color: var(--text-muted);">to</span>
                            <input type="date" id="analysis-end-date" value="${customEndDate}" style="background: var(--surface-3, #090a0f); border: 1px solid var(--border-light, rgba(255, 255, 255, 0.08)); border-radius: 6px; color: #fff; font-size: 11.5px; padding: 4px 8px; height: 28px; outline: none; transition: border-color 0.2s;">
                        </div>
                    </div>
                    <!-- Sort Dropdown -->
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 12px; font-weight: 600; color: var(--text-muted);">Sort:</span>
                        <select id="analysis-sort-select" style="background: var(--surface-3, #090a0f); border: 1px solid var(--border-light, rgba(255, 255, 255, 0.08)); border-radius: 6px; color: #fff; font-size: 11.5px; font-weight: 600; padding: 4px 8px; height: 28px; outline: none; cursor: pointer; transition: border-color 0.2s;">
                            <option value="newest" selected>📅 Date (Newest First)</option>
                            <option value="oldest">📅 Date (Oldest First)</option>
                            <option value="errors-desc">❌ Error Count (High → Low)</option>
                            <option value="errors-asc">❌ Error Count (Low → High)</option>
                        </select>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn-secondary" id="analysis-expand-all" style="padding: 4px 12px; font-size: 11.5px; height: 28px; margin: 0; width: auto; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                        <span>↔️</span> Expand All
                    </button>
                    <button class="btn-secondary" id="analysis-collapse-all" style="padding: 4px 12px; font-size: 11.5px; height: 28px; margin: 0; width: auto; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                        <span>↕️</span> Collapse All
                    </button>
                </div>
            </div>
            <div id="analysis-cards-container"></div>
            <div id="analysis-files-pagination"></div>
        `;

        structuredDiv.innerHTML = statsTitleHtml + statsGridHtml + summaryBarHtml + controlsHtml;
        const container = document.getElementById('analysis-cards-container');
        const filesPaginationEl = document.getElementById('analysis-files-pagination');
        const sortSelect = document.getElementById('analysis-sort-select');

        let filesPage = analysisViewState.filesPage;
        const sessionPages = analysisViewState.sessionPages;
        let filteredRunsCache = [];

        function getRunDate(run) {
            if (run.fileName === 'klippy.log' || run.fileName === 'Genel Analiz Raporu') {
                return new Date();
            }
            const match = run.fileName.match(/klippy\.log\.(\d{4})-(\d{2})-(\d{2})/);
            if (match) {
                return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            }
            return new Date(0);
        }

        function isDateInFilterRange(date) {
            if (!date) return true;

            const startValStr = analysisViewState.customStartDate;
            const endValStr = analysisViewState.customEndDate;

            if (!startValStr && !endValStr) return true;

            let startVal = parseYYYYMMDDToLocal(startValStr);
            if (startVal) startVal.setHours(0, 0, 0, 0);

            let endVal = parseYYYYMMDDToLocal(endValStr);
            if (endVal) endVal.setHours(23, 59, 59, 999);

            if (startVal && date < startVal) return false;
            if (endVal && date > endVal) return false;
            return true;
        }

        function displayCards(pagedRuns, filePageMeta) {
            const isFiltered = (analysisViewState.customStartDate || analysisViewState.customEndDate);
            container.innerHTML = pagedRuns.map(run => {
                const rawPrintSessions = run.sections.printSessions && run.sections.printSessions.length > 0
                    ? run.sections.printSessions
                    : buildPrintSessions(run.sections.baskiRaporu);
                const printSessions = rawPrintSessions.filter(s => {
                    const sDate = parseTrLogDate(s.endTime || s.startTime);
                    return isDateInFilterRange(sDate);
                });

                // Sort print sessions descending (newest first)
                printSessions.sort((a, b) => {
                    const dateA = parseTrLogDate(a.endTime || a.startTime);
                    const dateB = parseTrLogDate(b.endTime || b.startTime);
                    if (!dateA && !dateB) return 0;
                    if (!dateA) return 1;
                    if (!dateB) return -1;
                    return dateB - dateA;
                });

                const errors = run.sections.errors
                    .map((err, idx) => ({ ...err, originalIndex: idx }))
                    .filter(err => {
                        const eDate = parseTrLogDate(err.time);
                        return isDateInFilterRange(eDate);
                    })
                    .sort((a, b) => {
                        const dateA = parseTrLogDate(a.time);
                        const dateB = parseTrLogDate(b.time);
                        if (!dateA && !dateB) return b.originalIndex - a.originalIndex;
                        if (!dateA) return 1;
                        if (!dateB) return -1;
                        const dateDiff = dateB - dateA;
                        if (dateDiff !== 0) return dateDiff;
                        return b.originalIndex - a.originalIndex;
                    });

                const totalMinutes = printSessions.reduce((acc, s) => acc + getPrintSessionMinutes(s), 0);
                const totalDurationText = formatDuration(totalMinutes);
                const scopeKey = escapeAnalysisScopeKey(run.fileName);
                const sessionPage = sessionPages[run.fileName] || 1;
                const sessionRender = renderPrintSessionsHtml(printSessions, sessionPage, ANALYSIS_SESSIONS_PER_PAGE);
                sessionPages[run.fileName] = sessionRender.safePage;

                const hasBaskiRaporu = printSessions.length > 0;
                const hasErrors = errors.length > 0;
                const hasMaxTemps = run.sections.maxTemps.length > 0;

                const sessionCounts = {
                    printing: printSessions.filter(s => s.status === 'printing').length,
                    paused: printSessions.filter(s => s.status === 'paused').length,
                    completed: printSessions.filter(s => s.status === 'completed').length,
                    cancelled: printSessions.filter(s => s.status === 'cancelled').length,
                    failed: printSessions.filter(s => s.status === 'failed').length
                };
                const successCount = !isFiltered
                    ? Math.max(run.sections.summary.success || 0, sessionCounts.completed)
                    : sessionCounts.completed;
                const cancelCount = !isFiltered
                    ? Math.max(run.sections.summary.cancelled || 0, sessionCounts.cancelled)
                    : sessionCounts.cancelled;
                const errorCount = !isFiltered
                    ? (run.sections.summary.errors || 0)
                    : errors.length;

                const hasActivity = (successCount > 0 || cancelCount > 0 || errorCount > 0
                    || sessionCounts.printing > 0 || sessionCounts.paused > 0 || hasBaskiRaporu);

                const sessionPaginationHtml = renderAnalysisPaginationBar(
                    scopeKey,
                    sessionRender.safePage,
                    sessionRender.totalPages,
                    `Page ${sessionRender.safePage} / ${sessionRender.totalPages} · Sessions ${sessionRender.rangeStart}-${sessionRender.rangeEnd} / ${sessionRender.totalItems}`
                );

                const printHistoryHtml = sessionRender.html + sessionPaginationHtml;

                const errorsTableHtml = hasErrors
                    ? `
                        <div class="scrollable-inner-box" style="overflow-x: auto; max-height: 400px; overflow-y: auto; background: var(--surface-3); border: 1px solid var(--border-light); border-radius: 6px; width: 100%;">
                            <table style="display: table; width: 100%; min-width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; color: var(--text-main);">
                                <thead style="display: table-header-group;">
                                    <tr style="display: table-row; height: 32px;">
                                        <th style="display: table-cell; position: sticky; top: 0; z-index: 10; background: var(--surface-3); border-bottom: 1px solid var(--border-light); padding: 8px 12px; font-weight: 700; color: var(--text-main); text-align: left; width: 80px; min-width: 80px;">Time</th>
                                        <th style="display: table-cell; position: sticky; top: 0; z-index: 10; background: var(--surface-3); border-bottom: 1px solid var(--border-light); padding: 8px 12px; font-weight: 700; color: var(--text-main); text-align: left; width: 130px; min-width: 130px;">Error Code</th>
                                        <th style="display: table-cell; position: sticky; top: 0; z-index: 10; background: var(--surface-3); border-bottom: 1px solid var(--border-light); padding: 8px 12px; font-weight: 700; color: var(--text-main); text-align: left; width: 180px; min-width: 180px;">Error Title</th>
                                        <th style="display: table-cell; position: sticky; top: 0; z-index: 10; background: var(--surface-3); border-bottom: 1px solid var(--border-light); padding: 8px 12px; font-weight: 700; color: var(--text-main); text-align: left; width: 70px; min-width: 70px;">Duration</th>
                                        <th style="display: table-cell; position: sticky; top: 0; z-index: 10; background: var(--surface-3); border-bottom: 1px solid var(--border-light); padding: 8px 12px; font-weight: 700; color: var(--text-main); text-align: left; min-width: 200px;">Description</th>
                                    </tr>
                                </thead>
                                <tbody style="display: table-row-group;">
                                    ${errors.map((err, index) => {
                        const hasDetail = err.context || (err.recentGcodes && err.recentGcodes.length > 0);
                        const rowBg = index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.015)';
                        const rowStyle = hasDetail
                            ? `display: table-row; border-bottom: 1px solid rgba(255, 255, 255, 0.05); height: 36px; cursor: pointer; transition: background 0.15s; background: ${rowBg};`
                            : `display: table-row; border-bottom: 1px solid rgba(255, 255, 255, 0.05); height: 36px; background: ${rowBg};`;
                        const hoverAttr = hasDetail ? `onmouseover="if(!this.classList.contains('expanded')) this.style.background='rgba(255,255,255,0.02)'" onmouseout="if(!this.classList.contains('expanded')) this.style.background='${rowBg}'"` : '';

                        // Show only HH:MM:SS from full datetime; full datetime as tooltip
                        const errTimeDisplay = (() => {
                            if (!err.time) return '-';
                            // "DD.MM.YYYY HH:MM:SS" → take the time part
                            const parts = String(err.time).split(' ');
                            return parts.length >= 2 ? parts[1] : parts[0];
                        })();
                        return `
                                            <tr style="${rowStyle}" ${hoverAttr} data-original-bg="${rowBg}" onclick="${hasDetail ? 'toggleErrorDetail(this)' : ''}">
                                                <td style="display: table-cell; padding: 8px 12px; white-space: nowrap; color: var(--text-main); font-family: monospace; text-align: left; vertical-align: middle; width: 80px; min-width: 80px;" title="${err.time} (Full Date)">${errTimeDisplay}</td>
                                                <td style="display: table-cell; padding: 8px 12px; white-space: nowrap; text-align: left; vertical-align: middle; width: 130px; min-width: 130px;">
                                                    <span class="printer-status-badge printing" style="padding: 2px 6px; font-size: 11px; font-family: monospace; font-weight: 600; max-width: 135px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;" title="${err.code || err.type || ''}">${err.code || err.type || ''}</span>
                                                    ${hasDetail ? '<span style="font-size: 11px; margin-left: 4px; color: var(--accent);">🔍 Detail</span>' : ''}
                                                </td>
                                                <td style="display: table-cell; padding: 8px 12px; font-weight: 600; color: var(--text-main); text-align: left; vertical-align: middle; width: 180px; min-width: 180px;">${escapeHtml(err.title)}</td>
                                                <td style="display: table-cell; padding: 8px 12px; color: var(--text-light); text-align: left; vertical-align: middle; width: 70px; min-width: 70px;">${err.duration || '-'}</td>
                                                <td style="display: table-cell; padding: 8px 12px; color: var(--text-muted); word-break: break-word; line-height: 1.4; text-align: left; vertical-align: middle; min-width: 200px;">${escapeHtml(err.desc)}</td>
                                            </tr>
                                            ${hasDetail ? `
                                                <tr class="error-detail-row" style="display: none; background: rgba(239, 71, 111, 0.04); border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
                                                    <td colspan="5" style="padding: 12px 16px 12px 28px; font-family: 'Outfit', sans-serif;">
                                                        <div style="display: flex; flex-direction: column; gap: 10px; border-left: 3px solid #ef476f; padding-left: 16px;">
                                                            ${err.recentGcodes && err.recentGcodes.length > 0 ? `
                                                                <div>
                                                                    <div style="font-size: 12.5px; font-weight: 700; color: #ff9a3c; text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 5px;">
                                                                        <span>⚡</span> Last G-Code Commands Before Error
                                                                    </div>
                                                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                                                        ${err.recentGcodes.map(cmd => `<code style="background: rgba(255, 154, 60, 0.08); color: #ff9a3c; padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(255, 154, 60, 0.15); font-size: 12.5px; font-family: monospace;">${escapeHtml(cmd)}</code>`).join('')}
                                                                    </div>
                                                                </div>
                                                            ` : ''}
                                                            ${err.context ? `
                                                                <div>
                                                                    <div style="font-size: 12.5px; font-weight: 700; color: #ef476f; text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 5px;">
                                                                        <span>📋</span> Hata Öncesi Log Kayıtları (Klippy.log Context)
                                                                    </div>
                                                                    <pre style="margin: 0; background: #05060a; padding: 10px; border-radius: 5px; border: 1px solid rgba(255, 255, 255, 0.04); font-family: monospace; font-size: 12.5px; color: #e5c7c7; white-space: pre-wrap; max-height: 150px; overflow-y: auto; line-height: 1.4; text-align: left; box-shadow: inset 0 2px 6px rgba(0,0,0,0.6);">${escapeHtml(err.context)}</pre>
                                                                </div>
                                                            ` : ''}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ` : ''}
                                        `;
                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                      `
                    : `
                        <div style="padding: 16px; text-align: center; color: var(--text-muted); background: var(--surface-3); border-radius: 6px; border: 1px solid var(--border-light); font-size: 12px; font-weight: 500;">
                            👍 No matching critical errors found in this log file.
                        </div>
                      `;

                const tempsGridHtml = hasMaxTemps
                    ? run.sections.maxTemps.map(t => {
                        const cleanVal = parseFloat(t.value) || 0.0;
                        let barColor = 'var(--accent)';
                        if (t.sensor.toLowerCase().includes('bed')) barColor = '#ffc107';
                        if (t.sensor.toLowerCase().includes('env')) barColor = '#3a86c8';
                        const maxBound = t.sensor.toLowerCase().includes('bed') ? 120 : t.sensor.toLowerCase().includes('env') ? 80 : 300;
                        const pct = Math.min(100, Math.max(0, (cleanVal / maxBound) * 100));
                        return `
                            <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;">
                                <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600; color: var(--text-light);">
                                    <span style="font-family: monospace;">${t.sensor}</span>
                                    <span style="color: var(--text-main);">${t.value}</span>
                                </div>
                                <div style="height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; border: 1px solid var(--border-light);">
                                    <div style="height: 100%; width: ${pct}%; background: ${barColor}; border-radius: 3px; box-shadow: 0 0 6px ${barColor};"></div>
                                </div>
                            </div>
                        `;
                    }).join('')
                    : `<span style="font-size: 12px; color: var(--text-muted);">No temperature data available.</span>`;

                const serverEventsHtml = run.sections.serverLogs.length > 0
                    ? `
                        <div style="margin-top: 15px; border-top: 1px solid rgba(255, 255, 255, 0.05); padding-top: 12px;">
                            <details style="cursor: pointer; font-size: 12px; color: var(--text-muted); outline: none;">
                                <summary style="font-weight: 600; font-family: 'Outfit', sans-serif; color: var(--text-light); transition: color 0.15s; user-select: none;">📡 Server Event Logs (${run.sections.serverLogs.length})</summary>
                                <div style="margin-top: 10px; background: #05060a; padding: 12px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.03); max-height: 200px; overflow-y: auto; font-family: monospace; font-size: 10.5px; line-height: 1.4; color: #b5ceda; white-space: pre-wrap; word-break: break-all; box-shadow: inset 0 2px 6px rgba(0,0,0,0.6);">
                                    ${run.sections.serverLogs.map((evt, idx) => `
[${idx + 1}] EVENT: ${evt.type}
------------------------------------------------------------
${evt.payload ? JSON.stringify(evt.payload, null, 2) : evt.raw}
------------------------------------------------------------`
                    ).join('\n')}
                                </div>
                            </details>
                        </div>
                      `
                    : '';

                return `
                    <div class="analysis-run-card collapsed" style="background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 18px; display: flex; flex-direction: column; gap: 15px; box-shadow: var(--shadow-sm); transition: border-color 0.2s; position: relative; margin-bottom: 16px;">
                        
                        <!-- Card Header -->
                        <div class="analysis-run-card-header" onclick="toggleAnalysisCard(this)" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-light); padding-bottom: 10px; flex-wrap: wrap; gap: 8px; cursor: pointer; user-select: none;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <svg class="analysis-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; color: var(--text-muted);">
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                                <span style="font-weight: 700; color: var(--text-main); font-size: 13.5px; font-family: monospace;">📄 ${formatLogFileName(run.fileName)}</span>
                            </div>
                            <div style="display: flex; gap: 6px; flex-wrap: wrap;" onclick="event.stopPropagation();">
                                ${printSessions.length > 0 ? `<span class="printer-status-badge info" style="font-size: 10px; padding: 2px 8px; font-weight: 700; background: rgba(0, 206, 201, 0.12); color: #00cec9; border-color: rgba(0, 206, 201, 0.25); white-space: nowrap;">⏱️ Total Print: ${totalDurationText}</span>` : ''}
                                ${sessionCounts.printing > 0 ? `<span class="printer-status-badge printing" style="font-size: 10px; padding: 2px 8px; font-weight: 700;">Active: ${sessionCounts.printing}</span>` : ''}
                                ${sessionCounts.paused > 0 ? `<span class="printer-status-badge connecting" style="font-size: 10px; padding: 2px 8px; font-weight: 700; background: rgba(255, 193, 7, 0.1); color: #ffc107; border-color: rgba(255, 193, 7, 0.25);">Paused: ${sessionCounts.paused}</span>` : ''}
                                <span class="printer-status-badge idle" style="font-size: 10px; padding: 2px 8px; font-weight: 700;">Success: ${successCount}</span>
                                <span class="printer-status-badge connecting" style="font-size: 10px; padding: 2px 8px; font-weight: 700; background: rgba(255, 107, 0, 0.1); color: #ff9a3c; border-color: rgba(255, 107, 0, 0.25);">Cancelled: ${cancelCount}</span>
                                <span class="printer-status-badge printing" style="font-size: 10px; padding: 2px 8px; font-weight: 700; background: rgba(239, 71, 111, 0.1); color: #ef476f; border-color: rgba(239, 71, 111, 0.25);">Errors: ${errorCount}</span>
                            </div>
                        </div>
                        
                        <!-- Card Body -->
                        <div class="analysis-run-card-body" style="display: none; flex-direction: column; gap: 18px;">
                            <!-- Content Flex Grid (Responsive) -->
                            <div style="display: flex; gap: 20px; flex-wrap: wrap; width: 100%;">
                                
                                <!-- Left Column (Print History) -->
                                <div style="display: flex; flex-direction: column; gap: 15px; flex: 2; min-width: 380px;">
                                    <!-- Print History -->
                                    <div>
                                        <h4 style="margin: 0 0 8px 0; font-size: 13.5px; font-weight: 700; text-transform: uppercase; color: var(--accent); letter-spacing: 0.5px;">Print Sessions</h4>
                                        <div class="scrollable-inner-box" style="display: flex; flex-direction: column; gap: 6px; background: var(--surface-3); padding: 12px; border-radius: 6px; border: 1px solid var(--border-light); max-height: 360px; overflow-y: auto;">
                                            ${printHistoryHtml}
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- Right Column (Peak Temps) -->
                                <div style="flex: 1; min-width: 200px;">
                                    <h4 style="margin: 0 0 8px 0; font-size: 13.5px; font-weight: 700; text-transform: uppercase; color: #ffc107; letter-spacing: 0.5px;">Peak Temperatures</h4>
                                    <div style="display: flex; flex-direction: column; gap: 10px; background: var(--surface-3); padding: 14px; border-radius: 6px; border: 1px solid var(--border-light);">
                                        ${tempsGridHtml}
                                    </div>
                                </div>
                                
                            </div>
                            
                            <!-- Bottom Full Width Column (Errors Table) -->
                            <div style="width: 100%;">
                                <h4 style="margin: 0 0 8px 0; font-size: 13.5px; font-weight: 700; text-transform: uppercase; color: #ef476f; letter-spacing: 0.5px;">Captured Critical Errors (${errors.length})</h4>
                                ${errorsTableHtml}
                            </div>
                            
                            <!-- Server Events log block -->
                            ${serverEventsHtml}
                        </div>
                        
                    </div>
                `;
            }).join('');

            if (filePageMeta && filePageMeta.totalPages > 1) {
                filesPaginationEl.innerHTML = renderAnalysisPaginationBar(
                    'files',
                    filePageMeta.safePage,
                    filePageMeta.totalPages,
                    `Log file page ${filePageMeta.safePage} / ${filePageMeta.totalPages} · ${filePageMeta.rangeStart}-${filePageMeta.rangeEnd} / ${filePageMeta.totalItems}`
                );
            } else {
                filesPaginationEl.innerHTML = '';
            }
        }

        function sortAndDisplay() {
            const sortVal = sortSelect.value;

            // 1. Filter
            let filteredRuns = runs.slice();

            const startValStr = analysisViewState.customStartDate;
            const endValStr = analysisViewState.customEndDate;

            if (startValStr || endValStr) {
                let startVal = parseYYYYMMDDToLocal(startValStr);
                if (startVal) startVal.setHours(0, 0, 0, 0);

                let endVal = parseYYYYMMDDToLocal(endValStr);
                if (endVal) endVal.setHours(23, 59, 59, 999);

                filteredRuns = filteredRuns.filter(run => {
                    const runDate = getRunDate(run);
                    if (startVal && runDate < startVal) return false;
                    if (endVal && runDate > endVal) return false;
                    return true;
                });
            }

            // 2. Sort
            if (sortVal === 'newest') {
                filteredRuns.sort((a, b) => {
                    return getRunDate(b) - getRunDate(a);
                });
            } else if (sortVal === 'oldest') {
                filteredRuns.sort((a, b) => {
                    return getRunDate(a) - getRunDate(b);
                });
            } else if (sortVal === 'errors-desc') {
                filteredRuns.sort((a, b) => (b.sections.summary.errors || 0) - (a.sections.summary.errors || 0));
            } else if (sortVal === 'errors-asc') {
                filteredRuns.sort((a, b) => (a.sections.summary.errors || 0) - (b.sections.summary.errors || 0));
            }

            filteredRunsCache = filteredRuns;

            const totalFileItems = filteredRuns.length;
            const totalFilePages = Math.max(1, Math.ceil(totalFileItems / ANALYSIS_FILES_PER_PAGE));
            filesPage = Math.min(Math.max(1, filesPage), totalFilePages);
            analysisViewState.filesPage = filesPage;
            const fileOffset = (filesPage - 1) * ANALYSIS_FILES_PER_PAGE;
            const pagedRuns = filteredRuns.slice(fileOffset, fileOffset + ANALYSIS_FILES_PER_PAGE);

            // 3. Display
            if (filteredRuns.length === 0) {
                container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">No analysis data found for the selected date range.</div>`;
                filesPaginationEl.innerHTML = '';
            } else {
                displayCards(pagedRuns, {
                    safePage: filesPage,
                    totalPages: totalFilePages,
                    totalItems: totalFileItems,
                    rangeStart: totalFileItems > 0 ? fileOffset + 1 : 0,
                    rangeEnd: Math.min(fileOffset + ANALYSIS_FILES_PER_PAGE, totalFileItems)
                });
            }
        }

        structuredDiv.onclick = (e) => {
            const btn = e.target.closest('[data-analysis-page]');
            if (!btn || btn.disabled) return;

            const scope = btn.dataset.analysisScope;
            const action = btn.dataset.analysisPage;
            if (!scope || !action) return;

            if (scope === 'files') {
                const totalFilePages = Math.max(1, Math.ceil(filteredRunsCache.length / ANALYSIS_FILES_PER_PAGE));
                if (action === 'prev' && filesPage > 1) filesPage -= 1;
                if (action === 'next' && filesPage < totalFilePages) filesPage += 1;
                analysisViewState.filesPage = filesPage;
            } else {
                const run = filteredRunsCache.find(r => escapeAnalysisScopeKey(r.fileName) === scope);
                if (!run) return;
                const totalSessions = buildPrintSessions(run.sections.baskiRaporu).length;
                const totalSessionPages = Math.max(1, Math.ceil(totalSessions / ANALYSIS_SESSIONS_PER_PAGE));
                const current = sessionPages[run.fileName] || 1;
                if (action === 'prev' && current > 1) sessionPages[run.fileName] = current - 1;
                if (action === 'next' && current < totalSessionPages) sessionPages[run.fileName] = current + 1;
            }

            sortAndDisplay();
        };

        sortSelect.onchange = () => {
            analysisViewState.filesPage = 1;
            Object.keys(analysisViewState.sessionPages).forEach(k => delete analysisViewState.sessionPages[k]);
            sortAndDisplay();
        };

        const startDateInput = document.getElementById('analysis-start-date');
        const endDateInput = document.getElementById('analysis-end-date');

        const onCustomDateChange = () => {
            analysisViewState.customStartDate = startDateInput.value;
            analysisViewState.customEndDate = endDateInput.value;
            analysisViewState.filesPage = 1;
            Object.keys(analysisViewState.sessionPages).forEach(k => delete analysisViewState.sessionPages[k]);
            sortAndDisplay();
        };

        if (startDateInput) startDateInput.onchange = onCustomDateChange;
        if (endDateInput) endDateInput.onchange = onCustomDateChange;

        // Initial render
        sortAndDisplay();

        const expandBtn = document.getElementById('analysis-expand-all');
        const collapseBtn = document.getElementById('analysis-collapse-all');

        if (expandBtn) {
            expandBtn.onclick = () => {
                document.querySelectorAll('.analysis-run-card').forEach(card => {
                    card.classList.remove('collapsed');
                    const body = card.querySelector('.analysis-run-card-body');
                    if (body) body.style.display = 'flex';
                    const chevron = card.querySelector('.analysis-chevron');
                    if (chevron) chevron.style.transform = 'rotate(90deg)';
                });
            };
        }

        if (collapseBtn) {
            collapseBtn.onclick = () => {
                document.querySelectorAll('.analysis-run-card').forEach(card => {
                    card.classList.add('collapsed');
                    const body = card.querySelector('.analysis-run-card-body');
                    if (body) body.style.display = 'none';
                    const chevron = card.querySelector('.analysis-chevron');
                    if (chevron) chevron.style.transform = '';
                });
            };
        }
    }

    async function loadContent() {
        try {
            // Also update total duration when content is reloaded
            ipcRenderer.invoke('get-printer-total-duration', id).then(totalMins => {
                const totalDurationText = formatDuration(totalMins);
                titleEl.innerText = `${p.name || 'Unknown'} - Log Analysis Report (Total Print Time: ${totalDurationText})`;
            }).catch(err => {
                console.error('[Analysis] Failed to load total print duration:', err);
            });

            const allDbRuns = await ipcRenderer.invoke('get-printer-runs', id) || [];
            const dbRuns = allDbRuns.filter(run => run.fileName !== 'printer_logs.txt');
            let printerStats = null;
            try {
                printerStats = await ipcRenderer.invoke('get-printer-stats', id);
            } catch (err) {
                console.error('[Analysis] Failed to load printer stats:', err);
            }

            if (dbRuns && dbRuns.length > 0) {
                rawTextContent = dbRuns.map(run => {
                    return `============================================================\n📊 LOG SYNCHRONIZATION & ANALYSIS REPORT - FILE: ${formatLogFileName(run.fileName)}\n============================================================\n${run.reportContent}`;
                }).join('\n\n');
                preEl.innerText = '';

                const runs = dbRuns.map(run => ({
                    fileName: run.fileName,
                    sections: {
                        serverLogs: run.serverLogs || [],
                        baskiRaporu: run.baskiRaporu || [],
                        maxTemps: run.maxTemps || [],
                        summary: run.summary || { success: 0, cancelled: 0, paused: 0, errors: 0 },
                        errors: run.errors || [],
                        printSessions: run.printSessions || []
                    },
                    reportContent: run.reportContent
                }));

                renderStructuredReport(runs, printerStats);

                setTimeout(() => {
                    preEl.scrollTop = preEl.scrollHeight;
                }, 50);
            } else {
                const missingText = `No analysis report has been generated for this printer yet.\n\nPlease click "Analyze" to analyze the logs.`;
                preEl.innerText = missingText;
                structuredDiv.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.5; stroke: var(--accent);">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <h3 style="font-size: 15px; font-weight: 600; color: #fff; margin: 0;">Report Not Found</h3>
                        <p style="font-size: 12.5px; max-width: 300px; line-height: 1.5; margin: 0 0 10px 0;">No analysis report has been generated for this printer yet.</p>
                        <button class="btn-primary" onclick="document.getElementById('analysis-results-modal').classList.add('hidden'); analyzeLanLogs('${p.id}');" style="font-size: 12px; padding: 6px 14px; height: auto; margin: 0; width: auto;">Start Analysis Now</button>
                    </div>
                `;
            }
        } catch (e) {
            const errText = `An error occurred while reading the report file:\n${e.message}`;
            preEl.innerText = errText;
            structuredDiv.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">${errText}</div>`;
        }
    }

    await loadContent();

    // Auto-analyze in the background silently to fetch the latest data
    let _analysisRefreshBusy = false;
    const refreshData = () => {
        if (_analysisRefreshBusy) {
            console.log('[Analysis] Skipping refresh - previous refresh still in progress.');
            return;
        }
        _analysisRefreshBusy = true;
        console.log('[Analysis] Refreshing analysis data for printer:', id);
        analyzeLanLogs(id, true).then((res) => {
            console.log('[Analysis] Refresh result:', res);
            if (res && res.success) {
                loadContent();
            }
        }).catch(err => {
            console.error('[Analysis] Auto-refresh error:', err);
        }).finally(() => {
            _analysisRefreshBusy = false;
        });
    };

    try {
        const allDbRuns = await ipcRenderer.invoke('get-printer-runs', id) || [];
        const dbRuns = allDbRuns.filter(run => run.fileName !== 'printer_logs.txt');
        if (!dbRuns || dbRuns.length === 0) {
            console.log('[Analysis] No database runs found, triggering analysis for printer:', id);
            refreshData();
        } else {
            console.log('[Analysis] Runs found in database, scheduling sync.');
            setTimeout(refreshData, 2000);
        }
    } catch (err) {
        console.error('[Analysis] Error checking runs database:', err);
        refreshData();
    }

    if (window.analysisAutoRefreshInterval) {
        clearInterval(window.analysisAutoRefreshInterval);
    }
    window.analysisAutoRefreshInterval = setInterval(refreshData, 60000);

    document.getElementById('analysis-open-folder-btn').onclick = () => {
        if (fs.existsSync(printerFolder)) {
            shell.openPath(printerFolder);
        } else {
            showCustomConfirm('Hata', 'Yazıcının analiz klasörü henüz yerelde oluşturulmamış.', 'Tamam', null, 'error');
        }
    };

    document.getElementById('analysis-refresh-btn').onclick = () => {
        const btn = document.getElementById('analysis-refresh-btn');
        const icon = btn.querySelector('svg');
        if (icon) icon.style.animation = 'spin-clockwise 1s linear infinite';

        analyzeLanLogs(id, true).then(() => {
            if (icon) icon.style.animation = '';
            loadContent();
        });
    };

    window.refreshAnalysisModalContent = loadContent;
    modal.classList.remove('hidden');
};

// Filter Tabs Click Logic
document.querySelectorAll('.filter-tab-mode').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab-mode').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentModeFilter = tab.getAttribute('data-mode');
        // Persist selection
        appSettings.printerModeFilter = currentModeFilter;
        saveAppSettings();
        renderPrinters();
    });
});

document.querySelectorAll('.filter-tab-status').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab-status').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentStatusFilter = tab.getAttribute('data-status');
        // Persist selection
        appSettings.printerStatusFilter = currentStatusFilter;
        saveAppSettings();
        renderPrinters();
    });
});

// LAN Mode Printer Event Logger
function getPrinterSafeName(name) {
    return (name || '').replace(/[^a-z0-9_\-\s]/gi, '_').trim();
}

function getPrinterFolderPath(printer) {
    if (!printer?.logFolderPath) return null;
    const safeName = getPrinterSafeName(printer.name);
    if (!safeName) return null;
    return path.join(printer.logFolderPath, safeName);
}

function syncPrinterFolderOnEdit(previousPrinter, updatedPrinter) {
    if (previousPrinter.mode !== 'lan' || !previousPrinter.logFolderPath) {
        return { ok: true };
    }

    const oldFolder = getPrinterFolderPath(previousPrinter);
    const newFolder = getPrinterFolderPath(updatedPrinter);

    if (!oldFolder || !newFolder || path.normalize(oldFolder) === path.normalize(newFolder)) {
        return { ok: true };
    }

    if (!fs.existsSync(oldFolder)) {
        return { ok: true };
    }

    try {
        if (fs.existsSync(newFolder)) {
            console.warn(`[LAN] Target folder already exists, keeping existing data: ${newFolder}`);
            return { ok: true, warning: 'target_exists' };
        }

        fs.mkdirSync(path.dirname(newFolder), { recursive: true });
        fs.renameSync(oldFolder, newFolder);
        console.log(`[LAN] Renamed printer folder: ${oldFolder} -> ${newFolder}`);
        return { ok: true, renamed: true };
    } catch (e) {
        console.error('Failed to rename printer folder:', e);
        return { ok: false, error: e.message };
    }
}

function buildProgressString(p, curProg) {
    let temps = [];
    if (p.t0Temp !== undefined) temps.push(`T0: ${Math.round(p.t0Temp || 0)}°C/${Math.round(p.targetT0Temp || 0)}°C`);
    if (p.t1Temp !== undefined && (p.t1Temp > 0 || p.targetT1Temp > 0)) temps.push(`T1: ${Math.round(p.t1Temp)}°C/${Math.round(p.targetT1Temp || 0)}°C`);
    if (p.t2Temp !== undefined && (p.t2Temp > 0 || p.targetT2Temp > 0)) temps.push(`T2: ${Math.round(p.t2Temp)}°C/${Math.round(p.targetT2Temp || 0)}°C`);
    if (p.t3Temp !== undefined && (p.t3Temp > 0 || p.targetT3Temp > 0)) temps.push(`T3: ${Math.round(p.t3Temp)}°C/${Math.round(p.targetT3Temp || 0)}°C`);
    if (p.bedTemp !== undefined) temps.push(`Bed: ${Math.round(p.bedTemp || 0)}°C/${Math.round(p.targetBedTemp || 0)}°C`);
    if (p.envTemp !== undefined && (p.envTemp > 0 || p.targetEnvTemp > 0)) temps.push(`Env: ${Math.round(p.envTemp)}°C/${Math.round(p.targetEnvTemp || 0)}°C`);

    const fileName = (p.file && p.file !== '-') ? p.file : '';
    const filePart = fileName ? `Dosya: ${fileName} | ` : '';

    return `${filePart}Yazdırılıyor: %${curProg} - ${temps.join(', ')}, Hız: ${p.speed || 0}mm/s`;
}

async function logPrinterEvent(printer, eventType, message) {
    // Disabled live event logging as requested
}

function createPrinterFolderAndLog(printer, initialMessage) {
    // Disabled
}

// Modal Logic
const addModal = document.getElementById('add-printer-modal');
const openAddModalBtn = document.getElementById('open-add-modal-btn');
const closeAddModalBtn = document.getElementById('close-add-modal-btn');
const cancelAddModalBtn = document.getElementById('cancel-add-modal-btn');
const addPrinterForm = document.getElementById('add-printer-form');

function toggleModeFields() {
    const selectedMode = document.querySelector('input[name="printer-mode"]:checked')?.value || 'online';
    const lanFolderGroup = document.getElementById('lan-folder-group');
    const addressInput = document.getElementById('printer-address');
    const folderInput = document.getElementById('printer-log-folder');

    if (selectedMode === 'lan') {
        if (lanFolderGroup) lanFolderGroup.classList.remove('hidden');
        if (folderInput) folderInput.setAttribute('required', 'required');
        if (addressInput) addressInput.removeAttribute('required');
    } else {
        if (lanFolderGroup) lanFolderGroup.classList.add('hidden');
        if (folderInput) folderInput.removeAttribute('required');
        if (addressInput) addressInput.setAttribute('required', 'required');
    }
}

// Attach change listeners to mode radio buttons
document.querySelectorAll('input[name="printer-mode"]').forEach(radio => {
    radio.addEventListener('change', toggleModeFields);
});

// Attach click listener for folder select button
const selectFolderBtn = document.getElementById('select-folder-btn');
if (selectFolderBtn) {
    selectFolderBtn.addEventListener('click', async () => {
        const folderInput = document.getElementById('printer-log-folder');
        const defaultPath = folderInput ? folderInput.value : '';
        const folderPath = await ipcRenderer.invoke('select-directory-dialog', defaultPath);
        if (folderPath) {
            if (folderInput) folderInput.value = folderPath;
        }
    });
}

if (openAddModalBtn && addModal) {
    openAddModalBtn.addEventListener('click', () => {
        document.getElementById('edit-printer-id').value = '';
        document.getElementById('modal-title').innerText = typeof t === 'function' ? t('modal.add_printer_title') : 'Yeni Yazıcı Ekle';
        document.getElementById('modal-submit-btn').innerText = typeof t === 'function' ? t('modal.add_submit') : 'Yazıcıyı Ekle';

        // Reset to default connection mode (online)
        const onlineRadio = document.querySelector('input[name="printer-mode"][value="online"]');
        if (onlineRadio) onlineRadio.checked = true;
        const logFolderInput = document.getElementById('printer-log-folder');
        if (logFolderInput) logFolderInput.value = path.join(userDataPath, 'logs');

        toggleModeFields();
        addModal.classList.remove('hidden');
    });
}

function closeAddModal() {
    if (addModal) {
        addModal.classList.add('hidden');
        if (addPrinterForm) addPrinterForm.reset();
        document.getElementById('edit-printer-id').value = '';
        document.getElementById('modal-title').innerText = typeof t === 'function' ? t('modal.add_printer_title') : 'Yeni Yazıcı Ekle';
        document.getElementById('modal-submit-btn').innerText = typeof t === 'function' ? t('modal.add_submit') : 'Yazıcıyı Ekle';
        toggleModeFields();
    }
}

if (closeAddModalBtn) closeAddModalBtn.addEventListener('click', closeAddModal);
if (cancelAddModalBtn) cancelAddModalBtn.addEventListener('click', closeAddModal);
if (addModal) {
    addModal.addEventListener('click', (e) => {
        if (e.target === addModal) closeAddModal();
    });
}

// Timelapse Modal Logic
const timelapseModal = document.getElementById('timelapse-modal');
const closeTimelapseModalBtn = document.getElementById('close-timelapse-modal-btn');
const timelapseVideoPlayer = document.getElementById('timelapse-video-player');

function closeTimelapseModal() {
    if (timelapseModal) {
        timelapseModal.classList.add('hidden');
        if (timelapseVideoPlayer) {
            timelapseVideoPlayer.pause();
            timelapseVideoPlayer.src = '';
        }
    }
}

if (closeTimelapseModalBtn) {
    closeTimelapseModalBtn.addEventListener('click', closeTimelapseModal);
}
if (timelapseModal) {
    timelapseModal.addEventListener('click', (e) => {
        if (e.target === timelapseModal) closeTimelapseModal();
    });
}

// Analysis Results Modal Logic
const analysisResultsModal = document.getElementById('analysis-results-modal');
const closeAnalysisResultsBtn = document.getElementById('close-analysis-results-btn');
const analysisCloseBtn = document.getElementById('analysis-close-btn');

function closeAnalysisResultsModal() {
    if (window.analysisAutoRefreshInterval) {
        clearInterval(window.analysisAutoRefreshInterval);
        window.analysisAutoRefreshInterval = null;
    }
    if (analysisResultsModal) {
        analysisResultsModal.classList.add('hidden');
    }
}

if (closeAnalysisResultsBtn) {
    closeAnalysisResultsBtn.addEventListener('click', closeAnalysisResultsModal);
}
if (analysisCloseBtn) {
    analysisCloseBtn.addEventListener('click', closeAnalysisResultsModal);
}
if (analysisResultsModal) {
    analysisResultsModal.addEventListener('click', (e) => {
        if (e.target === analysisResultsModal) closeAnalysisResultsModal();
    });
}

// Detailed Analysis Button Handler
const analysisShowFullBtn = document.getElementById('analysis-show-full-btn');
if (analysisShowFullBtn) {
    analysisShowFullBtn.addEventListener('click', () => {
        // Get the current content from modal
        const structuredContent = document.getElementById('analysis-results-structured');
        const preContent = document.getElementById('analysis-results-pre');
        const detailedContent = document.getElementById('detailed-analysis-content');

        if (detailedContent) {
            // Copy the structured content (which is visible)
            if (structuredContent) {
                detailedContent.innerHTML = structuredContent.innerHTML;
            } else if (preContent && !preContent.classList.contains('hidden')) {
                detailedContent.innerHTML = preContent.outerHTML;
            }
        }

        // Close modal and open detailed view
        closeAnalysisResultsModal();
        showDetailedAnalysis();
    });
}

// Detailed Analysis Close Button
const detailedAnalysisCloseBtn = document.getElementById('detailed-analysis-close-btn');
if (detailedAnalysisCloseBtn) {
    detailedAnalysisCloseBtn.addEventListener('click', closeDetailedAnalysis);
}

// Close modals on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (timelapseModal && !timelapseModal.classList.contains('hidden')) {
            closeTimelapseModal();
        }
        if (addModal && !addModal.classList.contains('hidden')) {
            closeAddModal();
        }
        if (analysisResultsModal && !analysisResultsModal.classList.contains('hidden')) {
            closeAnalysisResultsModal();
        }
    }
});

function openTimelapseModal(videoUrl, title, dateText = '') {
    if (timelapseModal && timelapseVideoPlayer) {
        timelapseVideoPlayer.src = videoUrl;
        const modalTitleEl = document.getElementById('timelapse-modal-title');
        if (modalTitleEl) {
            modalTitleEl.innerText = title || (typeof t === 'function' ? t('projects.tab_timelapse') : 'Timelapse Video');
        }
        const modalDateEl = document.getElementById('timelapse-modal-date');
        if (modalDateEl) {
            if (dateText) {
                modalDateEl.innerText = dateText;
                modalDateEl.style.display = 'inline-block';
            } else {
                modalDateEl.style.display = 'none';
            }
        }
        timelapseModal.classList.remove('hidden');
        timelapseVideoPlayer.play().catch(err => console.log('Auto-play blocked or failed:', err));
    }
}

window.openEditPrinterModal = function (id) {
    const p = printersState.find(x => x.id === id);
    if (!p) return;

    document.getElementById('edit-printer-id').value = p.id;
    document.getElementById('modal-title').innerText = typeof t === 'function' ? t('modal.edit_printer_title') : 'Yazıcıyı Düzenle';
    document.getElementById('modal-submit-btn').innerText = typeof t === 'function' ? t('modal.edit_submit') : 'Kaydet';

    document.getElementById('printer-name').value = p.name;
    document.getElementById('printer-model').value = p.model;
    document.getElementById('printer-address').value = p.address || '';

    // Restore mode and log path
    const mode = p.mode || 'online';
    const radioToCheck = document.querySelector(`input[name="printer-mode"][value="${mode}"]`);
    if (radioToCheck) {
        radioToCheck.checked = true;
    }
    const folderInput = document.getElementById('printer-log-folder');
    if (folderInput) {
        folderInput.value = p.logFolderPath || '';
    }

    toggleModeFields();

    if (addModal) {
        addModal.classList.remove('hidden');
    }
};

if (addPrinterForm) {
    addPrinterForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const editId = document.getElementById('edit-printer-id').value;
        const name = document.getElementById('printer-name').value;
        const model = document.getElementById('printer-model').value;
        const connAddress = document.getElementById('printer-address').value;
        const mode = document.querySelector('input[name="printer-mode"]:checked')?.value || 'online';
        const logFolderPath = document.getElementById('printer-log-folder').value;

        if (editId) {
            const p = printersState.find(x => x.id === editId);
            if (p) {
                const previousPrinter = {
                    name: p.name,
                    logFolderPath: p.logFolderPath,
                    mode: p.mode
                };

                p.name = name;
                p.model = model;
                p.address = connAddress;
                p.mode = mode;
                p.logFolderPath = mode === 'lan' ? logFolderPath : '';

                if (p.mode === 'lan' && p.logFolderPath) {
                    const folderResult = syncPrinterFolderOnEdit(previousPrinter, p);
                    createPrinterFolderAndLog(p, 'Yazıcı bilgileri güncellendi.');
                    if (!folderResult.ok) {
                        showCustomConfirm(
                            'Klasör Hatası',
                            `Yazıcı kaydedildi ancak log klasörü yeniden adlandırılamadı: ${folderResult.error}`,
                            'Tamam',
                            null,
                            'error'
                        );
                    }
                }
            }
        } else {
            const newId = 'p_' + Date.now();
            const newPrinter = {
                id: newId,
                name: name,
                model: model,
                status: 'offline',
                progress: 0,
                remainingTime: '-',
                t0Temp: 0,
                targetT0Temp: 0,
                t1Temp: 0,
                targetT1Temp: 0,
                t2Temp: 0,
                targetT2Temp: 0,
                t3Temp: 0,
                targetT3Temp: 0,
                bedTemp: 0,
                targetBedTemp: 0,
                envTemp: 0,
                targetEnvTemp: 0,
                speed: 0,
                extruderSpeed: 0,
                flow: 0,
                file: '-',
                address: connAddress,
                mode: mode,
                logFolderPath: mode === 'lan' ? logFolderPath : ''
            };
            printersState.push(newPrinter);

            // Create folder if LAN mode
            if (newPrinter.mode === 'lan' && newPrinter.logFolderPath) {
                createPrinterFolderAndLog(newPrinter, 'Yazıcı eklendi (LAN Modu).');
            }
        }

        savePrinters();
        closeAddModal();
        renderPrinters();
    });
}

// Fetch real data from Klipper Moonraker API
async function fetchKlipperData(p) {
    let address = p.address;
    if (!address) return null;

    // Call simulation to establish baseline/fallback
    simulateHwStats(p);

    // Also fetch webcam list if not fetched recently (every 30 seconds)
    const now = Date.now();
    if (!p.lastWebcamFetch || now - p.lastWebcamFetch > 30000) {
        p.lastWebcamFetch = now;
        (async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000); // 3000ms timeout
                const webcamUrl = getMoonrakerUrl(address, '/server/webcams/list');
                const webcamRes = await fetch(webcamUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (webcamRes.ok) {
                    const data = await webcamRes.json();
                    if (data && data.result && data.result.webcams) {
                        p.webcams = data.result.webcams;
                        if (p.webcams.length > 0) {
                            const exists = p.webcams.some(w => w.name === p.selectedWebcamName);
                            if (!exists) {
                                p.selectedWebcamName = p.webcams[0].name;
                            }
                        } else {
                            p.selectedWebcamName = null;
                        }
                    }
                }
            } catch (e) {
                console.error(`Failed to fetch webcams for ${p.name}:`, e);
            }
        })();
    }

    // Fetch CPU, RAM, and Disk Usage (SD Card) every 10 seconds
    if (!p.lastHwFetch || now - p.lastHwFetch > 10000) {
        p.lastHwFetch = now;
        (async () => {
            try {
                const controller1 = new AbortController();
                const timeoutId1 = setTimeout(() => controller1.abort(), 3000); // 3000ms timeout
                const statsUrl = getMoonrakerUrl(address, '/machine/proc_stats');
                const statsRes = await fetch(statsUrl, { signal: controller1.signal });
                clearTimeout(timeoutId1);
                if (statsRes.ok) {
                    const data = await statsRes.json();
                    if (data && data.result) {
                        const r = data.result;

                        // Handle both object and primitive types for system_cpu_usage / cpu_usage
                        let cpuVal = undefined;
                        let cpuObj = null;
                        if (r.system_cpu_usage !== undefined) {
                            if (typeof r.system_cpu_usage === 'object' && r.system_cpu_usage !== null) {
                                cpuObj = r.system_cpu_usage;
                                cpuVal = r.system_cpu_usage.cpu;
                            } else {
                                cpuVal = r.system_cpu_usage;
                            }
                        } else if (r.cpu_usage !== undefined) {
                            if (typeof r.cpu_usage === 'object' && r.cpu_usage !== null) {
                                cpuObj = r.cpu_usage;
                                cpuVal = r.cpu_usage.cpu;
                            } else {
                                cpuVal = r.cpu_usage;
                            }
                        }

                        // Fallback: If cpuVal is not a valid number but we have a cpuObj, average the cores
                        if ((cpuVal === undefined || cpuVal === null || isNaN(parseFloat(cpuVal))) && cpuObj) {
                            let totalCoresCpu = 0;
                            let coreCount = 0;
                            for (const key in cpuObj) {
                                if (/^cpu\d+$/.test(key)) {
                                    const val = parseFloat(cpuObj[key]);
                                    if (!isNaN(val)) {
                                        totalCoresCpu += val;
                                        coreCount++;
                                    }
                                }
                            }
                            if (coreCount > 0) {
                                cpuVal = totalCoresCpu / coreCount;
                            }
                        }

                        if (cpuVal !== undefined && cpuVal !== null) {
                            const parsedCpu = parseFloat(cpuVal);
                            if (!isNaN(parsedCpu)) {
                                p.cpuUsage = Math.max(2, Math.round(parsedCpu));
                            }
                        }

                        if (r.system_memory && r.system_memory.total && r.system_memory.available) {
                            const tot = parseFloat(r.system_memory.total);
                            const avail = parseFloat(r.system_memory.available);
                            if (tot > 0 && !isNaN(avail)) {
                                p.ramUsagePct = Math.max(10, Math.round(((tot - avail) / tot) * 100));
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`Failed to fetch CPU/RAM stats for ${p.name}:`, e);
            }

            try {
                // Try fetching directory info for gcodes to get disk_usage (works on new Moonraker/Armbian where disk_usage endpoint 404s)
                const controller2 = new AbortController();
                const timeoutId2 = setTimeout(() => controller2.abort(), 3000); // 3000ms timeout
                const gcodesUrl = getMoonrakerUrl(address, '/server/files/directory', 'path=gcodes');
                const gcodesRes = await fetch(gcodesUrl, { signal: controller2.signal });
                clearTimeout(timeoutId2);

                let diskDataFetched = false;
                if (gcodesRes.ok) {
                    const data = await gcodesRes.json();
                    if (data && data.result && data.result.disk_usage) {
                        const tot = parseFloat(data.result.disk_usage.total) || 1;
                        const free = parseFloat(data.result.disk_usage.free) || 0;
                        if (tot > 0 && !isNaN(free)) {
                            p.sdUsagePct = Math.max(5, Math.round(((tot - free) / tot) * 100));
                            diskDataFetched = true;
                        }
                    }
                }

                // Fallback to legacy disk_usage endpoint if first method did not succeed
                if (!diskDataFetched) {
                    const controllerFallback = new AbortController();
                    const timeoutIdFallback = setTimeout(() => controllerFallback.abort(), 3000); // 3000ms timeout
                    const diskUrl = getMoonrakerUrl(address, '/server/files/disk_usage');
                    const diskRes = await fetch(diskUrl, { signal: controllerFallback.signal });
                    clearTimeout(timeoutIdFallback);
                    if (diskRes.ok) {
                        const data = await diskRes.json();
                        if (data && data.result) {
                            const tot = parseFloat(data.result.total) || 1;
                            const free = parseFloat(data.result.free) || 0;
                            if (tot > 0 && !isNaN(free)) {
                                p.sdUsagePct = Math.max(5, Math.round(((tot - free) / tot) * 100));
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`Failed to fetch disk usage for ${p.name}:`, e);
            }
        })();
    }

    try {
        // Query the list of objects first if we haven't cached it
        if (!p.availableObjects) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2000ms timeout
            const objectsListUrl = getMoonrakerUrl(address, '/printer/objects/list');
            const res = await fetch(objectsListUrl, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = await res.json();
                if (data && data.result && data.result.objects) {
                    p.availableObjects = data.result.objects;
                }
            }
        }
    } catch (e) {
        // Fallback
    }

    // Default list of objects to query if caching list failed
    const defaultObjects = ['extruder', 'heater_bed', 'print_stats', 'virtual_sdcard', 'gcode_move', 'motion_report', 'webhooks'];
    const possibleObjects = [
        'extruder', 'extruder1', 'extruder2', 'extruder3',
        'heater_bed',
        'heater_generic Env_heater',
        'temperature_sensor chamber',
        'temperature_sensor ortam',
        'temperature_sensor Env_sensor',
        'print_stats', 'virtual_sdcard',
        'gcode_move',
        'motion_report',
        'c2p_save_variables',
        'webhooks'
    ];

    const targetObjects = p.availableObjects
        ? possibleObjects.filter(obj => p.availableObjects.includes(obj))
        : defaultObjects;

    const queryParams = targetObjects.map(encodeURIComponent).join('&');
    const url = getMoonrakerUrl(address, '/printer/objects/query', queryParams);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2000ms timeout
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            if (data && data.result && data.result.status) {
                return data.result.status;
            }
        }
    } catch (e) {
        // Quietly fail to let mock simulation fall back
    }
    return null;
}

// ─── Real-Time Dashboard Projects Management ───────────────────────────────────
let lastProjectsUpdate = 0;
let dashboardProjects = [];
let allProjectsState = [];

function renderMockProjects() {
    const grid = document.getElementById('project-grid');
    if (!grid) return;

    grid.innerHTML = `
        <!-- Project Card 1 -->
        <div class="project-card" id="project-fabric-card" tabindex="0" role="button" aria-label="Technical Fabric Proto">
            <div class="project-thumb">
                <div class="project-thumb-placeholder">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                        <line x1="12" y1="22.08" x2="12" y2="12"/>
                    </svg>
                </div>
                <span class="project-badge badge-progress">IN PROGRESS</span>
            </div>
            <div class="project-card-body">
                <h3 class="project-name">Technical Fabric Proto</h3>
                <div class="project-meta">
                    <div class="avatar-stack">
                        <div class="avatar av1"></div>
                        <div class="avatar av2"></div>
                    </div>
                    <span class="project-pct">75%</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: 75%; background: var(--accent)"></div>
                </div>
            </div>
        </div>

        <!-- Project Card 2 -->
        <div class="project-card" id="project-feather-card" tabindex="0" role="button" aria-label="Aero Feather Wing">
            <div class="project-thumb">
                <div class="project-thumb-placeholder">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                        <line x1="12" y1="22.08" x2="12" y2="12"/>
                    </svg>
                </div>
                <span class="project-badge badge-testing">TESTING</span>
            </div>
            <div class="project-card-body">
                <h3 class="project-name">Aero 'Feather' Wing</h3>
                <div class="project-meta">
                    <div class="avatar-stack">
                        <div class="avatar av3"></div>
                    </div>
                    <span class="project-pct">42%</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: 42%; background: #f0a500"></div>
                </div>
            </div>
        </div>
    `;

    // Re-bind listeners for mock cards
    const projectFabricCard = document.getElementById('project-fabric-card');
    if (projectFabricCard) {
        projectFabricCard.addEventListener('click', () => {
            console.log('Opening Technical Fabric Proto project...');
            ipcRenderer.send('launch-app', 'orca-slicer.exe');
        });
    }

    const projectFeatherCard = document.getElementById('project-feather-card');
    if (projectFeatherCard) {
        projectFeatherCard.addEventListener('click', () => {
            console.log('Opening Aero Feather Wing project...');
            ipcRenderer.send('launch-laser');
        });
    }
}

async function handleProjectCardClick(proj) {
    const isPrinting = proj.status === 'printing';
    const isPaused = proj.status === 'paused';
    if (isPrinting || isPaused) {
        // Navigate to printer host UI (Go Host)
        console.log(`Opening dynamic active project on Web UI: ${proj.printerName}`);
        showPrinterHost(proj.printerAddress, proj.printerName);
        // Update sidebar navigation active class
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navPrinters = document.getElementById('nav-printers');
        if (navPrinters) navPrinters.classList.add('active');
    } else {
        // Prompt for download or open in OrcaSlicer
        const downloadUrl = getMoonrakerUrl(proj.printerAddress, `/server/files/gcodes/${encodeURIComponent(proj.filename)}`);

        const choice = await showCustomConfirm(
            'Proje İşlemi',
            `'${proj.filename}' dosyasını bilgisayarınıza indirmek ister misiniz yoksa OrcaSlicer'ı mı açmak istersiniz?`,
            'Dosyayı İndir',
            'OrcaSlicer\'ı Aç',
            'info'
        );

        if (choice === true) {
            // Download file
            console.log(`Downloading G-code file: ${proj.filename} from ${downloadUrl}`);
            shell.openExternal(downloadUrl);
        } else if (choice === false) {
            // Open in OrcaSlicer
            console.log(`Opening dynamic project in OrcaSlicer: ${proj.filename}`);
            ipcRenderer.send('launch-app', 'orca-slicer.exe');
        }
    }
}

function renderDynamicProjects() {
    const grid = document.getElementById('project-grid');
    if (!grid) return;

    grid.innerHTML = dashboardProjects.map(proj => {
        const isPrinting = proj.status === 'printing';
        const isPaused = proj.status === 'paused';
        const isCancelled = proj.status === 'cancelled' || proj.status === 'canceled';
        const isFailed = proj.status === 'failed' || proj.status === 'error' || proj.status === 'shutdown' || proj.status === 'interrupted';
        const isActive = isPrinting || isPaused;

        const badgeLabels = {
            printing: currentLang === 'tr' ? 'YAZDIRILIYOR' : 'PRINTING',
            paused: currentLang === 'tr' ? 'DURAKLATILDI' : 'PAUSED',
            cancelled: currentLang === 'tr' ? 'İPTAL EDİLDİ' : 'CANCELLED',
            failed: currentLang === 'tr' ? 'BAŞARISIZ' : 'FAILED',
            default: currentLang === 'tr' ? 'HAZIR' : 'READY',
        };

        let badgeText = badgeLabels.default;
        let badgeClass = 'badge-completed';
        if (isPrinting) {
            badgeText = badgeLabels.printing;
            badgeClass = 'badge-progress';
        } else if (isPaused) {
            badgeText = badgeLabels.paused;
            badgeClass = 'badge-testing';
        } else if (isCancelled) {
            badgeText = badgeLabels.cancelled;
            badgeClass = 'badge-cancelled';
        } else if (isFailed) {
            badgeText = badgeLabels.failed;
            badgeClass = 'badge-failed';
        }

        // Format duration or file size details to show in metadata
        const remLabel = currentLang === 'tr' ? 'Kalan' : 'Left';
        const duraLabel = currentLang === 'tr' ? 'Çalışma' : 'Runtime';
        const sureLabel = currentLang === 'tr' ? 'Süre' : 'Duration';
        const hesaplaLabel = currentLang === 'tr' ? 'Süre hesaplanıyor...' : 'Calculating...';
        const iptalLabel = currentLang === 'tr' ? 'İptal Edildi' : 'Cancelled';
        const hataLabel = currentLang === 'tr' ? 'Yazma Hatası' : 'Write Error';
        const hSuffix = currentLang === 'tr' ? 's' : 'h';
        const mSuffix = currentLang === 'tr' ? 'dk' : 'm';

        let detailsText = '';
        if (isActive) {
            detailsText = proj.remainingTime && proj.remainingTime !== '-' ? `${remLabel}: ${proj.remainingTime}` : hesaplaLabel;
        } else if (isCancelled) {
            if (proj.estimatedTime > 0) {
                const totalMins = Math.round(proj.estimatedTime / 60);
                detailsText = `${duraLabel}: ${totalMins}${mSuffix}`;
            } else {
                detailsText = iptalLabel;
            }
        } else if (isFailed) {
            detailsText = hataLabel;
        } else {
            if (proj.estimatedTime > 0) {
                const totalMins = Math.round(proj.estimatedTime / 60);
                if (totalMins > 60) {
                    detailsText = `${sureLabel}: ${Math.floor(totalMins / 60)}${hSuffix} ${totalMins % 60}${mSuffix}`;
                } else {
                    detailsText = `${sureLabel}: ${totalMins}${mSuffix}`;
                }
            } else {
                detailsText = proj.size ? `${(proj.size / (1024 * 1024)).toFixed(1)} MB` : '';
            }
        }

        let progressColor = '#2ec4b6'; // Teal green for completed/ready
        if (isActive) {
            progressColor = 'var(--accent)'; // Orange for printing/paused
        } else if (isCancelled) {
            progressColor = '#ff9a3c'; // Lighter orange/yellow for cancelled
        } else if (isFailed) {
            progressColor = '#ef476f'; // Red for failed
        }

        const imgHtml = proj.thumbnailUrl
            ? `<img src="${proj.thumbnailUrl}" onerror="this.remove();" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; background: var(--surface-2);">`
            : '';

        const timelapseUrl = getTimelapseUrl(proj.printerId, proj.filename, proj.modified);
        const timelapseDate = getTimelapseDateText(proj.printerId, proj.filename, proj.modified);
        const timelapseBtn = timelapseUrl
            ? `<button class="project-timelapse-btn" title="${currentLang === 'tr' ? 'Timelapse İzle' : 'Watch Timelapse'}" data-video-url="${timelapseUrl}" data-title="${proj.name}" data-date="${timelapseDate}">
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                       <polygon points="5 3 19 12 5 21 5 3"/>
                   </svg>
               </button>`
            : '';
        const previewBtn = `
            <button class="project-preview-btn" title="${currentLang === 'tr' ? 'G-code Önizle' : 'Preview G-code'}" data-printer-id="${proj.printerId}" data-filename="${proj.filename}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
            </button>
        `;

        return `
            <div class="project-card dashboard-project-card" id="${proj.id}" data-printer-id="${proj.printerId}" data-filename="${proj.filename}" tabindex="0" role="button" aria-label="${proj.name}">
                <div class="project-thumb" style="overflow: hidden; background-color: var(--surface-2); position: relative;">
                    <div class="project-thumb-placeholder">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                            <line x1="12" y1="22.08" x2="12" y2="12"/>
                        </svg>
                    </div>
                    ${imgHtml}
                    ${timelapseBtn}
                    ${previewBtn}
                    <span class="project-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="project-card-body">
                    <h3 class="project-name" title="${proj.filename}">${proj.name}</h3>
                    <div class="project-meta">
                        <span style="font-size: 10.5px; color: var(--text-muted); font-weight: 500;">
                            ${proj.printerName} · ${detailsText}${timelapseDate ? ' · ' + timelapseDate : ''}
                        </span>
                        <span class="project-pct" style="color: ${progressColor}">${Math.round(proj.progress)}%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${proj.progress}%; background: ${progressColor}"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Bind click listeners for dynamic cards
    dashboardProjects.forEach(proj => {
        const cardEl = document.getElementById(proj.id);
        if (cardEl) {
            cardEl.addEventListener('click', () => handleProjectCardClick(proj));

            const tlBtn = cardEl.querySelector('.project-timelapse-btn');
            if (tlBtn) {
                tlBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const videoUrl = tlBtn.getAttribute('data-video-url');
                    const title = tlBtn.getAttribute('data-title');
                    const dateText = tlBtn.getAttribute('data-date') || '';
                    if (videoUrl) {
                        openTimelapseModal(videoUrl, title, dateText);
                    }
                });
            }

            const prevBtn = cardEl.querySelector('.project-preview-btn');
            if (prevBtn) {
                prevBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const printerId = prevBtn.getAttribute('data-printer-id');
                    const filename = prevBtn.getAttribute('data-filename');
                    if (printerId && filename) {
                        openGcodePreview(printerId, filename);
                    }
                });
            }
        }
    });
}

// ─── Projects Search/Filter State ────────────────────────────────────────────
let projectSearchQuery = '';
let projectStatusFilter = 'all';
let projectPrinterFilter = 'all';
let projectsCurrentPage = 1;
const projectsPerPage = 12;
let printerTimelapses = {};

function formatEpochToDateTime(epoch) {
    if (!epoch) return '';
    const date = new Date(epoch * 1000);
    return date.toLocaleString(currentLang === 'tr' ? 'tr-TR' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getTimestampSuffix(epoch) {
    if (!epoch) return '';
    const d = new Date(epoch * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}${mm}${dd}_${hh}${min}`;
}

function getTimelapseForJob(pId, filename, jobEndTime = null) {
    const list = printerTimelapses[pId];
    if (!list || !Array.isArray(list) || !filename) return null;

    const cleanName = filename.replace(/\.gcode$/i, '').toLowerCase();

    // 1. Filter all video files that match the G-code name
    const matches = list.filter(f => {
        const pathLower = f.path.toLowerCase();
        const isVideo = pathLower.endsWith('.mp4') || pathLower.endsWith('.webm') || pathLower.endsWith('.mkv') || pathLower.endsWith('.mov');
        if (!isVideo) return false;
        return pathLower.startsWith(cleanName) || pathLower.includes(cleanName);
    });

    if (matches.length === 0) return null;

    // 2. If we have a jobEndTime, find the best matching video file
    if (jobEndTime) {
        // Try to match by suffix string first (very accurate if matches)
        const suffix = getTimestampSuffix(jobEndTime);
        if (suffix) {
            const exactMatch = matches.find(f => f.path.toLowerCase().includes(suffix));
            if (exactMatch) return exactMatch;
        }

        // Fallback: find the video with the closest modification time (difference < 15 mins)
        let bestMatch = null;
        let minDiff = Infinity;

        matches.forEach(f => {
            if (f.modified) {
                const diff = Math.abs(f.modified - jobEndTime);
                if (diff < minDiff && diff < 900) { // 15 minutes threshold
                    minDiff = diff;
                    bestMatch = f;
                }
            }
        });

        if (bestMatch) return bestMatch;
    }

    // Default to the first match if no jobEndTime is provided or no close time matches
    return matches[0];
}

function getTimelapseDateText(pId, filename, jobEndTime = null) {
    const match = getTimelapseForJob(pId, filename, jobEndTime);
    if (match && match.modified) {
        return formatEpochToDateTime(match.modified);
    }
    return '';
}

function getTimelapseUrl(pId, filename, jobEndTime = null) {
    const match = getTimelapseForJob(pId, filename, jobEndTime);
    if (match) {
        const printer = printersState.find(x => x.id === pId);
        if (!printer || !printer.address) return null;
        let host = printer.address;
        if (!host.includes(':') && !printer.address.toLowerCase().startsWith('com') && !printer.address.toLowerCase().startsWith('/dev/')) {
            host = `${printer.address}:7125`;
        }
        return `http://${host}/server/files/timelapse/${encodeURIComponent(match.path)}`;
    }
    return null;
}

function populateProjectPrinterFilter() {
    const sel = document.getElementById('projects-printer-select');
    if (!sel) return;
    const names = new Set();
    (allProjectsState.length > 0 ? allProjectsState : []).forEach(p => names.add(p.printerName));
    printersState.forEach(p => names.add(p.name));
    let html = `<option value="all">${t('printers.filter_all')}</option>`;
    names.forEach(name => {
        const sel2 = projectPrinterFilter === name ? ' selected' : '';
        html += `<option value="${name}"${sel2}>${name}</option>`;
    });
    sel.innerHTML = html;
    sel.value = projectPrinterFilter;
    sel.onchange = () => { projectPrinterFilter = sel.value; projectsCurrentPage = 1; renderAllProjects(); };
}

function renderAllProjects() {
    const grid = document.getElementById('all-projects-grid');
    if (!grid) return;

    // Build source data — real or mock
    let source = allProjectsState;
    const isMock = source.length === 0;

    if (isMock) {
        // Mock projects data
        source = [
            {
                id: 'mock_fabric', name: 'Technical Fabric Proto', filename: 'technical_fabric_proto.gcode',
                size: 0, estimatedTime: 6120, printerName: 'Mock Printer', printerAddress: '',
                printerId: 'mock', status: 'printing', progress: 75, remainingTime: '45dk',
                thumbnailUrl: '', _mock: true
            },
            {
                id: 'mock_feather', name: "Aero 'Feather' Wing", filename: 'aero_feather_wing.gcode',
                size: 0, estimatedTime: 2700, printerName: 'Mock Printer', printerAddress: '',
                printerId: 'mock', status: 'paused', progress: 42, remainingTime: '22dk',
                thumbnailUrl: '', _mock: true
            }
        ];
    }

    // ── Apply filters ──────────────────────────────────────────────────────────
    const q = projectSearchQuery.toLowerCase().trim();
    let filtered = [];

    if (projectStatusFilter === 'timelapse') {
        let timelapseCards = [];
        Object.keys(printerTimelapses).forEach(pId => {
            const printer = printersState.find(x => x.id === pId);
            const printerName = printer ? printer.name : 'Yazıcı';
            const list = printerTimelapses[pId] || [];
            list.forEach(f => {
                const pathLower = f.path.toLowerCase();
                const isVideo = pathLower.endsWith('.mp4') || pathLower.endsWith('.webm') || pathLower.endsWith('.mkv') || pathLower.endsWith('.mov');
                if (!isVideo) return; // Skip non-video files

                let host = printer.address;
                if (!host.includes(':') && !printer.address.toLowerCase().startsWith('com') && !printer.address.toLowerCase().startsWith('/dev/')) {
                    host = `${printer.address}:7125`;
                }
                const url = `http://${host}/server/files/timelapse/${encodeURIComponent(f.path)}`;

                // Try to find a matching project/G-code in allProjectsState to reuse its thumbnail!
                const cleanVideoName = f.path.replace(/\.[a-zA-Z0-9]+$/i, '').toLowerCase();
                const matchedProj = allProjectsState.find(p => {
                    if (p.printerId !== pId) return false;
                    const cleanGcodeName = p.filename.replace(/\.gcode$/i, '').toLowerCase();
                    return cleanVideoName.startsWith(cleanGcodeName) || cleanGcodeName.startsWith(cleanVideoName) || cleanVideoName.includes(cleanGcodeName);
                });
                const thumbUrl = (matchedProj && matchedProj.thumbnailUrl) ? matchedProj.thumbnailUrl : '';

                timelapseCards.push({
                    id: `tl_${pId}_${f.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
                    name: f.path.replace(/\.[a-zA-Z0-9]+$/i, ''), // Strip extension dynamically
                    filename: f.path,
                    size: f.size || 0,
                    modified: f.modified || Date.now() / 1000,
                    estimatedTime: 0,
                    progress: 100,
                    printerName: printerName,
                    printerId: pId,
                    status: 'timelapse',
                    videoUrl: url,
                    thumbnailUrl: thumbUrl
                });
            });
        });

        // Sort by modified desc
        timelapseCards.sort((a, b) => b.modified - a.modified);

        // Apply search query and printer filter if any
        filtered = timelapseCards.filter(proj => {
            const matchSearch = !q ||
                proj.name.toLowerCase().includes(q) ||
                proj.filename.toLowerCase().includes(q) ||
                proj.printerName.toLowerCase().includes(q);

            const matchPrinter = projectPrinterFilter === 'all' || proj.printerName === projectPrinterFilter;

            return matchSearch && matchPrinter;
        });
    } else {
        filtered = source.filter(proj => {
            const matchSearch = !q ||
                proj.name.toLowerCase().includes(q) ||
                proj.filename.toLowerCase().includes(q) ||
                proj.printerName.toLowerCase().includes(q);

            const matchStatus = projectStatusFilter === 'all' ||
                proj.status === projectStatusFilter ||
                (projectStatusFilter === 'cancelled' && (proj.status === 'cancelled' || proj.status === 'canceled')) ||
                (projectStatusFilter === 'failed' && (proj.status === 'failed' || proj.status === 'error' || proj.status === 'shutdown' || proj.status === 'interrupted'));

            const matchPrinter = projectPrinterFilter === 'all' || proj.printerName === projectPrinterFilter;

            return matchSearch && matchStatus && matchPrinter;
        });
    }

    // ── Results count bar ─────────────────────────────────────────────────────
    const resultsBar = document.getElementById('projects-results-bar');
    const resultsCount = document.getElementById('projects-results-count');
    if (resultsBar && resultsCount) {
        const isFiltered = q || projectStatusFilter !== 'all' || projectPrinterFilter !== 'all';
        if (isFiltered) {
            resultsBar.style.display = 'flex';
            resultsCount.textContent = currentLang === 'tr'
                ? `${filtered.length} proje bulundu`
                : `${filtered.length} project${filtered.length !== 1 ? 's' : ''} found`;
        } else {
            resultsBar.style.display = 'none';
        }
    }

    // ── Pagination Calculation ────────────────────────────────────────────────
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / projectsPerPage) || 1;
    if (projectsCurrentPage > totalPages) {
        projectsCurrentPage = totalPages;
    }
    if (projectsCurrentPage < 1) {
        projectsCurrentPage = 1;
    }
    const startIndex = (projectsCurrentPage - 1) * projectsPerPage;
    const endIndex = startIndex + projectsPerPage;
    const pageItems = filtered.slice(startIndex, endIndex);

    // ── Empty state ───────────────────────────────────────────────────────────
    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 24px; text-align: center; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px; color: var(--text-muted);">
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 14px; opacity: 0.5;">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <h3 style="font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 6px;">${currentLang === 'tr' ? 'Proje Bulunamadı' : 'No Projects Found'}</h3>
                <p style="font-size: 12.5px; max-width: 280px; line-height: 1.5;">${currentLang === 'tr' ? 'Arama kriterlerinize uygun proje yok.' : 'No projects match your search criteria.'}</p>
            </div>
        `;
        const pagContainer = document.getElementById('projects-pagination');
        if (pagContainer) {
            pagContainer.innerHTML = '';
            pagContainer.style.display = 'none';
        }
        return;
    }

    // ── Render cards ──────────────────────────────────────────────────────────
    grid.innerHTML = pageItems.map(proj => {
        const isTimelapse = proj.status === 'timelapse';
        const isPrinting = proj.status === 'printing';
        const isPaused = proj.status === 'paused';
        const isCancelled = proj.status === 'cancelled' || proj.status === 'canceled';
        const isFailed = proj.status === 'failed' || proj.status === 'error' || proj.status === 'shutdown' || proj.status === 'interrupted';
        const isActive = isPrinting || isPaused;

        const badgeLabels = {
            printing: currentLang === 'tr' ? 'YAZDIRILIYOR' : 'PRINTING',
            paused: currentLang === 'tr' ? 'DURAKLATILDI' : 'PAUSED',
            cancelled: currentLang === 'tr' ? 'İPTAL EDİLDİ' : 'CANCELLED',
            failed: currentLang === 'tr' ? 'BAŞARISIZ' : 'FAILED',
            completed: currentLang === 'tr' ? 'TAMAMLANDI' : 'COMPLETED',
            default: currentLang === 'tr' ? 'HAZIR' : 'READY',
        };

        let badgeText = badgeLabels.default;
        let badgeClass = 'badge-completed';
        if (isTimelapse) {
            badgeText = 'TIMELAPSE';
            badgeClass = 'badge-timelapse';
        } else if (isPrinting) {
            badgeText = badgeLabels.printing;
            badgeClass = 'badge-progress';
        } else if (isPaused) {
            badgeText = badgeLabels.paused;
            badgeClass = 'badge-testing';
        } else if (isCancelled) {
            badgeText = badgeLabels.cancelled;
            badgeClass = 'badge-cancelled';
        } else if (isFailed) {
            badgeText = badgeLabels.failed;
            badgeClass = 'badge-failed';
        }

        let detailsText = '';
        const remLabel = currentLang === 'tr' ? 'Kalan' : 'Left';
        const duraLabel = currentLang === 'tr' ? 'Çalışma' : 'Runtime';
        const sureLabel = currentLang === 'tr' ? 'Süre' : 'Duration';
        const hesaplaLabel = currentLang === 'tr' ? 'Süre hesaplanıyor...' : 'Calculating...';
        const iptalLabel = currentLang === 'tr' ? 'İptal Edildi' : 'Cancelled';
        const hataLabel = currentLang === 'tr' ? 'Yazma Hatası' : 'Write Error';
        const hSuffix = currentLang === 'tr' ? 's' : 'h';
        const mSuffix = currentLang === 'tr' ? 'dk' : 'm';

        if (isTimelapse) {
            detailsText = proj.size ? `${(proj.size / (1024 * 1024)).toFixed(1)} MB` : '';
        } else if (isActive) {
            detailsText = proj.remainingTime && proj.remainingTime !== '-' ? `${remLabel}: ${proj.remainingTime}` : hesaplaLabel;
        } else if (isCancelled) {
            detailsText = proj.estimatedTime > 0
                ? `${duraLabel}: ${Math.round(proj.estimatedTime / 60)}${mSuffix}`
                : iptalLabel;
        } else if (isFailed) {
            detailsText = hataLabel;
        } else {
            if (proj.estimatedTime > 0) {
                const m = Math.round(proj.estimatedTime / 60);
                detailsText = m > 60
                    ? `${sureLabel}: ${Math.floor(m / 60)}${hSuffix} ${m % 60}${mSuffix}`
                    : `${sureLabel}: ${m}${mSuffix}`;
            } else {
                detailsText = proj.size ? `${(proj.size / (1024 * 1024)).toFixed(1)} MB` : '';
            }
        }

        let progressColor = '#2ec4b6';
        if (isTimelapse) progressColor = '#a855f7';
        else if (isActive) progressColor = 'var(--accent)';
        else if (isCancelled) progressColor = '#ff9a3c';
        else if (isFailed) progressColor = '#ef476f';

        // Highlight search match in name
        let displayName = proj.name;
        if (q) {
            const idx = proj.name.toLowerCase().indexOf(q);
            if (idx !== -1) {
                displayName = proj.name.substring(0, idx)
                    + `<mark class="proj-highlight">${proj.name.substring(idx, idx + q.length)}</mark>`
                    + proj.name.substring(idx + q.length);
            }
        }

        const imgHtml = proj.thumbnailUrl
            ? `<img src="${proj.thumbnailUrl}" onerror="this.remove();" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; background: var(--surface-2);">`
            : '';

        const timelapseUrl = getTimelapseUrl(proj.printerId, proj.filename);
        const timelapseDate = isTimelapse ? formatEpochToDateTime(proj.modified) : getTimelapseDateText(proj.printerId, proj.filename);
        const timelapseBtn = isTimelapse
            ? `<button class="project-timelapse-btn" style="width: 44px; height: 44px; top: 50%; left: 50%; transform: translate(-50%, -50%) scale(1.1); bottom: auto; right: auto; background: var(--accent); border-color: transparent; box-shadow: 0 0 15px rgba(255,107,0,0.6);" data-video-url="${proj.videoUrl}" data-title="${proj.name}" data-date="${timelapseDate}">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                       <polygon points="5 3 19 12 5 21 5 3"/>
                   </svg>
               </button>`
            : (timelapseUrl
                ? `<button class="project-timelapse-btn" title="${currentLang === 'tr' ? 'Timelapse İzle' : 'Watch Timelapse'}" data-video-url="${timelapseUrl}" data-title="${proj.name}" data-date="${timelapseDate}">
                       <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                           <polygon points="5 3 19 12 5 21 5 3"/>
                       </svg>
                   </button>`
                : '');
        const previewBtn = isTimelapse ? '' : `
            <button class="project-preview-btn" title="${currentLang === 'tr' ? 'G-code Önizle' : 'Preview G-code'}" data-printer-id="${proj.printerId}" data-filename="${proj.filename}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                </svg>
            </button>
        `;

        const cardId = `all_${proj.id}`;
        return `
            <div class="project-card dashboard-project-card" id="${cardId}" data-printer-id="${proj.printerId}" data-filename="${proj.filename}" tabindex="0" role="button" aria-label="${proj.name}">
                <div class="project-thumb" style="overflow: hidden; background-color: var(--surface-2); position: relative;">
                    <div class="project-thumb-placeholder">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                            <line x1="12" y1="22.08" x2="12" y2="12"/>
                        </svg>
                    </div>
                    ${imgHtml}
                    ${timelapseBtn}
                    ${previewBtn}
                    <span class="project-badge ${badgeClass}">${badgeText}</span>
                </div>
                <div class="project-card-body">
                    <h3 class="project-name" title="${proj.filename}">${displayName}</h3>
                    <div class="project-meta">
                        <span style="font-size: 10.5px; color: var(--text-muted); font-weight: 500;">
                            ${proj.printerName}${detailsText ? ' · ' + detailsText : ''}${timelapseDate ? ' · ' + timelapseDate : ''}
                        </span>
                        <span class="project-pct" style="color: ${progressColor}">${Math.round(proj.progress)}%</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${proj.progress}%; background: ${progressColor}"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // ── Bind click listeners ─────────────────────────────────────────────────
    pageItems.forEach(proj => {
        const cardEl = document.getElementById(`all_${proj.id}`);
        if (cardEl) {
            if (proj._mock) {
                cardEl.addEventListener('click', () => ipcRenderer.send('launch-app', 'orca-slicer.exe'));
            } else if (proj.status === 'timelapse') {
                cardEl.addEventListener('click', () => openTimelapseModal(proj.videoUrl, proj.name, formatEpochToDateTime(proj.modified)));
            } else {
                cardEl.addEventListener('click', () => handleProjectCardClick(proj));
            }

            const tlBtn = cardEl.querySelector('.project-timelapse-btn');
            if (tlBtn) {
                tlBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const videoUrl = tlBtn.getAttribute('data-video-url');
                    const title = tlBtn.getAttribute('data-title');
                    const dateText = tlBtn.getAttribute('data-date') || '';
                    if (videoUrl) {
                        openTimelapseModal(videoUrl, title, dateText);
                    }
                });
            }

            const prevBtn = cardEl.querySelector('.project-preview-btn');
            if (prevBtn) {
                prevBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const printerId = prevBtn.getAttribute('data-printer-id');
                    const filename = prevBtn.getAttribute('data-filename');
                    if (printerId && filename) {
                        openGcodePreview(printerId, filename);
                    }
                });
            }
        }
    });

    // ── Render pagination controls ──────────────────────────────────────────
    const pagContainer = document.getElementById('projects-pagination');
    if (pagContainer) {
        if (totalPages <= 1) {
            pagContainer.innerHTML = '';
            pagContainer.style.display = 'none';
        } else {
            pagContainer.style.display = 'flex';
            let pagHtml = '';

            // Previous button
            const prevDisabled = projectsCurrentPage === 1 ? ' disabled' : '';
            pagHtml += `<button class="pag-btn prev-btn"${prevDisabled} data-page="${projectsCurrentPage - 1}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>`;

            // ── Dynamic Page Numbers (Max 5-6 visible numbers) ──────────────────
            const maxVisiblePages = 5; // Yan yana görünecek maksimum numara sayısı
            let startPage = Math.max(1, projectsCurrentPage - Math.floor(maxVisiblePages / 2));
            let endPage = startPage + maxVisiblePages - 1;

            if (endPage > totalPages) {
                endPage = totalPages;
                startPage = Math.max(1, endPage - maxVisiblePages + 1);
            }

            // İlk sayfayı ve gerekirse '...' ekle
            if (startPage > 1) {
                const activeClass = 1 === projectsCurrentPage ? ' active' : '';
                pagHtml += `<button class="pag-btn num-btn${activeClass}" data-page="1">1</button>`;
                if (startPage > 2) {
                    pagHtml += `<span class="pag-ellipsis" style="padding: 0 4px; color: var(--text-muted);">...</span>`;
                }
            }

            // Orta kısımda dinamik numaraları bas (Maksimum 5 adet)
            for (let i = startPage; i <= endPage; i++) {
                const activeClass = i === projectsCurrentPage ? ' active' : '';
                pagHtml += `<button class="pag-btn num-btn${activeClass}" data-page="${i}">${i}</button>`;
            }

            // Son sayfayı ve gerekirse '...' ekle
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    pagHtml += `<span class="pag-ellipsis" style="padding: 0 4px; color: var(--text-muted);">...</span>`;
                }
                const activeClass = totalPages === projectsCurrentPage ? ' active' : '';
                pagHtml += `<button class="pag-btn num-btn${activeClass}" data-page="${totalPages}">${totalPages}</button>`;
            }

            // Next button
            const nextDisabled = projectsCurrentPage === totalPages ? ' disabled' : '';
            pagHtml += `<button class="pag-btn next-btn"${nextDisabled} data-page="${projectsCurrentPage + 1}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </button>`;

            pagContainer.innerHTML = pagHtml;

            // Bind click events
            pagContainer.querySelectorAll('.pag-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetPage = parseInt(btn.getAttribute('data-page'));
                    if (targetPage && targetPage !== projectsCurrentPage && targetPage >= 1 && targetPage <= totalPages) {
                        projectsCurrentPage = targetPage;
                        renderAllProjects();
                        // Smooth scroll back to top of projects view toolbar
                        const toolbar = document.getElementById('projects-toolbar');
                        if (toolbar) toolbar.scrollIntoView({ behavior: 'smooth' });
                    }
                });
            });
        }
    }
}


async function updateDashboardProjects() {
    const grid = document.getElementById('project-grid');
    if (!grid) return;

    let projects = [];
    const onlinePrinters = printersState.filter(p => p.status !== 'offline' && p.status !== 'connecting' && p.address);

    if (onlinePrinters.length > 0) {
        for (const p of onlinePrinters) {
            let host = p.address;
            if (!host.includes(':') && !p.address.toLowerCase().startsWith('com') && !p.address.toLowerCase().startsWith('/dev/')) {
                host = `${p.address}:7125`;
            }

            // Fetch timelapse files
            try {
                const tlController = new AbortController();
                const tlTimeout = setTimeout(() => tlController.abort(), 2000);
                const tlRes = await fetch(`http://${host}/server/files/list?root=timelapse`, { signal: tlController.signal });
                clearTimeout(tlTimeout);
                if (tlRes.ok) {
                    const tlData = await tlRes.json();
                    if (tlData && tlData.result) {
                        printerTimelapses[p.id] = tlData.result;
                    }
                }
            } catch (err) {
                console.log(`Failed to fetch timelapse list for ${p.name}:`, err);
            }

            let activeFile = null;
            if ((p.status === 'printing' || p.status === 'paused') && p.file && p.file !== '-') {
                activeFile = p.file;
            }

            let fetchedFromHistory = false;

            // 1. Try to fetch from History API
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                const histRes = await fetch(`http://${host}/server/history/list?limit=100`, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (histRes.ok) {
                    const histData = await histRes.json();
                    if (histData && histData.result && histData.result.jobs && histData.result.jobs.length > 0) {
                        fetchedFromHistory = true;
                        let jobs = histData.result.jobs;

                        // Filter out duplicates if the active print is already in the list
                        if (activeFile) {
                            jobs = jobs.filter(j => !(j.filename === activeFile && j.status === 'in_progress'));
                        }

                        // Take top 100 jobs
                        const topJobs = jobs.slice(0, 100);

                        const resolvedProjects = topJobs.map((job) => {
                            const metadata = job.metadata || {};
                            let thumbnailUrl = '';
                            if (metadata.thumbnails && metadata.thumbnails.length > 0) {
                                const thumb = metadata.thumbnails.reduce((prev, current) => {
                                    return (prev.width > current.width) ? prev : current;
                                });
                                thumbnailUrl = `http://${host}/server/files/gcodes/${thumb.relative_path}`;
                            }

                            return {
                                id: `proj_hist_${p.id}_${job.job_id || Math.random()}`,
                                name: job.filename.replace(/\.gcode$/i, ''),
                                filename: job.filename,
                                size: metadata.size || 0,
                                modified: job.end_time || job.start_time || Date.now() / 1000,
                                estimatedTime: metadata.estimated_time || job.print_duration || 0,
                                thumbnailUrl: thumbnailUrl,
                                printerId: p.id,
                                printerName: p.name,
                                printerAddress: p.address,
                                status: (job.status === 'shutdown' || job.status === 'interrupted' || job.status === 'error') ? 'failed' : job.status,
                                progress: (job.completion || 0) * 100,
                                remainingTime: '-'
                            };
                        });
                        projects.push(...resolvedProjects);
                    }
                }
            } catch (err) {
                console.log(`History API not available or failed on ${p.name}, falling back to files list:`, err);
            }

            // 2. Fall back to G-code files list if history fetching failed or was empty
            if (!fetchedFromHistory) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 2000);
                    const listRes = await fetch(`http://${host}/server/files/list?root=gcodes`, { signal: controller.signal });
                    clearTimeout(timeoutId);

                    if (listRes.ok) {
                        const listData = await listRes.json();
                        if (listData && listData.result) {
                            let files = listData.result;
                            files.sort((a, b) => b.modified - a.modified);

                            let topFiles = files.slice(0, 48);
                            if (activeFile && !topFiles.some(f => f.path === activeFile)) {
                                const activeFileObj = files.find(f => f.path === activeFile);
                                if (activeFileObj) {
                                    topFiles.unshift(activeFileObj);
                                } else {
                                    topFiles.unshift({ path: activeFile, modified: Date.now() / 1000, size: 0 });
                                }
                            }

                            const filePromises = topFiles.map(async (file) => {
                                try {
                                    const metaController = new AbortController();
                                    const metaTimeoutId = setTimeout(() => metaController.abort(), 2000);
                                    const metaRes = await fetch(`http://${host}/server/files/metadata?filename=${encodeURIComponent(file.path)}`, { signal: metaController.signal });
                                    clearTimeout(metaTimeoutId);

                                    let metadata = {};
                                    if (metaRes.ok) {
                                        const metaData = await metaRes.json();
                                        if (metaData && metaData.result) {
                                            metadata = metaData.result;
                                        }
                                    }

                                    let thumbnailUrl = '';
                                    if (metadata.thumbnails && metadata.thumbnails.length > 0) {
                                        const thumb = metadata.thumbnails.reduce((prev, current) => {
                                            return (prev.width > current.width) ? prev : current;
                                        });
                                        thumbnailUrl = `http://${host}/server/files/gcodes/${thumb.relative_path}`;
                                    }

                                    const isThisActiveFile = (activeFile && file.path === activeFile);
                                    const isPrinting = isThisActiveFile && p.status === 'printing';
                                    const isPaused = isThisActiveFile && p.status === 'paused';

                                    return {
                                        id: `proj_file_${p.id}_${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
                                        name: file.path.replace(/\.gcode$/i, ''),
                                        filename: file.path,
                                        size: file.size || 0,
                                        modified: file.modified,
                                        estimatedTime: metadata.estimated_time || 0,
                                        thumbnailUrl: thumbnailUrl,
                                        printerId: p.id,
                                        printerName: p.name,
                                        printerAddress: p.address,
                                        status: isPrinting ? 'printing' : (isPaused ? 'paused' : 'ready'),
                                        progress: isThisActiveFile ? p.progress : 100,
                                        remainingTime: isThisActiveFile ? p.remainingTime : '-'
                                    };
                                } catch (err) {
                                    console.error(`Failed to fetch metadata for file ${file.path}:`, err);
                                    const isThisActiveFile = (activeFile && file.path === activeFile);
                                    const isPrinting = isThisActiveFile && p.status === 'printing';
                                    const isPaused = isThisActiveFile && p.status === 'paused';
                                    return {
                                        id: `proj_file_${p.id}_${file.path.replace(/[^a-zA-Z0-9]/g, '_')}`,
                                        name: file.path.replace(/\.gcode$/i, ''),
                                        filename: file.path,
                                        size: file.size || 0,
                                        modified: file.modified,
                                        estimatedTime: 0,
                                        thumbnailUrl: '',
                                        printerId: p.id,
                                        printerName: p.name,
                                        printerAddress: p.address,
                                        status: isPrinting ? 'printing' : (isPaused ? 'paused' : 'ready'),
                                        progress: isThisActiveFile ? p.progress : 100,
                                        remainingTime: isThisActiveFile ? p.remainingTime : '-'
                                    };
                                }
                            });

                            const resolvedFiles = await Promise.all(filePromises);
                            projects.push(...resolvedFiles);
                        }
                    }
                } catch (err) {
                    console.error(`Failed to fetch files list from ${p.name}:`, err);
                }
            }

            // 3. Always insert the real-time active printing project if it exists and is printing/paused
            if (activeFile) {
                // Remove any history entries that match this active print filename on the same printer
                // to make sure we don't display duplicates, and only show the live printing card
                projects = projects.filter(proj => !(proj.printerId === p.id && proj.filename === activeFile && proj.status !== 'printing' && proj.status !== 'paused'));

                // Try to query active print details (like estimated duration) from metadata if we haven't already
                let activeProj = projects.find(proj => proj.printerId === p.id && proj.filename === activeFile && (proj.status === 'printing' || proj.status === 'paused'));

                if (!activeProj) {
                    // Create and add the active project
                    let thumbnailUrl = '';
                    let estTime = 0;
                    try {
                        const metaController = new AbortController();
                        const metaTimeoutId = setTimeout(() => metaController.abort(), 1000);
                        const metaRes = await fetch(`http://${host}/server/files/metadata?filename=${encodeURIComponent(activeFile)}`, { signal: metaController.signal });
                        clearTimeout(metaTimeoutId);

                        if (metaRes.ok) {
                            const metaData = await metaRes.json();
                            if (metaData && metaData.result) {
                                const metadata = metaData.result;
                                estTime = metadata.estimated_time || 0;
                                if (metadata.thumbnails && metadata.thumbnails.length > 0) {
                                    const thumb = metadata.thumbnails.reduce((prev, current) => {
                                        return (prev.width > current.width) ? prev : current;
                                    });
                                    thumbnailUrl = `http://${host}/server/files/gcodes/${thumb.relative_path}`;
                                }
                            }
                        }
                    } catch (e) { }

                    projects.unshift({
                        id: `proj_active_${p.id}_${activeFile.replace(/[^a-zA-Z0-9]/g, '_')}`,
                        name: activeFile.replace(/\.gcode$/i, ''),
                        filename: activeFile,
                        size: 0,
                        modified: Date.now() / 1000 + 1000, // force it to be at the top
                        estimatedTime: estTime,
                        thumbnailUrl: thumbnailUrl,
                        printerId: p.id,
                        printerName: p.name,
                        printerAddress: p.address,
                        status: p.status === 'paused' ? 'paused' : 'printing',
                        progress: p.progress,
                        remainingTime: p.remainingTime
                    });
                } else {
                    // Update its modified timestamp so it bubbles up to the top
                    activeProj.modified = Date.now() / 1000 + 1000;
                    activeProj.progress = p.progress;
                    activeProj.remainingTime = p.remainingTime;
                }
            }
        }
    }

    // Sort combined projects by modified timestamp (descending)
    projects.sort((a, b) => b.modified - a.modified);

    // Limit to top 4 projects to display
    const finalProjects = projects.slice(0, 4);

    // Fallback if no projects loaded
    if (projects.length === 0) {
        dashboardProjects = [];
        allProjectsState = [];
        renderMockProjects();
        if (projectsView && !projectsView.classList.contains('hidden')) {
            renderAllProjects();
        }
        return;
    }

    dashboardProjects = finalProjects;
    allProjectsState = projects;

    renderDynamicProjects();
    if (projectsView && !projectsView.classList.contains('hidden')) {
        renderAllProjects();
    }
}

function updateDashboardActivePrints() {
    const cards = document.querySelectorAll('.dashboard-project-card');
    cards.forEach(card => {
        const printerId = card.getAttribute('data-printer-id');
        const filename = card.getAttribute('data-filename');
        if (!printerId || !filename) return;

        const p = printersState.find(x => x.id === printerId);
        if (!p) return;

        // If this card represents the active file on the printer
        if (p.file === filename && (p.status === 'printing' || p.status === 'paused')) {
            const pctEl = card.querySelector('.project-pct');
            const fillEl = card.querySelector('.progress-fill');
            const metaEl = card.querySelector('.project-meta span');
            const badgeEl = card.querySelector('.project-badge');

            const roundedPct = Math.round(p.progress);
            if (pctEl) pctEl.innerText = `${roundedPct}%`;
            if (fillEl) fillEl.style.width = `${p.progress}%`;

            const isPrinting = p.status === 'printing';
            if (badgeEl) {
                badgeEl.innerText = isPrinting ? 'YAZDIRILIYOR' : 'DURAKLATILDI';
                badgeEl.className = `project-badge ${isPrinting ? 'badge-progress' : 'badge-testing'}`;
            }

            if (metaEl) {
                const detailsText = p.remainingTime && p.remainingTime !== '-' ? `Kalan: ${p.remainingTime}` : 'Süre hesaplanıyor...';
                metaEl.innerText = `${p.name} · ${detailsText}`;
            }
        }
    });
}

// Live Update & Real Klipper Connection Loop
setInterval(async () => {
    let changed = false;
    let needsFullReRender = false;

    for (let p of printersState) {
        if (p.status === 'offline' || p.status === 'connecting') {
            p.webhookState = null;
            p.webhookMessage = null;
            if (p.status === 'offline' && p.address) {
                // Auto-reconnect check
                if (p.nextReconnectAttempt === undefined) {
                    p.nextReconnectAttempt = 0;
                }
                const now = Date.now();
                if (now >= p.nextReconnectAttempt) {
                    // Try to reconnect every 10 seconds (cooldown)
                    p.nextReconnectAttempt = now + 10000;

                    console.log(`[Auto-Reconnect] Attempting to connect to ${p.name} at ${p.address}...`);

                    (async () => {
                        const kStatus = await fetchKlipperData(p);
                        const connected = (kStatus !== null);

                        if (connected) {
                            console.log(`[Auto-Reconnect] Reconnect successful for ${p.name}`);
                            p.status = 'idle';
                            p.failCount = 0;
                            p.t0Temp = 24; p.t1Temp = 23; p.t2Temp = 24; p.t3Temp = 24;
                            p.bedTemp = 25; p.envTemp = 25;
                            p.targetT0Temp = 0; p.targetT1Temp = 0; p.targetT2Temp = 0; p.targetT3Temp = 0;
                            p.targetBedTemp = 0; p.targetEnvTemp = 0;
                            p.extruderSpeed = 0;
                            p.flow = 0;

                            savePrinters();
                            renderPrinters();
                        }
                    })();
                }
            }
            continue; // Skip offline/connecting printers from fetching
        }

        const oldStatus = p.status;
        const oldFile = p.file || '-';
        const oldProgress = p.progress || 0;

        // Capture snapshot for change detection (first time or update)
        if (!printerStatusSnapshot[p.id]) {
            printerStatusSnapshot[p.id] = { status: p.status, file: p.file || '-', progress: p.progress || 0, initialized: false };
        }
        const snap = printerStatusSnapshot[p.id];

        // Try to query real Klipper (Moonraker) status
        const klipperStatus = await fetchKlipperData(p);

        if (klipperStatus) {
            // Check webhook status
            if (klipperStatus.webhooks) {
                p.webhookState = klipperStatus.webhooks.state;
                p.webhookMessage = klipperStatus.webhooks.state_message;
            } else {
                p.webhookState = null;
                p.webhookMessage = null;
            }

            // 1. Update State
            const state = klipperStatus.print_stats ? klipperStatus.print_stats.state : 'idle';
            if (state === 'printing') {
                p.status = 'printing';
            } else if (state === 'paused') {
                p.status = 'paused';
            } else {
                p.status = 'idle';
            }

            // 2. Extruders T0-T3 Temp mapped using active slots
            let activeSlots = [true, true, true, true];
            let hasC2pVariables = false;

            if (klipperStatus.c2p_save_variables && klipperStatus.c2p_save_variables.variables) {
                const vars = klipperStatus.c2p_save_variables.variables;
                if (vars.state_t0 !== undefined || vars.state_t1 !== undefined || vars.state_t2 !== undefined || vars.state_t3 !== undefined) {
                    activeSlots[0] = vars.state_t0 === 1;
                    activeSlots[1] = vars.state_t1 === 1;
                    activeSlots[2] = vars.state_t2 === 1;
                    activeSlots[3] = vars.state_t3 === 1;
                    hasC2pVariables = true;
                }
            }

            if (!hasC2pVariables && p.availableObjects) {
                activeSlots[0] = p.availableObjects.includes('extruder');
                activeSlots[1] = p.availableObjects.includes('extruder1');
                activeSlots[2] = p.availableObjects.includes('extruder2');
                activeSlots[3] = p.availableObjects.includes('extruder3');
            }

            const klipperExtruderNames = ['extruder', 'extruder1', 'extruder2', 'extruder3'];
            let klipperIdx = 0;

            for (let slotIdx = 0; slotIdx < 4; slotIdx++) {
                let tempVal = null;
                let targetVal = null;

                if (activeSlots[slotIdx]) {
                    const kName = klipperExtruderNames[klipperIdx];
                    if (kName && klipperStatus[kName]) {
                        tempVal = klipperStatus[kName].temperature || 0;
                        targetVal = klipperStatus[kName].target || 0;
                    }
                    klipperIdx++;
                }

                if (slotIdx === 0) {
                    p.t0Temp = tempVal;
                    p.targetT0Temp = targetVal;
                } else if (slotIdx === 1) {
                    p.t1Temp = tempVal;
                    p.targetT1Temp = targetVal;
                } else if (slotIdx === 2) {
                    p.t2Temp = tempVal;
                    p.targetT2Temp = targetVal;
                } else if (slotIdx === 3) {
                    p.t3Temp = tempVal;
                    p.targetT3Temp = targetVal;
                }
            }

            // 3. Bed Temp
            if (p.availableObjects) {
                if (p.availableObjects.includes('heater_bed')) {
                    if (klipperStatus.heater_bed) {
                        p.bedTemp = klipperStatus.heater_bed.temperature || 0;
                        p.targetBedTemp = klipperStatus.heater_bed.target || 0;
                    }
                } else {
                    p.bedTemp = null;
                    p.targetBedTemp = null;
                }
            } else {
                if (klipperStatus.heater_bed) {
                    p.bedTemp = klipperStatus.heater_bed.temperature || 0;
                    p.targetBedTemp = klipperStatus.heater_bed.target || 0;
                }
            }

            // 4. Chamber/Env Temp
            if (p.availableObjects) {
                const hasEnv = p.availableObjects.includes('heater_generic Env_heater') ||
                    p.availableObjects.includes('temperature_sensor chamber') ||
                    p.availableObjects.includes('temperature_sensor ortam') ||
                    p.availableObjects.includes('temperature_sensor Env_sensor');
                if (hasEnv) {
                    const envObj = klipperStatus['heater_generic Env_heater'] ||
                        klipperStatus['temperature_sensor chamber'] ||
                        klipperStatus['temperature_sensor ortam'] ||
                        klipperStatus['temperature_sensor Env_sensor'];
                    if (envObj) {
                        p.envTemp = envObj.temperature || 0;
                        p.targetEnvTemp = envObj.target || 0;
                    }
                } else {
                    p.envTemp = null;
                    p.targetEnvTemp = null;
                }
            } else {
                const envObj = klipperStatus['heater_generic Env_heater'] ||
                    klipperStatus['temperature_sensor chamber'] ||
                    klipperStatus['temperature_sensor ortam'] ||
                    klipperStatus['temperature_sensor Env_sensor'];
                if (envObj) {
                    p.envTemp = envObj.temperature || 0;
                    p.targetEnvTemp = envObj.target || 0;
                }
            }

            // 5. Progress
            if (klipperStatus.virtual_sdcard) {
                p.progress = (klipperStatus.virtual_sdcard.progress || 0) * 100;
            }

            // 6. Print Speed & Extrusion stats (motion_report.live_velocity / live_extruder_velocity)
            if (klipperStatus.motion_report) {
                p.speed = Math.round(klipperStatus.motion_report.live_velocity || 0);
                const extVel = klipperStatus.motion_report.live_extruder_velocity || 0;
                p.extruderSpeed = extVel;
                p.flow = extVel * 2.40528;
            } else {
                if (klipperStatus.gcode_move) {
                    p.speed = Math.round((klipperStatus.gcode_move.speed || 0) / 60);
                } else {
                    p.speed = 0;
                }
                p.extruderSpeed = 0;
                p.flow = 0;
            }

            // 7. File & Remaining Time
            if (klipperStatus.print_stats) {
                p.file = klipperStatus.print_stats.filename || '-';

                p.printDuration = klipperStatus.print_stats.print_duration || 0;
                p.totalDuration = klipperStatus.print_stats.total_duration || 0;

                const duration = p.printDuration;
                const progress = klipperStatus.virtual_sdcard ? klipperStatus.virtual_sdcard.progress : 0;



                if (p.status === 'printing' && progress > 0.01) {
                    const totalSecs = (duration / progress) - duration;
                    const totalMins = Math.round(totalSecs / 60);
                    if (totalMins > 60) {
                        p.remainingTime = Math.floor(totalMins / 60) + 's ' + (totalMins % 60) + 'dk';
                    } else {
                        p.remainingTime = totalMins + 'dk';
                    }
                } else {
                    p.remainingTime = '-';
                }
            }

            // ─── Notification Triggers (Klipper real printer) ────────────
            if (snap.initialized) {
                const prevStatus = snap.status;
                const prevFile = snap.file;
                const curFile = p.file || '-';
                const curStatus = p.status;
                const prevWebhook = snap.webhookState || null;
                const curWebhook = p.webhookState || null;

                // ── Print status transitions ──────────────────────────────
                if (prevStatus !== 'printing' && curStatus === 'printing') {
                    const isResume = prevStatus === 'paused' && !snap.pendingNewPrint;
                    handlePrintStartTransition(p, snap, prevStatus, curFile, isResume);
                } else if (prevStatus === 'printing' && curStatus === 'paused') {
                    addNotification('pause', 'Baskı Duraklatıldı', `${p.name}: ${curFile}`);
                    logPrinterEvent(p, 'status', `Baskı Duraklatıldı - Dosya: ${curFile}`);
                } else if ((prevStatus === 'printing' || prevStatus === 'paused') && curStatus === 'idle') {
                    if (snap.progress >= 98) {
                        addNotification('complete', 'Baskı Tamamlandı', `${p.name}: ${prevFile}`);
                        markPrintSessionCompleted(p, prevFile, snap.progress || 100);
                    } else if (!snap.pendingNewPrint) {
                        addNotification('cancel', 'Baskı İptal Edildi', `${p.name}: ${prevFile} (%${Math.round(snap.progress)})`);
                        markPrintSessionCancelled(p, prevFile, snap.progress || 0);
                    }
                }

                // ── Webhook (shutdown / error) geçiş bildirimi ───────────
                if (prevWebhook !== curWebhook) {
                    if (curWebhook === 'shutdown') {
                        addNotification('error', '⚠️ Yazıcı Kapandı (Shutdown)', `${p.name}: ${p.webhookMessage || 'Firmware shutdown algılandı.'}`);
                        logPrinterEvent(p, 'error', `⚠️ Yazıcı Kapandı (Shutdown): ${p.webhookMessage || 'Firmware shutdown algılandı.'}`);
                    } else if (curWebhook === 'error') {
                        addNotification('error', '❌ Yazıcı Hata Durumu', `${p.name}: ${p.webhookMessage || 'Klipper hata bildirdi.'}`);
                        logPrinterEvent(p, 'error', `❌ Yazıcı Hata Durumu: ${p.webhookMessage || 'Klipper hata bildirdi.'}`);
                    }
                }

                // ── Periodic progress logs (every 1%) ──────────────────────
                if (p.status === 'printing') {
                    const curProg = Math.floor(p.progress || 0);
                    if (snap.lastLoggedProgress === undefined) {
                        snap.lastLoggedProgress = -1;
                    }
                    if (snap.lastLoggedProgress >= 0 && curProg < snap.lastLoggedProgress) {
                        snap.lastLoggedProgress = -1;
                    }
                    if (snap.lastLoggedProgress === -1 || (curProg - snap.lastLoggedProgress >= 1)) {
                        snap.lastLoggedProgress = curProg;
                        logPrinterEvent(p, 'progress', buildProgressString(p, curProg));
                    }
                } else if (p.status !== 'paused') {
                    snap.lastLoggedProgress = -1;
                }
            }
            // Update snapshot print stats when active
            if (p.status === 'printing' || p.status === 'paused') {
                if (p.printDuration > 0) snap.lastPrintDuration = p.printDuration;
                if (p.totalDuration > 0) snap.lastTotalDuration = p.totalDuration;
            }

            // Update snapshot
            snap.status = p.status;
            snap.file = p.file || '-';
            snap.progress = p.progress || 0;
            snap.webhookState = p.webhookState || null;
            snap.initialized = true;
            // ─────────────────────────────────────────────────────────────

            if (p.status !== oldStatus) {
                needsFullReRender = true;
            }
            changed = true;
        } else {
            p.webhookState = null;
            p.webhookMessage = null;
            if (p.address) {
                // Real printer connection failure
                if (!p.failCount) p.failCount = 0;
                p.failCount++;
                if (p.failCount >= 3) {
                    p.status = 'offline';
                    p.failCount = 0;
                    needsFullReRender = true;
                    changed = true;
                    savePrinters();
                }
            } else {
                // Simulation Fallback
                const isM1Pro = p.model === 'Layerstech M1pro';
                const isM1 = p.model === 'Layerstech M1';

                if (!isM1Pro && !isM1) {
                    p.t1Temp = null; p.targetT1Temp = null;
                }
                if (!isM1Pro) {
                    p.t2Temp = null; p.targetT2Temp = null;
                    p.t3Temp = null; p.targetT3Temp = null;
                    p.envTemp = null; p.targetEnvTemp = null;
                }

                if (p.status === 'printing') {
                    p.progress += Math.random() * 0.4 + 0.1;
                    p.speed = 120 + Math.round((Math.random() - 0.5) * 10);
                    p.extruderSpeed = Math.random() * 0.3 + 0.15;
                    p.flow = p.extruderSpeed * 2.40528;
                    if (p.progress >= 100) {
                        p.progress = 100;
                        p.status = 'idle';
                        p.file = '-';
                        p.speed = 0;
                        p.targetT0Temp = 0;
                        p.targetT1Temp = (isM1Pro || isM1) ? 0 : null;
                        p.targetT2Temp = isM1Pro ? 0 : null;
                        p.targetT3Temp = isM1Pro ? 0 : null;
                        p.targetBedTemp = 0;
                        p.targetEnvTemp = isM1Pro ? 0 : null;
                    } else {
                        const pctLeft = 100 - p.progress;
                        const totalMins = Math.round(pctLeft * 1.5);
                        if (totalMins > 60) {
                            p.remainingTime = Math.floor(totalMins / 60) + 's ' + (totalMins % 60) + 'dk';
                        } else {
                            p.remainingTime = totalMins + 'dk';
                        }
                    }

                    // Simulate T0-T3
                    const updateTemp = (curr, target, factorCurr, factorRand) => {
                        let next = curr;
                        if (next < target) {
                            next += Math.random() * factorCurr + factorRand;
                            if (next > target) next = target;
                        } else if (next > target) {
                            next -= Math.random() * factorCurr + factorRand;
                            if (next < target) next = target;
                        } else {
                            next += (Math.random() - 0.5) * 1.2;
                        }
                        return next;
                    };

                    p.t0Temp = p.t0Temp === null ? null : updateTemp(p.t0Temp || 24, p.targetT0Temp || 0, 5, 2);
                    p.t1Temp = p.t1Temp === null ? null : updateTemp(p.t1Temp || 24, p.targetT1Temp || 0, 5, 2);
                    p.t2Temp = p.t2Temp === null ? null : updateTemp(p.t2Temp || 24, p.targetT2Temp || 0, 5, 2);
                    p.t3Temp = p.t3Temp === null ? null : updateTemp(p.t3Temp || 24, p.targetT3Temp || 0, 5, 2);

                    if (p.bedTemp !== null) {
                        if (p.bedTemp < p.targetBedTemp) {
                            p.bedTemp += Math.random() * 3 + 1;
                            if (p.bedTemp > p.targetBedTemp) p.bedTemp = p.targetBedTemp;
                        } else if (p.bedTemp > p.targetBedTemp) {
                            p.bedTemp -= Math.random() * 2 + 0.5;
                            if (p.bedTemp < p.targetBedTemp) p.bedTemp = p.targetBedTemp;
                        } else {
                            p.bedTemp += (Math.random() - 0.5) * 0.6;
                        }
                    }

                    if (p.envTemp !== null) {
                        if (p.envTemp < p.targetEnvTemp) {
                            p.envTemp += Math.random() * 2 + 0.5;
                            if (p.envTemp > p.targetEnvTemp) p.envTemp = p.targetEnvTemp;
                        } else if (p.envTemp > p.targetEnvTemp) {
                            p.envTemp -= Math.random() * 1 + 0.2;
                            if (p.envTemp < p.targetEnvTemp) p.envTemp = p.targetEnvTemp;
                        } else {
                            p.envTemp += (Math.random() - 0.5) * 0.3;
                        }
                    }

                    changed = true;
                } else if (p.status === 'paused') {
                    const updateTemp = (curr, target, factorCurr, factorRand) => {
                        let next = curr;
                        if (next < target) {
                            next += Math.random() * factorCurr + factorRand;
                            if (next > target) next = target;
                        } else if (next > target) {
                            next -= Math.random() * factorCurr + factorRand;
                            if (next < target) next = target;
                        } else {
                            next += (Math.random() - 0.5) * 1.2;
                        }
                        return next;
                    };

                    const oldT0 = p.t0Temp;
                    const oldT1 = p.t1Temp;
                    const oldT2 = p.t2Temp;
                    const oldT3 = p.t3Temp;
                    const oldBed = p.bedTemp;
                    const oldEnv = p.envTemp;

                    p.t0Temp = p.t0Temp === null ? null : updateTemp(p.t0Temp || 24, p.targetT0Temp || 0, 5, 2);
                    p.t1Temp = p.t1Temp === null ? null : updateTemp(p.t1Temp || 24, p.targetT1Temp || 0, 5, 2);
                    p.t2Temp = p.t2Temp === null ? null : updateTemp(p.t2Temp || 24, p.targetT2Temp || 0, 5, 2);
                    p.t3Temp = p.t3Temp === null ? null : updateTemp(p.t3Temp || 24, p.targetT3Temp || 0, 5, 2);

                    if (p.bedTemp !== null) {
                        if (p.bedTemp < p.targetBedTemp) {
                            p.bedTemp += Math.random() * 3 + 1;
                            if (p.bedTemp > p.targetBedTemp) p.bedTemp = p.targetBedTemp;
                        } else if (p.bedTemp > p.targetBedTemp) {
                            p.bedTemp -= Math.random() * 2 + 0.5;
                            if (p.bedTemp < p.targetBedTemp) p.bedTemp = p.targetBedTemp;
                        } else {
                            p.bedTemp += (Math.random() - 0.5) * 0.6;
                        }
                    }

                    if (p.envTemp !== null) {
                        if (p.envTemp < p.targetEnvTemp) {
                            p.envTemp += Math.random() * 2 + 0.5;
                            if (p.envTemp > p.targetEnvTemp) p.envTemp = p.targetEnvTemp;
                        } else if (p.envTemp > p.targetEnvTemp) {
                            p.envTemp -= Math.random() * 1 + 0.2;
                            if (p.envTemp < p.targetEnvTemp) p.envTemp = p.targetEnvTemp;
                        } else {
                            p.envTemp += (Math.random() - 0.5) * 0.3;
                        }
                    }

                    p.speed = 0;
                    p.extruderSpeed = 0;
                    p.flow = 0;

                    if (p.t0Temp !== oldT0 || p.t1Temp !== oldT1 || p.t2Temp !== oldT2 || p.t3Temp !== oldT3 || p.bedTemp !== oldBed || p.envTemp !== oldEnv) {
                        changed = true;
                    }
                } else if (p.status === 'idle') {
                    const updateTemp = (curr, target, factorCurr, factorRand) => {
                        let next = curr;
                        if (next < target) {
                            next += Math.random() * factorCurr + factorRand;
                            if (next > target) next = target;
                        } else if (next > target) {
                            next -= Math.random() * factorCurr + factorRand;
                            if (next < target) next = target;
                        }
                        return next;
                    };

                    const oldT0 = p.t0Temp;
                    const oldT1 = p.t1Temp;
                    const oldT2 = p.t2Temp;
                    const oldT3 = p.t3Temp;
                    const oldBed = p.bedTemp;
                    const oldEnv = p.envTemp;

                    p.t0Temp = p.t0Temp === null ? null : updateTemp(p.t0Temp || 24, p.targetT0Temp || 0, 6, 3);
                    p.t1Temp = p.t1Temp === null ? null : updateTemp(p.t1Temp || 24, p.targetT1Temp || 0, 6, 3);
                    p.t2Temp = p.t2Temp === null ? null : updateTemp(p.t2Temp || 24, p.targetT2Temp || 0, 6, 3);
                    p.t3Temp = p.t3Temp === null ? null : updateTemp(p.t3Temp || 24, p.targetT3Temp || 0, 6, 3);

                    if (p.bedTemp !== null) {
                        if (p.bedTemp < p.targetBedTemp) {
                            p.bedTemp += Math.random() * 4 + 1;
                            if (p.bedTemp > p.targetBedTemp) p.bedTemp = p.targetBedTemp;
                        } else if (p.bedTemp > p.targetBedTemp) {
                            p.bedTemp -= Math.random() * 2 + 0.5;
                            if (p.bedTemp < p.targetBedTemp) p.bedTemp = p.targetBedTemp;
                        }
                    }

                    if (p.envTemp !== null) {
                        if (p.envTemp < p.targetEnvTemp) {
                            p.envTemp += Math.random() * 2 + 0.5;
                            if (p.envTemp > p.targetEnvTemp) p.envTemp = p.targetEnvTemp;
                        } else if (p.envTemp > p.targetEnvTemp) {
                            p.envTemp -= Math.random() * 1 + 0.2;
                            if (p.envTemp < p.targetEnvTemp) p.envTemp = p.targetEnvTemp;
                        }
                    }

                    p.speed = 0;
                    p.extruderSpeed = 0;
                    p.flow = 0;

                    if (p.t0Temp !== oldT0 || p.t1Temp !== oldT1 || p.t2Temp !== oldT2 || p.t3Temp !== oldT3 || p.bedTemp !== oldBed || p.envTemp !== oldEnv) {
                        changed = true;
                    }
                }

                if (p.status !== oldStatus) {
                    needsFullReRender = true;
                }

                // ─── Notification Triggers (Simulation) ──────────────────
                if (snap.initialized) {
                    const prevStatus = snap.status;
                    const prevFile = snap.file;
                    const curFile = p.file || '-';
                    const curStatus = p.status;
                    const prevWebhook = snap.webhookState || null;
                    const curWebhook = p.webhookState || null;

                    // ── Print status transitions ──────────────────────────
                    if (prevStatus !== 'printing' && curStatus === 'printing') {
                        const isResume = prevStatus === 'paused' && !snap.pendingNewPrint;
                        handlePrintStartTransition(p, snap, prevStatus, curFile, isResume);
                    } else if (prevStatus === 'printing' && curStatus === 'paused') {
                        addNotification('pause', 'Baskı Duraklatıldı', `${p.name}: ${curFile}`);
                        logPrinterEvent(p, 'status', `Baskı Duraklatıldı - Dosya: ${curFile}`);
                    } else if ((prevStatus === 'printing' || prevStatus === 'paused') && curStatus === 'idle') {
                        if (snap.progress >= 98) {
                            addNotification('complete', 'Baskı Tamamlandı', `${p.name}: ${prevFile}`);
                            markPrintSessionCompleted(p, prevFile, snap.progress || 100);
                        } else if (!snap.pendingNewPrint) {
                            addNotification('cancel', 'Baskı İptal Edildi', `${p.name}: ${prevFile} (%${Math.round(snap.progress)})`);
                            markPrintSessionCancelled(p, prevFile, snap.progress || 0);
                        }
                    }

                    // ── Webhook (shutdown / error) geçiş bildirimi ────────
                    if (prevWebhook !== curWebhook) {
                        if (curWebhook === 'shutdown') {
                            addNotification('error', '⚠️ Yazıcı Kapandı (Shutdown)', `${p.name}: ${p.webhookMessage || 'Firmware shutdown algılandı.'}`);
                            logPrinterEvent(p, 'error', `⚠️ Yazıcı Kapandı (Shutdown): ${p.webhookMessage || 'Firmware shutdown algılandı.'}`);
                        } else if (curWebhook === 'error') {
                            addNotification('error', '❌ Yazıcı Hata Durumu', `${p.name}: ${p.webhookMessage || 'Klipper hata bildirdi.'}`);
                            logPrinterEvent(p, 'error', `❌ Yazıcı Hata Durumu: ${p.webhookMessage || 'Klipper hata bildirdi.'}`);
                        }
                    }

                    // ── Periodic progress logs (every 1%) ──────────────────────
                    if (p.status === 'printing') {
                        const curProg = Math.floor(p.progress || 0);
                        if (snap.lastLoggedProgress === undefined) {
                            snap.lastLoggedProgress = -1;
                        }
                        if (snap.lastLoggedProgress >= 0 && curProg < snap.lastLoggedProgress) {
                            snap.lastLoggedProgress = -1;
                        }
                        if (snap.lastLoggedProgress === -1 || (curProg - snap.lastLoggedProgress >= 1)) {
                            snap.lastLoggedProgress = curProg;
                            logPrinterEvent(p, 'progress', buildProgressString(p, curProg));
                        }
                    } else if (p.status !== 'paused') {
                        snap.lastLoggedProgress = -1;
                    }
                }
                // Update resource statistics for online printers (simulation baseline / live fluctuations)
                if (p.status !== 'offline' && p.status !== 'connecting') {
                    simulateHwStats(p);
                    changed = true;
                }

                // Update snapshot
                snap.status = p.status;
                snap.file = p.file || '-';
                snap.progress = p.progress || 0;
                snap.webhookState = p.webhookState || null;
                snap.initialized = true;
                // ─────────────────────────────────────────────────────────
            }
        }
    }

    if (changed && printersView && !printersView.classList.contains('hidden')) {
        if (needsFullReRender) {
            renderPrinters();
        } else {
            for (let p of printersState) {
                updatePrinterDom(p);
            }
            // Update global stats
            const totalPrinters = printersState.length;
            const activePrinters = printersState.filter(p => p.status === 'printing' || p.status === 'paused').length;
            const idlePrinters = printersState.filter(p => p.status === 'idle').length;
            const offlinePrinters = printersState.filter(p => p.status === 'offline').length;

            const statTotal = document.getElementById('stat-total-printers');
            const statActive = document.getElementById('stat-active-printers');
            const statIdle = document.getElementById('stat-idle-printers');
            const statOffline = document.getElementById('stat-offline-printers');

            if (statTotal) statTotal.innerText = totalPrinters;
            if (statActive) statActive.innerText = activePrinters;
            if (statIdle) statIdle.innerText = idlePrinters;
            if (statOffline) statOffline.innerText = offlinePrinters;
        }
    }

    // Live update active dashboard prints
    updateDashboardActivePrints();

    // Query new project list every 15 seconds
    const now = Date.now();
    if (now - lastProjectsUpdate > 15000) {
        lastProjectsUpdate = now;
        updateDashboardProjects();
    }

    // Query printer total print times every 15 seconds
    if (now - lastTotalDurationUpdate > 15000) {
        lastTotalDurationUpdate = now;
        loadAllPrinterTotalDurations().then(() => renderPrinters());
    }

    // Update webhook warning alerts
    updateWebhookAlerts();
}, 1000);

// ─── Wiki Toolbar Buttons ─────────────────────────────────────────────────────

const wikiBackBtn = document.getElementById('wiki-back-btn');
const wikiForwardBtn = document.getElementById('wiki-forward-btn');
const wikiReloadBtn = document.getElementById('wiki-reload-btn');

if (wikiBackBtn) wikiBackBtn.addEventListener('click', () => wikiWebview.goBack());
if (wikiForwardBtn) wikiForwardBtn.addEventListener('click', () => wikiWebview.goForward());
if (wikiReloadBtn) wikiReloadBtn.addEventListener('click', () => wikiWebview.reload());

// ─── Printer Host Toolbar Buttons ──────────────────────────────────────────────

const printerHostBackBtn = document.getElementById('printer-host-back-btn');
const printerHostReloadBtn = document.getElementById('printer-host-reload-btn');

if (printerHostBackBtn) {
    printerHostBackBtn.addEventListener('click', () => {
        if (printerHostWebview) printerHostWebview.src = 'about:blank';
        showPrinters();
    });
}
if (printerHostReloadBtn) {
    printerHostReloadBtn.addEventListener('click', () => {
        if (printerHostWebview) printerHostWebview.reload();
    });
}



// ─── Project Card Click ──────────────────────────────────────────────────────

const projectFabricCard = document.getElementById('project-fabric-card');
if (projectFabricCard) {
    projectFabricCard.addEventListener('click', () => {
        console.log('Opening Technical Fabric Proto project...');
        ipcRenderer.send('launch-app', 'orca-slicer.exe');
    });
}

const projectFeatherCard = document.getElementById('project-feather-card');
if (projectFeatherCard) {
    projectFeatherCard.addEventListener('click', () => {
        console.log('Opening Aero Feather Wing project...');
        ipcRenderer.send('launch-laser');
    });
}

// ─── Keyboard Accessibility for Tool Cards ───────────────────────────────────

document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
        }
    });
});

// ─── Search Input ────────────────────────────────────────────────────────────

const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            searchInput.blur();
        }
    });
}

// ─── Profile Avatar → Show Profile ───────────────────────────────────────────

const userAvatar = document.querySelector('.user-avatar');
if (userAvatar) {
    userAvatar.addEventListener('click', () => {
        const navProfile = document.getElementById('nav-profile');
        if (navProfile) {
            navProfile.click();
        } else {
            ipcRenderer.send('logout');
        }
    });
}

// ─── Profile Tab Actions ──────────────────────────────────────────────────────
const profileLogoutBtn = document.getElementById('profile-logout-btn');
if (profileLogoutBtn) {
    profileLogoutBtn.addEventListener('click', () => {
        ipcRenderer.send('logout');
    });
}

const profileRefreshBtn = document.getElementById('profile-refresh-btn');
if (profileRefreshBtn) {
    profileRefreshBtn.addEventListener('click', () => {
        updateProfileSessionTime();
        showCustomConfirm('Yenilendi', 'Profil verileri ve oturum durumu başarıyla yenilendi.', 'Tamam', null, 'success');
    });
}

// ─── Diagnostic Log Button ───────────────────────────────────────────────────

const logBtn = document.getElementById('show-log-btn');
if (logBtn) {
    logBtn.addEventListener('click', () => {
        ipcRenderer.send('show-log');
    });
}

// ─── Initialize Dashboard Projects ──────────────────────────────────────────
setTimeout(() => {
    updateDashboardProjects();
}, 500);

// ─── Language Switcher ───────────────────────────────────────────────────────
document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setLang(btn.dataset.lang);
        // Update webhook alerts text immediately
        if (typeof updateWebhookAlerts === 'function') {
            updateWebhookAlerts();
        }
        // Re-render dynamic views if visible
        const nv = document.getElementById('notifications-view');
        if (nv && !nv.classList.contains('hidden')) {
            renderNotificationsPage();
            populateNotifMachineFilters();
        }
        const pv = document.getElementById('printers-view');
        if (pv && !pv.classList.contains('hidden')) {
            renderPrinters();
        }
        const wv = document.getElementById('workspace-view');
        if (wv && !wv.classList.contains('hidden')) {
            loadWorkspaceStats();
        }
        const prv = document.getElementById('profile-view');
        if (prv && !prv.classList.contains('hidden')) {
            showProfile();
        }
    });
});

// ─── Initial i18n apply ──────────────────────────────────────────────────────
applyTranslations();

// ─── WORKSPACE (Workshop Statistics & Calculations) ────────────────────────
async function loadWorkspaceStats() {
    let totalSeconds = 0;
    let totalJobs = 0;
    let successfulJobs = 0;

    // Collect all jobs with timestamps for the chart
    const allChartJobs = []; // { ts: epochSeconds, status: 'completed'|'failed'|... }

    const printerListEl = document.getElementById('wprinter-list');
    if (printerListEl) printerListEl.innerHTML = '';

    // Loop through printers in printersState
    const fetchPromises = printersState.map(async (p) => {
        let printTime = 0;
        let jobsCount = 0;
        let successRate = 0;
        let hasData = false;

        // If it has a connection address and is not offline
        if (p.status !== 'offline' && p.status !== 'connecting' && p.address) {
            try {
                const url = getMoonrakerUrl(p.address, '/server/history/totals');
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    if (data && data.result && data.result.job_totals) {
                        const t = data.result.job_totals;
                        printTime = t.total_print_time || 0; // seconds
                        jobsCount = t.total_jobs || 0;

                        try {
                            const listUrl = getMoonrakerUrl(p.address, '/server/history/list', 'limit=500');
                            const listController = new AbortController();
                            const listTimeout = setTimeout(() => listController.abort(), 4000);
                            const listRes = await fetch(listUrl, { signal: listController.signal });
                            clearTimeout(listTimeout);
                            if (listRes.ok) {
                                const listData = await listRes.json();
                                if (listData && listData.result && listData.result.jobs) {
                                    const jobs = listData.result.jobs;
                                    const completed = jobs.filter(j => j.status === 'completed').length;
                                    successRate = jobs.length > 0 ? Math.round((completed / jobs.length) * 100) : 100;
                                    successfulJobs += Math.round(jobsCount * (successRate / 100));

                                    // Collect timestamps for chart
                                    jobs.forEach(j => {
                                        if (j.start_time) {
                                            allChartJobs.push({
                                                ts: j.start_time,
                                                status: j.status,
                                                duration: j.print_duration || 0,
                                                printerId: p.id,
                                                filename: j.filename || 'unknown.gcode'
                                            });
                                        }
                                    });
                                }
                            }
                        } catch (e) {
                            successRate = 95; // realistic fallback
                            successfulJobs += Math.round(jobsCount * 0.95);
                        }

                        hasData = true;
                    }
                }
            } catch (e) {
                console.error(`Failed to fetch stats for printer ${p.name} from ${host}:`, e);
            }
        }

        // Fallback to mock / stored stats if no data fetched (e.g. printer is offline or simulated)
        if (!hasData) {
            const num = parseInt(p.id.replace(/\D/g, ''), 10) || 12345;
            const localTotalMins = printerTotalDurations[p.id] || 0;
            printTime = localTotalMins > 0 ? (localTotalMins * 60) : (((num % 120) + 12) * 3600 + (num % 60) * 60); // hours and minutes (min 12h)
            jobsCount = (num % 25) + 6; // jobs (between 6 and 31)
            successRate = 90 + (num % 10); // success rate (90-99%)
            successfulJobs += Math.round(jobsCount * (successRate / 100));

            // Generate mock chart data spread over last 90 days
            const now = Date.now() / 1000;
            const mockGcodes = ['Gearbox.gcode', 'Housing_v3.gcode', 'Bracket_v2.gcode', 'benchy.gcode', 'extruder_mount.gcode', 'spool_holder.gcode', 'cable_clip.gcode', 'knob_cover.gcode'];
            for (let i = 0; i < jobsCount; i++) {
                const daysAgo = Math.random() * 90;
                allChartJobs.push({
                    ts: now - daysAgo * 86400,
                    status: Math.random() < (successRate / 100) ? 'completed' : 'failed',
                    duration: (Math.random() * 6 + 1) * 3600, // 1 to 7 hours in seconds
                    printerId: p.id,
                    filename: mockGcodes[Math.floor(Math.random() * mockGcodes.length)]
                });
            }
        }

        totalSeconds += printTime;
        totalJobs += jobsCount;

        // Render this printer's card in the list
        if (printerListEl) {
            const row = document.createElement('div');
            row.className = 'wprinter-item';
            row.innerHTML = `
                <div class="wprinter-item-header">
                    <span class="wprinter-name">${p.name}</span>
                    <span class="wprinter-model-badge">${p.model}</span>
                </div>
                <div class="wprinter-item-stats">
                    <div class="wprinter-substat">
                        <span class="wprinter-substat-label">${t('workspace.stat_total_time')}</span>
                        <span class="wprinter-substat-val">${Math.round(printTime / 3600)} ${t('workspace.hours')}</span>
                    </div>
                    <div class="wprinter-substat">
                        <span class="wprinter-substat-label">${t('workspace.stat_success_rate')}</span>
                        <span class="wprinter-substat-val">${successRate}%</span>
                    </div>
                </div>
                <div class="wprinter-progress-bar-wrap">
                    <div class="wprinter-progress-bar" style="width: ${successRate}%; background: ${successRate > 94 ? 'var(--accent)' : '#ffc107'};"></div>
                </div>
            `;
            printerListEl.appendChild(row);
        }
    });

    await Promise.all(fetchPromises);

    // Update global stat elements
    const totalHours = Math.round(totalSeconds / 3600);
    const avgSuccessRate = totalJobs > 0 ? Math.round((successfulJobs / totalJobs) * 100) : 100;

    const valTimeEl = document.getElementById('wstat-val-time');
    const valJobsEl = document.getElementById('wstat-val-jobs');
    const valSuccessEl = document.getElementById('wstat-val-success');

    if (valTimeEl) valTimeEl.innerText = totalHours.toLocaleString();
    if (valJobsEl) valJobsEl.innerText = totalJobs.toLocaleString();
    if (valSuccessEl) valSuccessEl.innerText = avgSuccessRate;

    // Draw the chart with collected data
    window._chartJobs = allChartJobs;
    initStatsChart(allChartJobs);
}

// ─── Stats Bar Chart ──────────────────────────────────────────────────────────
let _currentChartPeriod = '7d';

function populatePrinterFilter() {
    const select = document.getElementById('stats-printer-select');
    if (!select) return;

    const selectedVal = select.value || 'all';

    // Clear and build options
    select.innerHTML = `<option value="all" data-i18n="workspace.filter_all_printers">${t('workspace.filter_all_printers') || 'Tüm Yazıcılar'}</option>`;

    printersState.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.innerText = p.name;
        select.appendChild(opt);
    });

    // Restore selection
    if (Array.from(select.options).some(o => o.value === selectedVal)) {
        select.value = selectedVal;
    } else {
        select.value = 'all';
    }
}

function initStatsChart(jobs) {
    // Populate dropdown with printers list
    populatePrinterFilter();

    const printerSelect = document.getElementById('stats-printer-select');
    if (printerSelect && !printerSelect.dataset.listenerBound) {
        printerSelect.addEventListener('change', () => {
            drawStatsChart(window._chartJobs || [], _currentChartPeriod);
        });
        printerSelect.dataset.listenerBound = 'true';
    }

    const tabs = document.querySelectorAll('#stats-chart-tabs .stats-tab');
    tabs.forEach(btn => {
        if (!btn.dataset.listenerBound) {
            btn.addEventListener('click', () => {
                tabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                _currentChartPeriod = btn.dataset.period;
                drawStatsChart(window._chartJobs || [], _currentChartPeriod);
            });
            btn.dataset.listenerBound = 'true';
        }
    });
    drawStatsChart(jobs, _currentChartPeriod);
}

function drawStatsChart(jobs, period) {
    const canvas = document.getElementById('stats-bar-chart');
    const emptyEl = document.getElementById('stats-chart-empty');
    if (!canvas) return;

    // Filter jobs by selected printer
    const printerSelect = document.getElementById('stats-printer-select');
    const selectedPrinterId = printerSelect ? printerSelect.value : 'all';

    let filteredJobs = jobs;
    if (selectedPrinterId !== 'all') {
        filteredJobs = jobs.filter(j => j.printerId === selectedPrinterId);
    }

    // Populate recent prints list (top 3 files)
    const recentListEl = document.getElementById('stats-recent-list');
    if (recentListEl) {
        if (filteredJobs.length === 0) {
            recentListEl.innerHTML = `<div class="srl-empty" style="text-align: center; padding: 12px; color: var(--text-muted); font-size: 12.5px;">${t('workspace.no_recent_prints')}</div>`;
        } else {
            const sortedJobs = [...filteredJobs].sort((a, b) => b.ts - a.ts);
            const topJobs = sortedJobs.slice(0, 3);
            recentListEl.innerHTML = topJobs.map(j => {
                const isSuccess = j.status === 'completed';
                const filename = j.filename || 'unknown.gcode';
                const displayName = filename.split('/').pop();
                const relativeTime = formatNotifTime(j.ts * 1000);
                const statusClass = isSuccess ? 'success' : 'fail';
                const statusIcon = isSuccess ? '✓' : '✗';
                return `
                    <div class="srl-item ${statusClass}">
                        <div class="srl-icon">${statusIcon}</div>
                        <span class="srl-name" title="${filename}">${displayName}</span>
                        <span class="srl-time">${relativeTime}</span>
                    </div>
                `;
            }).join('');
        }
    }

    const now = Date.now() / 1000;
    let buckets = [];
    let labels = [];

    if (period === '7d') {
        // 7 daily buckets (0 = today)
        for (let i = 6; i >= 0; i--) {
            buckets.push({ start: now - (i + 1) * 86400, end: now - i * 86400 });
            const d = new Date((now - i * 86400) * 1000);
            labels.push(currentLang === 'tr'
                ? d.toLocaleDateString('tr-TR', { weekday: 'short' })
                : d.toLocaleDateString('en-US', { weekday: 'short' }));
        }
    } else if (period === '30d') {
        // Group 30 days into 4 weekly buckets
        const weekRanges = [
            { start: now - 30 * 86400, end: now - 21 * 86400, label: currentLang === 'tr' ? '4. Hafta' : 'Week 4' },
            { start: now - 21 * 86400, end: now - 14 * 86400, label: currentLang === 'tr' ? '3. Hafta' : 'Week 3' },
            { start: now - 14 * 86400, end: now - 7 * 86400, label: currentLang === 'tr' ? '2. Hafta' : 'Week 2' },
            { start: now - 7 * 86400, end: now, label: currentLang === 'tr' ? '1. Hafta' : 'Week 1' }
        ];
        buckets = weekRanges;
        labels = weekRanges.map(w => w.label);
    } else {
        // 12 monthly buckets
        const nowDate = new Date(now * 1000);
        for (let i = 11; i >= 0; i--) {
            const mDate = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
            const mEnd = new Date(nowDate.getFullYear(), nowDate.getMonth() - i + 1, 1);
            buckets.push({ start: mDate.getTime() / 1000, end: mEnd.getTime() / 1000 });
            labels.push(currentLang === 'tr'
                ? mDate.toLocaleDateString('tr-TR', { month: 'short' })
                : mDate.toLocaleDateString('en-US', { month: 'short' }));
        }
    }

    // Count per bucket
    const counts = buckets.map(b => {
        const inBucket = filteredJobs.filter(j => j.ts >= b.start && j.ts < b.end);
        return {
            success: inBucket.filter(j => j.status === 'completed').length,
            fail: inBucket.filter(j => j.status !== 'completed').length,
            total: inBucket.length
        };
    });

    const totalSuccess = counts.reduce((sum, c) => sum + c.success, 0);
    const totalFail = counts.reduce((sum, c) => sum + c.fail, 0);
    const grandTotal = totalSuccess + totalFail;

    // Calculate dynamic stats for this period
    let periodStart = now - 7 * 86400;
    if (period === '30d') {
        periodStart = now - 30 * 86400;
    } else if (period === '12m') {
        periodStart = now - 365 * 86400;
    }
    const jobsInPeriod = filteredJobs.filter(j => j.ts >= periodStart && j.ts <= now);
    const periodDurationSec = jobsInPeriod.reduce((sum, j) => sum + (j.duration || 0), 0);
    const periodDurationHours = Math.round(periodDurationSec / 3600);
    const successRate = grandTotal > 0 ? Math.round((totalSuccess / grandTotal) * 100) : 100;

    // Update Bottom Metric Cards
    const elPeriodSuccess = document.getElementById('stats-period-success');
    const elPeriodTime = document.getElementById('stats-period-time');
    const elPeriodCount = document.getElementById('stats-period-count');

    if (elPeriodSuccess) elPeriodSuccess.innerText = successRate.toString();
    if (elPeriodTime) elPeriodTime.innerText = periodDurationHours.toLocaleString();
    if (elPeriodCount) elPeriodCount.innerText = grandTotal.toLocaleString();

    // Update dynamic histogram title and rows
    const elListTitle = document.getElementById('stats-list-title');
    if (elListTitle) {
        if (period === '7d') {
            elListTitle.innerText = currentLang === 'tr' ? 'Son 7 Gün (İş Sayısı)' : 'Last 7 Days (Prints)';
        } else if (period === '30d') {
            elListTitle.innerText = currentLang === 'tr' ? 'Son 30 Gün (Haftalık)' : 'Last 30 Days (Weekly)';
        } else {
            elListTitle.innerText = currentLang === 'tr' ? 'Son 12 Ay (Aylık)' : 'Last 12 Months (Monthly)';
        }
    }

    const elBarsList = document.getElementById('stats-bars-list');
    if (elBarsList) {
        const maxTotal = Math.max(...counts.map(c => c.total), 1);
        elBarsList.innerHTML = counts.map((c, idx) => {
            const label = labels[idx];
            const pct = (c.total / maxTotal) * 100;
            return `
                <div class="stats-bar-row">
                    <span class="sbr-label">${label}</span>
                    <div class="sbr-bar-wrap">
                        <div class="sbr-bar" style="width: ${pct}%;"></div>
                    </div>
                    <span class="sbr-value">${c.total}</span>
                </div>
            `;
        }).join('');
    }

    if (grandTotal === 0) {
        if (emptyEl) emptyEl.classList.remove('hidden');
        canvas.style.opacity = '0';
        return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');
    canvas.style.opacity = '1';

    // Size canvas to physical pixels
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.floor((rect.width || 200) * dpr);
    const H = 180 * dpr;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // Update counts in legend
    const successCountEl = document.getElementById('stats-success-count');
    const failCountEl = document.getElementById('stats-fail-count');
    if (successCountEl) successCountEl.innerText = totalSuccess.toString();
    if (failCountEl) failCountEl.innerText = totalFail.toString();

    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) / 2 - (15 * dpr);
    const innerRadius = radius * 0.65;

    const midRadius = (radius + innerRadius) / 2;
    const strokeWidth = radius - innerRadius;

    ctx.lineWidth = strokeWidth;

    const accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ff6b00';
    const successColor = getComputedStyle(document.body).getPropertyValue('--chart-success').trim() || accentColor;
    const failColor = getComputedStyle(document.body).getPropertyValue('--chart-fail').trim() || '#ef476f';

    const hasBoth = (totalSuccess > 0 && totalFail > 0);

    if (!hasBoth) {
        // Draw a seamless single ring
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.arc(cx, cy, midRadius, 0, Math.PI * 2);
        ctx.strokeStyle = totalSuccess > 0 ? successColor : failColor;
        ctx.stroke();
    } else {
        // Draw segments with gaps and rounded caps
        ctx.lineCap = 'round';

        // Cap extension angle in radians
        const capExtAngle = (strokeWidth / 2) / midRadius;
        // Small gap between the rounded caps of segments
        const capGap = 0.08;
        const gapAngle = (capExtAngle * 2) + capGap;

        const totalAngleForSegments = Math.PI * 2 - (gapAngle * 2);
        const successAngle = (totalSuccess / grandTotal) * totalAngleForSegments;
        const failAngle = (totalFail / grandTotal) * totalAngleForSegments;

        let currentAngle = -Math.PI / 2; // Start at top

        // 1. Success Segment
        const sStart = currentAngle + capExtAngle;
        const sEnd = sStart + successAngle;
        ctx.beginPath();
        ctx.arc(cx, cy, midRadius, sStart, sEnd);
        ctx.strokeStyle = successColor;
        ctx.stroke();

        currentAngle += successAngle + gapAngle;

        // 2. Fail Segment
        const fStart = currentAngle + capExtAngle;
        const fEnd = fStart + failAngle;
        ctx.beginPath();
        ctx.arc(cx, cy, midRadius, fStart, fEnd);
        ctx.strokeStyle = failColor;
        ctx.stroke();
    }

    // Text in center (Success rate instead of total prints)
    const textColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#1f2937';
    ctx.fillStyle = textColor;
    ctx.font = `bold ${24 * dpr}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(successRate.toString() + '%', cx, cy - 6 * dpr);

    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-muted').trim() || 'rgba(160,160,160,0.8)';
    ctx.font = `${11 * dpr}px Inter, sans-serif`;
    ctx.fillText(currentLang === 'tr' ? 'Başarı' : 'Success', cx, cy + 12 * dpr);
}


// ─── Printer Webhook Warning Alerts ──────────────────────────────────────────
let dismissedPrinterAlerts = new Set();

function updateWebhookAlerts() {
    const list = document.getElementById('printer-warning-list');
    const wrapper = document.getElementById('printer-warning-wrapper');
    const container = document.getElementById('printer-error-alert-container');
    if (!list || !wrapper) return;

    // ─── Webhook bildirimleri kapalıysa topbar uyarısını gizle ──────────────
    if (appSettings.webhookNotifications === false) {
        wrapper.classList.add('hidden');
        closePrinterWarningDropdown();
        list.innerHTML = '';
        if (container) container.innerHTML = '';
        return;
    }

    // Find all printers in error or shutdown webhook states
    const errorPrinters = printersState.filter(p =>
        p.webhookState === 'shutdown' || p.webhookState === 'error'
    );

    if (errorPrinters.length === 0) {
        wrapper.classList.add('hidden');
        closePrinterWarningDropdown();
        list.innerHTML = '';
        if (container) container.innerHTML = '';
        dismissedPrinterAlerts.clear();
        return;
    }


    // Show the warning badge wrapper in the topbar
    wrapper.classList.remove('hidden');

    // Update warning button capsule text dynamically
    const warningBtn = document.getElementById('printer-warning-btn');
    if (warningBtn) {
        const hasShutdown = errorPrinters.some(p => p.webhookState === 'shutdown');
        const stateText = hasShutdown ? 'SHUTDOWN' : 'ERROR';
        const machineWord = currentLang === 'tr' ? 'MAKİNE' : 'PRINTERS';
        const btnText = `${errorPrinters.length} ${machineWord}: ${stateText}`;

        const btnTextEl = warningBtn.querySelector('.warning-btn-text');
        if (btnTextEl && btnTextEl.textContent !== btnText) {
            btnTextEl.textContent = btnText;
        }
    }

    // If a printer is no longer in error state, remove it from dismissed set
    const errorPrinterIds = new Set(errorPrinters.map(p => p.id));
    for (let id of dismissedPrinterAlerts) {
        if (!errorPrinterIds.has(id)) {
            dismissedPrinterAlerts.delete(id);
        }
    }

    // ────────────────────────────────────────────────────────────────
    // 1. UPDATE THE DROPDOWN LIST (Always contains all error printers)
    // ────────────────────────────────────────────────────────────────
    const existingDropdownCards = Array.from(list.querySelectorAll('.printer-warning-item'));
    existingDropdownCards.forEach(card => {
        const pId = card.getAttribute('data-printer-id');
        if (!errorPrinterIds.has(pId)) {
            card.remove();
        }
    });

    errorPrinters.forEach(p => {
        let card = list.querySelector(`.printer-warning-item[data-printer-id="${p.id}"]`);
        const stateText = p.webhookState === 'shutdown' ? 'SHUTDOWN' : 'ERROR';
        const parts = parseWebhookMessage(p.webhookMessage);

        let code = '';
        let titleMsg = '';
        let detailsHtml = '';

        if (parts.length > 0) {
            const firstIsCode = /^[A-Z0-9_]{3,15}$/.test(parts[0]);
            if (firstIsCode) {
                code = parts[0];
                titleMsg = parts[1] || parts[0];
                const startIdx = parts[1] ? 2 : 1;
                const detailParts = parts.slice(startIdx).filter(part => !/^\d+$/.test(part));
                detailsHtml = detailParts.map(part => `<div class="printer-error-details-part">${part.replace(/\n/g, '<br>')}</div>`).join('');
            } else {
                titleMsg = parts[0];
                const detailParts = parts.slice(1).filter(part => !/^\d+$/.test(part));
                detailsHtml = detailParts.map(part => `<div class="printer-error-details-part">${part.replace(/\n/g, '<br>')}</div>`).join('');
            }
        } else {
            titleMsg = p.webhookState === 'shutdown' ? t('webhook.shutdown_msg') : t('webhook.error_msg');
        }

        const displayCode = code ? `<span class="printer-error-msg-code">Hata Kodu: ${code}</span>` : '<span class="printer-error-msg-code hidden"></span>';

        if (card) {
            const currentMsgHash = card.getAttribute('data-message-hash');
            const newMsgHash = p.webhookMessage || '';
            if (currentMsgHash !== newMsgHash) {
                card.setAttribute('data-message-hash', newMsgHash);
                const msgEl = card.querySelector('.printer-error-msg-main');
                if (msgEl) msgEl.textContent = titleMsg;

                const codeEl = card.querySelector('.printer-error-msg-code');
                if (codeEl) {
                    if (code) {
                        codeEl.textContent = `Hata Kodu: ${code}`;
                        codeEl.classList.remove('hidden');
                    } else {
                        codeEl.classList.add('hidden');
                    }
                }

                const detailsCont = card.querySelector('.printer-error-details-content');
                if (detailsCont) {
                    detailsCont.innerHTML = detailsHtml || `<div class="printer-error-details-part">${p.webhookMessage || ''}</div>`;
                }
            }
            return;
        }

        card = document.createElement('div');
        card.className = 'printer-warning-item';
        card.setAttribute('data-printer-id', p.id);
        card.setAttribute('data-message-hash', p.webhookMessage || '');

        card.innerHTML = `
            <div class="printer-error-title-wrap">
                <div class="printer-error-title-left">
                    <span class="printer-error-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </span>
                    <span>${p.name} [${stateText}]</span>
                </div>
                ${p.address ? `<span class="printer-error-host-badge">${p.address}</span>` : ''}
            </div>
            <div class="printer-error-body">
                <div class="printer-error-msg-main">${titleMsg}</div>
                ${displayCode}
                <div class="printer-error-actions">
                    <button class="printer-error-details-toggle">${t('webhook.show_details') || 'Detayları Göster'}</button>
                    <button class="printer-error-host-btn">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        ${t('printer.go_host') || 'Go Host'}
                    </button>
                </div>
                <div class="printer-error-details-content hidden">
                    ${detailsHtml || `<div class="printer-error-details-part">${(p.webhookMessage || '').replace(/\n/g, '<br>')}</div>`}
                </div>
            </div>
        `;

        const toggleBtn = card.querySelector('.printer-error-details-toggle');
        const detailsContent = card.querySelector('.printer-error-details-content');

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = detailsContent.classList.contains('hidden');
            if (isHidden) {
                detailsContent.classList.remove('hidden');
                toggleBtn.textContent = t('webhook.hide_details') || 'Detayları Gizle';
            } else {
                detailsContent.classList.add('hidden');
                toggleBtn.textContent = t('webhook.show_details') || 'Detayları Göster';
            }
        });

        const hostBtn = card.querySelector('.printer-error-host-btn');
        if (hostBtn) {
            hostBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                closePrinterWarningDropdown();
                if (typeof window.goToPrinterWebUI === 'function') {
                    window.goToPrinterWebUI(p.id);
                }
            });
        }

        list.appendChild(card);
    });

    // ────────────────────────────────────────────────────────────────
    // 2. UPDATE FLOATING ERROR ALERTS CONTAINER (Only showing active, non-dismissed ones)
    // ────────────────────────────────────────────────────────────────
    if (container) {
        const existingFloatingCards = Array.from(container.querySelectorAll('.printer-error-card'));
        existingFloatingCards.forEach(card => {
            const pId = card.getAttribute('data-printer-id');
            if (!errorPrinterIds.has(pId) || dismissedPrinterAlerts.has(pId)) {
                card.remove();
            }
        });

        errorPrinters.forEach(p => {
            if (dismissedPrinterAlerts.has(p.id)) return;

            let card = container.querySelector(`.printer-error-card[data-printer-id="${p.id}"]`);
            const stateText = p.webhookState === 'shutdown' ? 'SHUTDOWN' : 'ERROR';
            const parts = parseWebhookMessage(p.webhookMessage);

            let code = '';
            let titleMsg = '';
            let detailsHtml = '';

            if (parts.length > 0) {
                const firstIsCode = /^[A-Z0-9_]{3,15}$/.test(parts[0]);
                if (firstIsCode) {
                    code = parts[0];
                    titleMsg = parts[1] || parts[0];
                    const startIdx = parts[1] ? 2 : 1;
                    const detailParts = parts.slice(startIdx).filter(part => !/^\d+$/.test(part));
                    detailsHtml = detailParts.map(part => `<div class="printer-error-details-part">${part.replace(/\n/g, '<br>')}</div>`).join('');
                } else {
                    titleMsg = parts[0];
                    const detailParts = parts.slice(1).filter(part => !/^\d+$/.test(part));
                    detailsHtml = detailParts.map(part => `<div class="printer-error-details-part">${part.replace(/\n/g, '<br>')}</div>`).join('');
                }
            } else {
                titleMsg = p.webhookState === 'shutdown' ? t('webhook.shutdown_msg') : t('webhook.error_msg');
            }

            const displayCode = code ? `<span class="printer-error-msg-code">Hata Kodu: ${code}</span>` : '<span class="printer-error-msg-code hidden"></span>';

            if (card) {
                const currentMsgHash = card.getAttribute('data-message-hash');
                const newMsgHash = p.webhookMessage || '';
                if (currentMsgHash !== newMsgHash) {
                    card.setAttribute('data-message-hash', newMsgHash);
                    const msgEl = card.querySelector('.printer-error-msg-main');
                    if (msgEl) msgEl.textContent = titleMsg;

                    const codeEl = card.querySelector('.printer-error-msg-code');
                    if (codeEl) {
                        if (code) {
                            codeEl.textContent = `Hata Kodu: ${code}`;
                            codeEl.classList.remove('hidden');
                        } else {
                            codeEl.classList.add('hidden');
                        }
                    }

                    const detailsCont = card.querySelector('.printer-error-details-content');
                    if (detailsCont) {
                        detailsCont.innerHTML = detailsHtml || `<div class="printer-error-details-part">${p.webhookMessage || ''}</div>`;
                    }
                }
                return;
            }

            card = document.createElement('div');
            card.className = 'printer-error-card';
            card.setAttribute('data-printer-id', p.id);
            card.setAttribute('data-message-hash', p.webhookMessage || '');

            card.innerHTML = `
                <div class="printer-error-header">
                    <div class="printer-error-title-wrap">
                        <div class="printer-error-title-left">
                            <span class="printer-error-icon">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                    <line x1="12" y1="9" x2="12" y2="13"/>
                                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            </span>
                            <span>${p.name} [${stateText}]</span>
                        </div>
                        ${p.address ? `<span class="printer-error-host-badge">${p.address}</span>` : ''}
                    </div>
                    <button class="printer-error-close" title="${t('confirm.cancel') || 'Kapat'}">&times;</button>
                </div>
                <div class="printer-error-body">
                    <div class="printer-error-msg-main">${titleMsg}</div>
                    ${displayCode}
                    <div class="printer-error-actions">
                        <button class="printer-error-details-toggle">${t('webhook.show_details') || 'Detayları Göster'}</button>
                        <button class="printer-error-host-btn">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="2" y1="12" x2="22" y2="12" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                            ${t('printer.go_host') || 'Go Host'}
                        </button>
                    </div>
                    <div class="printer-error-details-content hidden">
                        ${detailsHtml || `<div class="printer-error-details-part">${(p.webhookMessage || '').replace(/\n/g, '<br>')}</div>`}
                    </div>
                </div>
            `;

            const closeBtn = card.querySelector('.printer-error-close');
            closeBtn.addEventListener('click', () => {
                dismissedPrinterAlerts.add(p.id);
                updateWebhookAlerts();
            });

            const toggleBtn = card.querySelector('.printer-error-details-toggle');
            const detailsContent = card.querySelector('.printer-error-details-content');

            toggleBtn.addEventListener('click', () => {
                const isHidden = detailsContent.classList.contains('hidden');
                if (isHidden) {
                    detailsContent.classList.remove('hidden');
                    toggleBtn.textContent = t('webhook.hide_details') || 'Detayları Gizle';
                } else {
                    detailsContent.classList.add('hidden');
                    toggleBtn.textContent = t('webhook.show_details') || 'Detayları Göster';
                }
            });

            const hostBtn = card.querySelector('.printer-error-host-btn');
            if (hostBtn) {
                hostBtn.addEventListener('click', () => {
                    if (typeof window.goToPrinterWebUI === 'function') {
                        window.goToPrinterWebUI(p.id);
                    }
                });
            }

            container.appendChild(card);
        });
    }
}

function parseWebhookMessage(msg) {
    if (!msg) return [];
    return msg.split('||').map(s => s.trim()).filter(Boolean);
}

// ─── G-code Parser and Canvas Renderer Helper Functions ──────────────────────

function parseGcode(text) {
    const segments = [];
    let currentX = 0;
    let currentY = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    const lines = text.split(/\r?\n/);
    const lineRegex = /^(G0|G1|G00|G01|G2|G3)\b/i;
    const xRegex = /X([\d.-]+)/i;
    const yRegex = /Y([\d.-]+)/i;
    const eRegex = /E([\d.-]+)/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith(';')) continue;

        const matchCmd = line.match(lineRegex);
        if (matchCmd) {
            const cmd = matchCmd[1].toUpperCase();
            const matchX = line.match(xRegex);
            const matchY = line.match(yRegex);
            const matchE = line.match(eRegex);

            let nextX = matchX ? parseFloat(matchX[1]) : currentX;
            let nextY = matchY ? parseFloat(matchY[1]) : currentY;

            if (matchX || matchY) {
                const type = (cmd === 'G0' || cmd === 'G00') ? 'travel' : 'extrude';

                segments.push({ type, x1: currentX, y1: currentY, x2: nextX, y2: nextY });

                if (type === 'extrude') {
                    if (nextX < minX) minX = nextX;
                    if (nextX > maxX) maxX = nextX;
                    if (nextY < minY) minY = nextY;
                    if (nextY > maxY) maxY = nextY;
                }

                currentX = nextX;
                currentY = nextY;
            }
        }
    }

    // If no extrusion coordinates were found, fall back to travel moves
    if (minX === Infinity) {
        segments.forEach(seg => {
            if (seg.x2 < minX) minX = seg.x2;
            if (seg.x2 > maxX) maxX = seg.x2;
            if (seg.y2 < minY) minY = seg.y2;
            if (seg.y2 > maxY) maxY = seg.y2;
        });
    }

    // Prevent empty bounds
    if (minX === Infinity) {
        minX = 0; maxX = 220; minY = 0; maxY = 220;
    }

    return {
        segments,
        bounds: { minX, maxX, minY, maxY }
    };
}

function extractMetadataFromComments(text) {
    const meta = {
        time: '-',
        layers: '-',
        layerHeight: '-',
        objectHeight: '-'
    };

    // Match printing time
    const timeMatch = text.match(/;\s*(?:estimated printing time|print time|print_time|total estimate time)\s*=\s*(.+)/i);
    if (timeMatch) {
        meta.time = timeMatch[1].trim();
    }

    // Match layer height (e.g. 0.20mm)
    const layerHeightMatch = text.match(/;\s*(?:layer_height|layer height)\s*=\s*([\d.]+)/i);
    if (layerHeightMatch) {
        meta.layerHeight = `${parseFloat(layerHeightMatch[1]).toFixed(2)}mm`;
    }

    // Match object height (e.g. 30.00mm)
    const objectHeightMatch = text.match(/;\s*(?:object_height|object height|height)\s*=\s*([\d.]+)/i);
    if (objectHeightMatch) {
        meta.objectHeight = `${parseFloat(objectHeightMatch[1]).toFixed(2)}mm`;
    }

    // Match layers
    const layersMatch = text.match(/;\s*(?:total_layer_number|layers|layer_count)\s*=\s*(\d+)/i);
    if (layersMatch) {
        meta.layers = layersMatch[1].trim();
    }

    return meta;
}

function drawGcodeOnCanvas(canvasId, segments, bounds) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!segments || segments.length === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(currentLang === 'tr' ? 'Çizilecek yol bulunamadı' : 'No paths to draw', canvas.width / 2, canvas.height / 2);
        return;
    }

    const { minX, maxX, minY, maxY } = bounds;
    const dx = maxX - minX;
    const dy = maxY - minY;

    const width = dx || 1;
    const height = dy || 1;

    const padding = 20;
    const drawWidth = canvas.width - padding * 2;
    const drawHeight = canvas.height - padding * 2;

    const scale = Math.min(drawWidth / width, drawHeight / height);

    const offsetX = padding + (drawWidth - width * scale) / 2;
    const offsetY = padding + (drawHeight - height * scale) / 2;

    const style = getComputedStyle(document.body);
    const accentColor = style.getPropertyValue('--accent').trim() || '#ff6b00';

    const travelSegments = [];
    const extrudeSegments = [];

    segments.forEach(seg => {
        const x1 = offsetX + (seg.x1 - minX) * scale;
        const y1 = canvas.height - (offsetY + (seg.y1 - minY) * scale);
        const x2 = offsetX + (seg.x2 - minX) * scale;
        const y2 = canvas.height - (offsetY + (seg.y2 - minY) * scale);

        if (seg.type === 'travel') {
            travelSegments.push({ x1, y1, x2, y2 });
        } else {
            extrudeSegments.push({ x1, y1, x2, y2 });
        }
    });

    if (travelSegments.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        travelSegments.forEach(seg => {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
        });
        ctx.stroke();
    }

    if (extrudeSegments.length > 0) {
        ctx.beginPath();
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        extrudeSegments.forEach(seg => {
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
        });
        ctx.stroke();
    }
}

function generateMockGcodePaths() {
    const segments = [];
    let lastX = 100, lastY = 100;
    for (let theta = 0; theta < 50; theta += 0.1) {
        const r = 2 * theta;
        const x = 150 + r * Math.cos(theta);
        const y = 150 + r * Math.sin(theta);
        segments.push({
            type: 'extrude',
            x1: lastX,
            y1: lastY,
            x2: x,
            y2: y
        });
        lastX = x;
        lastY = y;
    }
    return {
        segments,
        bounds: { minX: 50, maxX: 250, minY: 50, maxY: 250 },
        meta: {
            time: currentLang === 'tr' ? '1s 25dk' : '1h 25m',
            layers: '180'
        }
    };
}

function readBlobAsText(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

function formatTime(secs) {
    if (!secs || isNaN(secs)) return '-';
    const h = Math.floor(secs / 3600);
    const m = Math.round((secs % 3600) / 60);
    if (h > 0) {
        return currentLang === 'tr' ? `${h}s ${m}dk` : `${h}h ${m}m`;
    }
    return currentLang === 'tr' ? `${m}dk` : `${m}m`;
}

// ─── G-code options injection helpers ────────────────────────────────────────

function generateInjectedGcodeHeader(settings) {
    let inject = '; === INJECTED PRINT OPTIONS BY LAYERSTECH DASHBOARD ===\n';
    inject += `; Selected Extruder: ${settings.extruder}\n`;
    inject += `T${settings.extruder.replace('T', '')}\n`;

    if (settings.bedLeveling !== 'none') {
        inject += `; Bed Leveling Option: ${settings.bedLeveling}\n`;
        inject += `BED_MESH_PROFILE LOAD=${settings.bedLeveling}\n`;
    }

    if (settings.spaghetti) {
        inject += '; Spaghetti Detection: Enabled\n';
        inject += 'SET_SPAGHETTI_DETECTION ENABLE=1\n';
    } else {
        inject += '; Spaghetti Detection: Disabled\n';
        inject += 'SET_SPAGHETTI_DETECTION ENABLE=0\n';
    }

    if (settings.nozzleClean) {
        inject += '; Pre-print Nozzle Cleaning: Enabled\n';
        inject += 'CLEAN_NOZZLE\n';
    }

    if (settings.timelapseComp) {
        inject += '; Timelapse Compensation: Enabled\n';
        inject += 'SET_TIMELAPSE_COMPENSATION ENABLE=1\n';
    }

    inject += '; ====================================================\n\n';
    return inject;
}

function generateInjectedGcodeFooter(settings) {
    if (!settings.postShutdown) return '';

    let inject = '\n\n; === INJECTED POST-PRINT AUTO SHUTDOWN ===\n';
    inject += `; Auto Shutdown Delay: ${settings.shutdownDelay} minutes\n`;
    inject += `SHUTDOWN_AFTER_PRINT DELAY=${parseInt(settings.shutdownDelay) * 60}\n`;
    inject += '; ========================================\n';
    return inject;
}

async function sendKlipperGcodeScript(printer, script) {
    let address = printer.address;
    if (!address) return false;
    let host = address;
    if (!host.includes(':') && !address.toLowerCase().startsWith('com') && !address.toLowerCase().startsWith('/dev/')) {
        host = `${address}:7125`;
    }
    try {
        const url = `http://${host}/printer/gcode/script?script=${encodeURIComponent(script)}`;
        const res = await fetch(url, { method: 'POST' });
        return res.ok;
    } catch (e) {
        console.error('Failed to send Klipper G-code script:', e);
        return false;
    }
}

// ─── Main modal preview logic ────────────────────────────────────────────────

// ─── Main modal preview logic ────────────────────────────────────────────────

function setSafeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

async function openGcodePreview(printerId, fileOrFilename) {
    const modal = document.getElementById('gcode-preview-modal');
    if (!modal) return;

    modal.classList.remove('hidden');
    const loadingOverlay = document.getElementById('gcode-preview-loading');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    setSafeText('gcode-meta-name', '-');
    setSafeText('gcode-meta-size', '-');
    setSafeText('gcode-meta-time', '-');
    setSafeText('gcode-meta-layers', '-');
    setSafeText('gcode-meta-layer-height', '-');
    setSafeText('gcode-meta-object-height', '-');

    const canvasId = 'gcode-preview-canvas';

    const printer = printersState.find(p => p.id === printerId);
    if (printer) {
        setSafeText('gcode-preview-printer-ip', printer.address || 'Serial / Local');
    }

    // Bind printer IP edit button once
    const ipEditBtn = document.getElementById('edit-preview-printer-ip-btn');
    if (ipEditBtn) {
        // Clear previous listeners by cloning the button
        const newIpEditBtn = ipEditBtn.cloneNode(true);
        ipEditBtn.parentNode.replaceChild(newIpEditBtn, ipEditBtn);
        newIpEditBtn.addEventListener('click', () => {
            const activePrinter = printersState.find(p => p.id === printerId);
            if (!activePrinter) return;
            const newIp = prompt(currentLang === 'tr' ? 'Yazıcı IP adresini düzenle:' : 'Edit printer IP address:', activePrinter.address || '');
            if (newIp !== null) {
                activePrinter.address = newIp.trim();
                setSafeText('gcode-preview-printer-ip', activePrinter.address || 'Serial / Local');
                savePrinters();
                renderPrinters();
                setupPreviewFooter(printerId, fileOrFilename, fileOrFilename instanceof File);
            }
        });
    }

    const canvas = document.getElementById(canvasId);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    try {
        let name = '';
        let sizeText = '-';
        let timeText = '-';
        let layersText = '-';
        let gcodeText = '';
        let parsed = { segments: [], bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 } };

        if (fileOrFilename instanceof File) {
            const file = fileOrFilename;
            name = file.name;
            sizeText = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

            const firstChunk = file.slice(0, 1500000);
            const firstText = await readBlobAsText(firstChunk);
            gcodeText = firstText;

            const lastStart = Math.max(0, file.size - 100000);
            const lastChunk = file.slice(lastStart, file.size);
            const lastText = await readBlobAsText(lastChunk);

            const meta = extractMetadataFromComments(lastText);
            timeText = meta.time;
            layersText = meta.layers;

            setSafeText('gcode-meta-layer-height', meta.layerHeight);
            setSafeText('gcode-meta-object-height', meta.objectHeight);

            parsed = parseGcode(gcodeText);
        } else {
            name = fileOrFilename;

            if (printerId === 'mock' || !printer || !printer.address || printer.status === 'offline') {
                const mockData = generateMockGcodePaths();
                setSafeText('gcode-meta-name', name);
                setSafeText('gcode-meta-size', '12.4 MB');
                setSafeText('gcode-meta-time', mockData.meta.time);
                setSafeText('gcode-meta-layers', mockData.meta.layers);
                setSafeText('gcode-meta-layer-height', '0.20mm');
                setSafeText('gcode-meta-object-height', '30.00mm');

                drawGcodeOnCanvas(canvasId, mockData.segments, mockData.bounds);
                if (loadingOverlay) loadingOverlay.style.display = 'none';

                setupPreviewFooter(printerId, fileOrFilename, false);
                return;
            }

            let host = printer.address;
            if (!host.includes(':') && !printer.address.toLowerCase().startsWith('com') && !printer.address.toLowerCase().startsWith('/dev/')) {
                host = `${printer.address}:7125`;
            }

            try {
                const metaRes = await fetch(`http://${host}/server/files/metadata?filename=${encodeURIComponent(name)}`);
                if (metaRes.ok) {
                    const data = await metaRes.json();
                    if (data && data.result) {
                        const res = data.result;
                        sizeText = res.size ? `${(res.size / (1024 * 1024)).toFixed(2)} MB` : '-';
                        timeText = formatTime(res.estimated_time);
                        if (res.layer_count !== undefined) {
                            layersText = res.layer_count;
                        } else if (res.object_height && res.layer_height) {
                            layersText = Math.round(res.object_height / res.layer_height);
                        }

                        if (res.layer_height !== undefined) {
                            setSafeText('gcode-meta-layer-height', `${parseFloat(res.layer_height).toFixed(2)}mm`);
                        }
                        if (res.object_height !== undefined) {
                            setSafeText('gcode-meta-object-height', `${parseFloat(res.object_height).toFixed(2)}mm`);
                        }
                    }
                }
            } catch (e) {
                console.warn('Failed to fetch remote metadata:', e);
            }

            try {
                const fileRes = await fetch(`http://${host}/server/files/gcodes/${encodeURIComponent(name)}`, {
                    headers: {
                        'Range': 'bytes=0-1500000'
                    }
                });
                if (fileRes.ok || fileRes.status === 206) {
                    gcodeText = await fileRes.text();
                    parsed = parseGcode(gcodeText);
                } else {
                    throw new Error(`HTTP status ${fileRes.status}`);
                }
            } catch (e) {
                console.error('Failed to fetch remote G-code:', e);
            }
        }

        setSafeText('gcode-meta-name', name);
        setSafeText('gcode-meta-size', sizeText);
        setSafeText('gcode-meta-time', timeText);
        setSafeText('gcode-meta-layers', layersText);

        drawGcodeOnCanvas(canvasId, parsed.segments, parsed.bounds);
        setupPreviewFooter(printerId, fileOrFilename, fileOrFilename instanceof File);

    } catch (err) {
        console.error('Error in openGcodePreview:', err);
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

function setupPreviewFooter(printerId, fileOrFilename, isLocal) {
    const cancelBtn = document.getElementById('gcode-btn-cancel');
    const exportBtn = document.getElementById('gcode-btn-export');
    const sendBtn = document.getElementById('gcode-btn-send');
    const printBtn = document.getElementById('gcode-btn-print');

    if (!cancelBtn || !exportBtn || !sendBtn || !printBtn) return;

    // Clear old event listeners by cloning
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newExportBtn = exportBtn.cloneNode(true);
    const newSendBtn = sendBtn.cloneNode(true);
    const newPrintBtn = printBtn.cloneNode(true);

    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    printBtn.parentNode.replaceChild(newPrintBtn, printBtn);

    // Bind Cancel
    newCancelBtn.addEventListener('click', () => {
        document.getElementById('gcode-preview-modal').classList.add('hidden');
    });

    // Bind Export
    newExportBtn.addEventListener('click', async () => {
        const settings = {
            bedLeveling: document.getElementById('gcode-option-bed-leveling').value,
            spaghetti: document.getElementById('gcode-option-spaghetti').checked,
            nozzleClean: document.getElementById('gcode-option-nozzle-clean').checked,
            timelapseComp: document.getElementById('gcode-option-timelapse-comp').checked,
            postShutdown: document.getElementById('gcode-option-post-shutdown').checked,
            shutdownDelay: document.getElementById('gcode-option-shutdown-delay').value,
            extruder: 'T1'
        };

        const filename = fileOrFilename instanceof File ? fileOrFilename.name : fileOrFilename;
        const result = await ipcRenderer.invoke('save-file-dialog', filename);
        if (result && result.filePath) {
            const loadingOverlay = document.getElementById('gcode-preview-loading');
            try {
                if (loadingOverlay) loadingOverlay.style.display = 'flex';
                const header = generateInjectedGcodeHeader(settings);
                const footer = generateInjectedGcodeFooter(settings);

                if (isLocal) {
                    // Combine blob and write file to chosen path
                    const combinedBlob = new Blob([header, fileOrFilename, footer], { type: 'text/plain' });
                    const arrayBuf = await combinedBlob.arrayBuffer();
                    fs.writeFileSync(result.filePath, Buffer.from(arrayBuf));
                    addNotification('success', currentLang === 'tr' ? 'Dışa Aktarma Başarılı' : 'Export Successful', `${filename} başarıyla kaydedildi.`);
                } else {
                    // Remote file: Fetch entire file, combine and write
                    const printer = printersState.find(p => p.id === printerId);
                    if (!printer || !printer.address) throw new Error('Printer address not found');
                    let host = printer.address;
                    if (!host.includes(':') && !printer.address.toLowerCase().startsWith('com') && !printer.address.toLowerCase().startsWith('/dev/')) {
                        host = `${printer.address}:7125`;
                    }
                    const res = await fetch(`http://${host}/server/files/gcodes/${encodeURIComponent(filename)}`);
                    if (res.ok) {
                        const originalText = await res.text();
                        const combinedText = header + originalText + footer;
                        fs.writeFileSync(result.filePath, combinedText, 'utf8');
                        addNotification('success', currentLang === 'tr' ? 'Dışa Aktarma Başarılı' : 'Export Successful', `${filename} başarıyla kaydedildi.`);
                    } else {
                        throw new Error(`HTTP status ${res.status}`);
                    }
                }
            } catch (err) {
                console.error('Failed to export G-code:', err);
                addNotification('error', currentLang === 'tr' ? 'Dışa Aktarma Başarısız' : 'Export Failed', err.message);
            } finally {
                if (loadingOverlay) loadingOverlay.style.display = 'none';
            }
        }
    });

    // Bind Send
    newSendBtn.addEventListener('click', async () => {
        const settings = {
            bedLeveling: document.getElementById('gcode-option-bed-leveling').value,
            spaghetti: document.getElementById('gcode-option-spaghetti').checked,
            nozzleClean: document.getElementById('gcode-option-nozzle-clean').checked,
            timelapseComp: document.getElementById('gcode-option-timelapse-comp').checked,
            postShutdown: document.getElementById('gcode-option-post-shutdown').checked,
            shutdownDelay: document.getElementById('gcode-option-shutdown-delay').value,
            extruder: 'T1'
        };
        document.getElementById('gcode-preview-modal').classList.add('hidden');

        if (isLocal) {
            const printer = printersState.find(p => p.id === printerId);
            if (printer && printer.address && printerId !== 'mock') {
                uploadGcodeToMoonraker(printerId, fileOrFilename, false, settings);
            } else {
                simulateUpload(printerId, fileOrFilename, false, settings);
            }
        } else {
            // Remote file: select it without printing
            const printer = printersState.find(p => p.id === printerId);
            if (!printer) return;
            if (printer.address && printerId !== 'mock') {
                let host = printer.address;
                if (!host.includes(':') && !printer.address.toLowerCase().startsWith('com') && !printer.address.toLowerCase().startsWith('/dev/')) {
                    host = `${printer.address}:7125`;
                }
                try {
                    // Send settings setup Gcode scripts first
                    const headerGcode = generateInjectedGcodeHeader(settings);
                    await sendKlipperGcodeScript(printer, headerGcode);

                    const footerGcode = generateInjectedGcodeFooter(settings);
                    if (footerGcode) {
                        await sendKlipperGcodeScript(printer, footerGcode);
                    }

                    // Select file on virtual SD card
                    const url = `http://${host}/printer/gcode/script?script=SDCARD_SELECT_FILE FILENAME=${encodeURIComponent(fileOrFilename)}`;
                    const res = await fetch(url, { method: 'POST' });
                    if (res.ok) {
                        addNotification('success', currentLang === 'tr' ? 'Dosya Seçildi' : 'File Selected', `${printer.name}: ${fileOrFilename} seçildi.`);
                    } else {
                        throw new Error(`HTTP ${res.status}`);
                    }
                } catch (e) {
                    console.error('Failed to select remote file:', e);
                    addNotification('error', currentLang === 'tr' ? 'Dosya Seçilemedi' : 'Failed to Select File', `${printer.name}: ${e.message}`);
                }
            } else {
                addNotification('success', currentLang === 'tr' ? 'Dosya Seçildi' : 'File Selected', `${printer.name} (Simüle): ${fileOrFilename} seçildi.`);
            }
        }
    });

    // Bind Print
    newPrintBtn.addEventListener('click', async () => {
        const settings = {
            bedLeveling: document.getElementById('gcode-option-bed-leveling').value,
            spaghetti: document.getElementById('gcode-option-spaghetti').checked,
            nozzleClean: document.getElementById('gcode-option-nozzle-clean').checked,
            timelapseComp: document.getElementById('gcode-option-timelapse-comp').checked,
            postShutdown: document.getElementById('gcode-option-post-shutdown').checked,
            shutdownDelay: document.getElementById('gcode-option-shutdown-delay').value,
            extruder: 'T1'
        };
        document.getElementById('gcode-preview-modal').classList.add('hidden');

        if (isLocal) {
            const printer = printersState.find(p => p.id === printerId);
            if (printer && printer.address && printerId !== 'mock') {
                uploadGcodeToMoonraker(printerId, fileOrFilename, true, settings);
            } else {
                simulateUpload(printerId, fileOrFilename, true, settings);
            }
        } else {
            // Remote print
            const printer = printersState.find(p => p.id === printerId);
            if (!printer) return;

            if (printer.address && printerId !== 'mock') {
                let host = printer.address;
                if (!host.includes(':') && !printer.address.toLowerCase().startsWith('com') && !printer.address.toLowerCase().startsWith('/dev/')) {
                    host = `${printer.address}:7125`;
                }
                try {
                    // Send settings setup Gcode scripts first
                    const headerGcode = generateInjectedGcodeHeader(settings);
                    await sendKlipperGcodeScript(printer, headerGcode);

                    const footerGcode = generateInjectedGcodeFooter(settings);
                    if (footerGcode) {
                        await sendKlipperGcodeScript(printer, footerGcode);
                    }

                    // Trigger actual Moonraker print job
                    const url = `http://${host}/printer/print/start?filename=${encodeURIComponent(fileOrFilename)}`;
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ filename: fileOrFilename })
                    });
                    if (res.ok) {
                        addNotification('start', currentLang === 'tr' ? 'Baskı Başladı' : 'Print Started', `${printer.name}: ${fileOrFilename}`);
                    } else {
                        throw new Error(`HTTP ${res.status}`);
                    }
                } catch (e) {
                    console.error('Failed to start remote print:', e);
                    addNotification('error', currentLang === 'tr' ? 'Baskı Başlatılamadı' : 'Failed to Start Print', `${printer.name}: ${e.message}`);
                }
            } else {
                // Mock simulation
                printer.status = 'printing';
                printer.progress = 0;
                printer.file = fileOrFilename;
                printer.remainingTime = '1s 15dk';
                printer.speed = 60;
                printer.flow = 12.5;
                printer.targetT0Temp = 220;
                printer.targetBedTemp = 60;
                savePrinters();
                renderPrinters();
                addNotification('start', currentLang === 'tr' ? 'Baskı Başladı' : 'Print Started', `${printer.name} (Simüle): ${fileOrFilename}`);
            }
        }
    });
}

function uploadGcodeToMoonraker(printerId, file, startPrintImmediately = false, settings = null) {
    const printer = printersState.find(p => p.id === printerId);
    if (!printer) return;

    printer.uploading = true;
    printer.uploadProgress = 0;
    savePrinters();
    renderPrinters();

    let address = printer.address;
    let host = address;
    if (!host.includes(':') && !address.toLowerCase().startsWith('com') && !address.toLowerCase().startsWith('/dev/')) {
        host = `${address}:7125`;
    }

    const url = `http://${host}/server/files/upload`;
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            printer.uploadProgress = pct;

            const progressEl = document.getElementById(`upload-pct-${printerId}`);
            const fillEl = document.getElementById(`upload-fill-${printerId}`);
            if (progressEl) progressEl.innerText = `%${pct}`;
            if (fillEl) fillEl.style.width = `${pct}%`;
        }
    });

    xhr.addEventListener('load', () => {
        printer.uploading = false;
        savePrinters();
        renderPrinters();

        if (xhr.status >= 200 && xhr.status < 300) {
            addNotification('success', currentLang === 'tr' ? 'Yükleme Başarılı' : 'Upload Successful', `${file.name} başarıyla ${printer.name} yazıcısına yüklendi.`);
        } else {
            console.error('Upload failed:', xhr.status, xhr.responseText);
            addNotification('error', currentLang === 'tr' ? 'Yükleme Başarısız' : 'Upload Failed', `${printer.name}: ${xhr.statusText || 'Hata'}`);
        }
    });

    xhr.addEventListener('error', () => {
        printer.uploading = false;
        savePrinters();
        renderPrinters();
        addNotification('error', currentLang === 'tr' ? 'Yükleme Başarısız' : 'Upload Failed', `${printer.name}: Bağlantı Hatası`);
    });

    const formData = new FormData();
    if (settings) {
        const header = generateInjectedGcodeHeader(settings);
        const footer = generateInjectedGcodeFooter(settings);
        const combinedBlob = new Blob([header, file, footer], { type: 'text/plain' });
        formData.append('file', combinedBlob, file.name);
    } else {
        formData.append('file', file, file.name);
    }

    if (startPrintImmediately) {
        formData.append('print', 'true');
    }

    xhr.open('POST', url);
    xhr.send(formData);
}

function simulateUpload(printerId, file, startPrintImmediately = false, settings = null) {
    const printer = printersState.find(p => p.id === printerId);
    if (!printer) return;

    printer.uploading = true;
    printer.uploadProgress = 0;
    savePrinters();
    renderPrinters();

    let progress = 0;
    const interval = setInterval(() => {
        progress += 10;
        printer.uploadProgress = progress;

        const progressEl = document.getElementById(`upload-pct-${printerId}`);
        const fillEl = document.getElementById(`upload-fill-${printerId}`);
        if (progressEl) progressEl.innerText = `%${progress}`;
        if (fillEl) fillEl.style.width = `${progress}%`;

        if (progress >= 100) {
            clearInterval(interval);
            printer.uploading = false;

            if (startPrintImmediately) {
                printer.status = 'printing';
                printer.progress = 0;
                printer.file = file.name;
                printer.remainingTime = '1s 15dk';
                printer.speed = 60;
                printer.flow = 12.5;
                printer.targetT0Temp = 220;
                printer.targetBedTemp = 60;
            }

            savePrinters();
            renderPrinters();
            addNotification('success', currentLang === 'tr' ? 'Yükleme Başarılı' : 'Upload Successful', `${file.name} başarıyla ${printer.name} (Simüle) yazıcısına yüklendi.`);
        }
    }, 300);
}

function initGcodeDragAndDrop() {
    const grid = document.getElementById('printers-grid');
    if (!grid) return;

    const dragCounters = {};

    grid.addEventListener('dragenter', (e) => {
        const card = e.target.closest('.printer-card');
        if (!card) return;

        const printerId = card.getAttribute('data-id');
        if (!printerId) return;

        e.preventDefault();
        dragCounters[printerId] = (dragCounters[printerId] || 0) + 1;
        card.classList.add('drag-over');
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    grid.addEventListener('dragleave', (e) => {
        const card = e.target.closest('.printer-card');
        if (!card) return;

        const printerId = card.getAttribute('data-id');
        if (!printerId) return;

        dragCounters[printerId] = (dragCounters[printerId] || 1) - 1;
        if (dragCounters[printerId] <= 0) {
            card.classList.remove('drag-over');
            dragCounters[printerId] = 0;
        }
    });

    grid.addEventListener('drop', (e) => {
        const card = e.target.closest('.printer-card');
        if (!card) return;

        const printerId = card.getAttribute('data-id');
        if (!printerId) return;

        e.preventDefault();
        dragCounters[printerId] = 0;
        card.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.name.toLowerCase().endsWith('.gcode')) {
                openGcodePreview(printerId, file);
            } else {
                addNotification('error', currentLang === 'tr' ? 'Hatalı Dosya' : 'Invalid File', currentLang === 'tr' ? 'Sadece .gcode uzantılı dosyalar yükleyebilirsiniz.' : 'You can only upload .gcode files.');
            }
        }
    });
}

// Bind drag and drop uploader initialization on script execution
initGcodeDragAndDrop();

const closeGcodePreviewBtn = document.getElementById('close-gcode-preview-btn');
if (closeGcodePreviewBtn) {
    closeGcodePreviewBtn.addEventListener('click', () => {
        document.getElementById('gcode-preview-modal').classList.add('hidden');
    });
}

// Bind post-shutdown toggle to show/hide delay container
const postShutdownToggle = document.getElementById('gcode-option-post-shutdown');
const shutdownDelayContainer = document.getElementById('gcode-option-shutdown-delay-container');
if (postShutdownToggle && shutdownDelayContainer) {
    postShutdownToggle.addEventListener('change', () => {
        if (postShutdownToggle.checked) {
            shutdownDelayContainer.classList.remove('hidden');
        } else {
            shutdownDelayContainer.classList.add('hidden');
        }
    });
}

// ─── Support Popover Click Handler ──────────────────────────────
const contactSupportBtn = document.getElementById('contact-support-btn');
const supportPopover = document.getElementById('support-popover');

if (contactSupportBtn && supportPopover) {
    contactSupportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        supportPopover.classList.toggle('hidden');
    });

    supportPopover.addEventListener('click', (e) => {
        // Prevent click from propagating to window and closing the popover
        e.stopPropagation();
    });

    // Intercept channel link clicks and open in external browser
    const { shell } = require('electron');
    supportPopover.querySelectorAll('.support-channel-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const href = item.getAttribute('href');
            if (href) {
                shell.openExternal(href);
            }
        });
    });

    window.addEventListener('click', () => {
        if (!supportPopover.classList.contains('hidden')) {
            supportPopover.classList.add('hidden');
        }
    });
}

// ─── Resize: redraw chart when window resizes ─────────────────────────────────
let _chartResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(_chartResizeTimer);
    _chartResizeTimer = setTimeout(() => {
        const wv = document.getElementById('workspace-view');
        if (wv && !wv.classList.contains('hidden') && window._chartJobs) {
            drawStatsChart(window._chartJobs, _currentChartPeriod || '7d');
        }
    }, 120);
});
