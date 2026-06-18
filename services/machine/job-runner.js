const { parseJob, isSafeCommand } = require('./protocols/grbl');

class JobRunner {
    constructor() {
        this.status = 'idle';
        this.job = null;
    }

    getStatus() {
        return {
            status: this.status,
            lineCount: this.job ? this.job.lineCount : 0
        };
    }

    loadJob(gcodeText) {
        const job = parseJob(gcodeText);
        if (!job.lineCount) {
            throw new Error('G-code is empty.');
        }

        const unsafe = job.lines.find((line) => !isSafeCommand(line));
        if (unsafe) {
            throw new Error(`Unsafe command blocked by MVP safety parser: ${unsafe}`);
        }

        this.job = job;
        this.status = 'ready';
        return this.getStatus();
    }

    start() {
        if (!this.job) throw new Error('No job loaded.');
        if (this.status !== 'ready' && this.status !== 'paused') {
            throw new Error(`Cannot start from status: ${this.status}`);
        }
        this.status = 'running';
        return this.getStatus();
    }

    pause() {
        if (this.status !== 'running') {
            throw new Error('Job is not running.');
        }
        this.status = 'paused';
        return this.getStatus();
    }

    resume() {
        if (this.status !== 'paused') {
            throw new Error('Job is not paused.');
        }
        this.status = 'running';
        return this.getStatus();
    }

    stop() {
        if (this.status === 'idle') {
            return this.getStatus();
        }
        this.status = 'ready';
        return this.getStatus();
    }
}

module.exports = JobRunner;
