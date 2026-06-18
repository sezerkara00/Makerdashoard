class ConnectionService {
    constructor() {
        this.connected = false;
        this.profile = null;
    }

    connect(profile = {}) {
        this.connected = true;
        this.profile = {
            protocol: profile.protocol || 'grbl-mock',
            transport: profile.transport || 'mock',
            target: profile.target || 'local-simulator'
        };
        return this.getState();
    }

    disconnect() {
        this.connected = false;
        this.profile = null;
        return this.getState();
    }

    getState() {
        return {
            connected: this.connected,
            profile: this.profile
        };
    }
}

module.exports = ConnectionService;
