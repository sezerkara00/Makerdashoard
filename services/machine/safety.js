class SafetyService {
    constructor() {
        this.state = {
            doorClosed: true,
            fireAlarm: false,
            emergencyStop: false,
            interlockEnabled: true
        };
    }

    getState() {
        return { ...this.state };
    }

    setState(partial) {
        this.state = { ...this.state, ...partial };
        return this.getState();
    }

    canStartJob() {
        if (!this.state.interlockEnabled) {
            return { ok: true };
        }
        if (!this.state.doorClosed) {
            return { ok: false, reason: 'Safety interlock: Door is open.' };
        }
        if (this.state.fireAlarm) {
            return { ok: false, reason: 'Safety interlock: Fire alarm active.' };
        }
        if (this.state.emergencyStop) {
            return { ok: false, reason: 'Safety interlock: Emergency stop active.' };
        }
        return { ok: true };
    }
}

module.exports = SafetyService;
