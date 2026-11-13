// Local-only sync stub (online app & cloud synchronization removed)

async function enqueueSync() {
    // No-op: Online sync disabled, local SQLite is the single source of truth
    return null;
}

async function processTwoWaySync() {
    return { status: 'offline', message: 'Online cloud sync removed' };
}

async function processPushSync() {
    return { status: 'offline', message: 'Online cloud sync removed' };
}

async function processPullSync() {
    return { status: 'offline', message: 'Online cloud sync removed' };
}

async function restartAutoSyncScheduler() {
    return { status: 'disabled' };
}

async function getSyncStats() {
    return { total: 0, pending: 0, syncing: 0, synced: 0, failed: 0 };
}

async function getServerUrl() {
    return '';
}

async function getDeviceId() {
    return 'LOCAL-DESKTOP';
}

async function getSetting(key, def = '') {
    return def;
}

async function setSetting(key, val) {
    return val;
}

module.exports = {
    enqueueSync,
    getSyncStats,
    processPushSync,
    processPullSync,
    processTwoWaySync,
    restartAutoSyncScheduler,
    getServerUrl,
    getDeviceId,
    getSetting,
    setSetting,
    isSyncActive: () => false
};
