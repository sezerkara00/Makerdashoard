const fs = require('fs');
const content = fs.readFileSync('./services/log-analyzer.js', 'utf8');

// Extract parsePrinterLogsTxt body
const match = content.match(/function parsePrinterLogsTxt\(content\)\s*\{([\s\S]*?)return \{\s*success: true/);
if (match) {
    const fnBody = match[1] + "return { reportContent: report, errorCount: printStats.Errors };";
    const parsePrinterLogsTxt = new Function('content', fnBody);

    const testContent = `[18.06.2026 10:00:00] [PROGRESS] Yazdırılıyor: %0 - T0: 140°C/140°C, Bed: 117°C/125°C, Hız: 0mm/s
[18.06.2026 10:05:00] [PROGRESS] Yazdırılıyor: %50 - T0: 150°C/150°C, Bed: 117°C/125°C, Hız: 50mm/s
[18.06.2026 10:10:00] [STATUS] Baskı İptal Edildi - Dosya: test.gcode (%50)`;
    
    console.log(parsePrinterLogsTxt(testContent));
} else {
    console.log("Could not extract function");
}
