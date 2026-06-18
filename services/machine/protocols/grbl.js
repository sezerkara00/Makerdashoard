function isSafeCommand(command) {
    if (typeof command !== 'string') return false;
    const line = command.trim().toUpperCase();
    if (!line) return true;
    if (line.startsWith(';')) return true;

    // Block dangerous commands for MVP safety gate.
    const blocked = ['M3', 'M4'];
    return !blocked.some((token) => line.startsWith(token));
}

function parseJob(gcodeText) {
    const lines = String(gcodeText || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    return {
        lines,
        lineCount: lines.length
    };
}

module.exports = {
    isSafeCommand,
    parseJob
};
