const db = require('./database');
const crypto = require('crypto');

function generateUUID() {
    return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16)
    );
}

/**
 * Enqueue a transaction operation into local sync_queue outbox
 */
function enqueueSync(operationType, entityName, entityId, payload, deviceId = 'DEVICE-CASHIER-01') {
    return new Promise((resolve, reject) => {
        const uuid = generateUUID();
        const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
        const query = `
            INSERT INTO sync_queue (uuid, operation_type, entity_name, entity_id, payload, status, device_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'PENDING', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;
        db.run(query, [uuid, operationType, entityName, entityId, payloadStr, deviceId], function(err) {
            if (err) {
                console.error('[SyncEngine] Failed to enqueue transaction:', err);
                return reject(err);
            }
            console.log(`[SyncEngine] Enqueued transaction ${uuid} for ${operationType}:${entityName}`);
            resolve({ id: this.lastID, uuid });
        });
    });
}

/**
 * Get pending sync count & items
 */
function getPendingSyncItems() {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM sync_queue WHERE status IN ('PENDING', 'FAILED') ORDER BY id ASC LIMIT 50`, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

/**
 * Get sync queue statistics summary
 */
function getSyncStats() {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'SYNCING' THEN 1 ELSE 0 END) as syncing,
                SUM(CASE WHEN status = 'SYNCED' THEN 1 ELSE 0 END) as synced,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
            FROM sync_queue
        `, [], (err, row) => {
            if (err) return reject(err);
            resolve(row || { total: 0, pending: 0, syncing: 0, synced: 0, failed: 0 });
        });
    });
}

/**
 * Mark sync item status
 */
function updateSyncStatus(uuid, status, errorMessage = null) {
    return new Promise((resolve, reject) => {
        db.run(
            `UPDATE sync_queue SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP, retry_count = retry_count + 1 WHERE uuid = ?`,
            [status, errorMessage, uuid],
            function(err) {
                if (err) return reject(err);
                resolve(true);
            }
        );
    });
}

/**
 * Process push sync to centralized PostgreSQL cloud server (Simulated / Contract-ready)
 */
async function processPushSync() {
    try {
        const pendingItems = await getPendingSyncItems();
        if (pendingItems.length === 0) {
            return { status: 'up_to_date', processed: 0 };
        }

        // Get server URL setting
        const serverSetting = await new Promise((res) => {
            db.get("SELECT value FROM settings WHERE key = 'server_url'", [], (e, row) => res(row ? row.value : null));
        });

        const syncEnabled = await new Promise((res) => {
            db.get("SELECT value FROM settings WHERE key = 'online_sync_enabled'", [], (e, row) => res(row ? row.value === 'true' : false));
        });

        let successCount = 0;
        let failCount = 0;

        for (const item of pendingItems) {
            await updateSyncStatus(item.uuid, 'SYNCING');
            try {
                if (syncEnabled && serverSetting) {
                    // Attempt remote push via fetch REST endpoint
                    const response = await fetch(`${serverSetting}/api/sync/ingest`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            uuid: item.uuid,
                            operation_type: item.operation_type,
                            entity_name: item.entity_name,
                            entity_id: item.entity_id,
                            payload: JSON.parse(item.payload),
                            device_id: item.device_id
                        })
                    });

                    if (response.ok) {
                        await updateSyncStatus(item.uuid, 'SYNCED');
                        successCount++;
                    } else {
                        const errText = await response.text();
                        await updateSyncStatus(item.uuid, 'FAILED', errText || 'Server sync error');
                        failCount++;
                    }
                } else {
                    // Offline or local standalone mode: Mark SYNCED locally for demonstration/queue resolution
                    await updateSyncStatus(item.uuid, 'SYNCED');
                    successCount++;
                }
            } catch (err) {
                await updateSyncStatus(item.uuid, 'FAILED', err.message);
                failCount++;
            }
        }

        return { status: 'completed', processed: pendingItems.length, success: successCount, failed: failCount };
    } catch (err) {
        console.error('[SyncEngine] Process push sync error:', err);
        throw err;
    }
}

module.exports = {
    enqueueSync,
    getPendingSyncItems,
    getSyncStats,
    updateSyncStatus,
    processPushSync
};
