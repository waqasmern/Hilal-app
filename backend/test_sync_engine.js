const assert = require('assert');
const db = require('./database');
const syncEngine = require('./syncEngine');

// Save original fetch
const originalFetch = global.fetch;

async function runTests() {
    console.log('====================================================');
    console.log('   Hilal Wholesaler — Sync Engine Automated Tests   ');
    console.log('====================================================\n');

    let passedTests = 0;
    let failedTests = 0;

    async function runTest(testNumber, testName, testFn) {
        try {
            await testFn();
            console.log(`[PASS] Test ${testNumber}: ${testName}`);
            passedTests++;
        } catch (err) {
            console.error(`[FAIL] Test ${testNumber}: ${testName}`);
            console.error(`       Error: ${err.message}\n`, err.stack);
            failedTests++;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Offline sale followed by internet reconnection
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(1, 'Offline sale followed by internet reconnection', async () => {
        const testUuid = `test-sale-${Date.now()}`;
        const salePayload = {
            invoice_no: `INV-OFFLINE-${Date.now().toString().slice(-4)}`,
            net_amount: 1500,
            amount_paid: 1500,
            payment_method: 'cash',
            items: [{ variant_id: 1, quantity: 2, price: 750, total: 1500 }]
        };

        const enq = await syncEngine.enqueueSync('SALE', 'sales', 9991, salePayload);
        assert(enq.uuid, 'Enqueued item should have a UUID');

        // Verify status is PENDING
        const row = await new Promise(r => db.get("SELECT status FROM sync_queue WHERE uuid = ?", [enq.uuid], (e, row) => r(row)));
        assert.strictEqual(row.status, 'PENDING');

        // Mock internet reconnection
        global.fetch = async (url, opts) => {
            if (url.includes('/api/sync/ingest')) {
                const body = JSON.parse(opts.body);
                return {
                    ok: true,
                    json: async () => ({ success: true, processedUuid: body.uuid })
                };
            }
            return originalFetch(url, opts);
        };

        const pushResult = await syncEngine.processPushSync();
        assert(pushResult.success > 0, 'Push sync should successfully process offline sale');

        // Verify status is now SYNCED
        const syncedRow = await new Promise(r => db.get("SELECT status FROM sync_queue WHERE uuid = ?", [enq.uuid], (e, row) => r(row)));
        assert.strictEqual(syncedRow.status, 'SYNCED');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Local stock not overwritten by cloud snapshots
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(2, 'Local stock not overwritten by cloud snapshots', async () => {
        // Setup a variant with 85 stock locally
        await new Promise(r => db.run("UPDATE product_variants SET current_stock = 85 WHERE id = 1", [], r));

        // Cloud sends snapshot where variant stock is 100
        global.fetch = async (url) => {
            if (url.includes('/api/sync/pull')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        cursor: new Date().toISOString(),
                        productVariants: [{
                            id: 1,
                            product_id: 1,
                            sku: 'SKU-TEST-VAR1',
                            barcode: '896000001',
                            variant_name: 'Standard',
                            current_stock: 100 // Outdated cloud snapshot!
                        }],
                        stockMovements: []
                    })
                };
            }
            return originalFetch(url);
        };

        await syncEngine.processPullSync();

        // Verify local stock remains 85 and was NOT overwritten to 100
        const v = await new Promise(r => db.get("SELECT current_stock FROM product_variants WHERE id = 1", [], (e, row) => r(row)));
        assert.strictEqual(v.current_stock, 85, 'Local stock must remain 85 and not be overwritten by cloud snapshot');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Customer balance preserved after offline credit sale
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(3, 'Customer balance preserved after offline credit sale', async () => {
        // Setup customer with Rs. 2,500 balance (debt)
        await new Promise(r => db.run("UPDATE customers SET balance = 2500 WHERE id = 1", [], r));

        // Cloud sends snapshot where customer balance is Rs. 0
        global.fetch = async (url) => {
            if (url.includes('/api/sync/pull')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        cursor: new Date().toISOString(),
                        customers: [{
                            id: 1,
                            name: 'Updated Name Online',
                            balance: 0 // Outdated cloud balance!
                        }],
                        customerLedger: []
                    })
                };
            }
            return originalFetch(url);
        };

        await syncEngine.processPullSync();

        // Verify local balance remains 2500
        const c = await new Promise(r => db.get("SELECT balance, name FROM customers WHERE id = 1", [], (e, row) => r(row)));
        assert.strictEqual(c.balance, 2500, 'Customer balance must not be wiped by cloud snapshot');
        assert.strictEqual(c.name, 'Updated Name Online', 'Customer metadata should still be updated');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Duplicate event upload (Cloud-side idempotency)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(4, 'Duplicate event upload (Cloud-side idempotency)', async () => {
        await new Promise(r => db.run("DELETE FROM sync_queue", [], r));
        let uploadCount = 0;
        const enq = await syncEngine.enqueueSync('SALE', 'sales', 9992, { note: 'test' });
        const targetUuid = enq.uuid;

        global.fetch = async (url, opts) => {
            if (url.includes('/api/sync/ingest')) {
                uploadCount++;
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        idempotent: uploadCount > 1,
                        processedUuid: targetUuid
                    })
                };
            }
            return originalFetch(url, opts);
        };

        // 1st push
        const r1 = await syncEngine.processPushSync();
        assert.strictEqual(r1.success, 1, 'First upload must succeed');

        // Re-queue the same event to test duplicate push
        await new Promise(r => db.run("UPDATE sync_queue SET status = 'PENDING' WHERE uuid = ?", [targetUuid], r));

        // 2nd push (simulate retry or duplicate upload)
        const r2 = await syncEngine.processPushSync();
        assert.strictEqual(r2.success, 1, 'Second upload must be recognized as idempotent and succeed');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Windows application crash during SYNCING
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(5, 'Windows application crash during SYNCING', async () => {
        const crashUuid = `crash-uuid-${Date.now()}`;
        // Insert an event stranded in SYNCING from 10 minutes ago
        await new Promise(r => db.run(
            `INSERT INTO sync_queue (uuid, operation_type, entity_name, entity_id, payload, status, retry_count, updated_at)
             VALUES (?, 'SALE', 'sales', '8888', '{}', 'SYNCING', 0, datetime('now', '-10 minutes'))`,
            [crashUuid],
            r
        ));

        // Recover stranded events
        const recoveredCount = await syncEngine.recoverStrandedSyncEvents();
        assert(recoveredCount >= 1, 'Must recover stranded events');

        const item = await new Promise(r => db.get("SELECT status FROM sync_queue WHERE uuid = ?", [crashUuid], (e, row) => r(row)));
        assert.strictEqual(item.status, 'PENDING', 'Stranded event status must be reset to PENDING');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: Failed cloud request and retry (Exponential backoff)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(6, 'Failed cloud request and retry (Exponential backoff)', async () => {
        await new Promise(r => db.run("DELETE FROM sync_queue", [], r));
        const failUuid = `fail-uuid-${Date.now()}`;
        await syncEngine.enqueueSync('SALE', 'sales', 7777, { test: 1 });
        await new Promise(r => db.run("UPDATE sync_queue SET uuid = ? WHERE entity_id = '7777'", [failUuid], r));

        // Simulate cloud 500 error
        global.fetch = async (url) => {
            if (url.includes('/api/sync/ingest')) {
                return {
                    ok: false,
                    status: 500,
                    text: async () => 'Internal Server Error'
                };
            }
            return originalFetch(url);
        };

        const pushRes = await syncEngine.processPushSync();
        assert(pushRes.failed >= 1, 'Push should report failure');

        // Verify status FAILED and retry_count = 1
        const item = await new Promise(r => db.get("SELECT status, retry_count FROM sync_queue WHERE uuid = ?", [failUuid], (e, row) => r(row)));
        assert.strictEqual(item.status, 'FAILED');
        assert.strictEqual(item.retry_count, 1);

        // Immediate next getPendingSyncItems() should exclude this item due to backoff
        const pending = await syncEngine.getPendingSyncItems();
        const found = pending.find(p => p.uuid === failUuid);
        assert(!found, 'Item must be held in backoff delay and not immediately re-polled');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7: Database constraint failure during pull (Rollback & cursor preservation)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(7, 'Database constraint failure during pull', async () => {
        const initialCursor = '2026-01-01T00:00:00.000Z';
        await syncEngine.setSetting('last_pull_cursor', initialCursor);

        // Mock cloud returning invalid malformed products payload that fails DB insert
        global.fetch = async (url) => {
            if (url.includes('/api/sync/pull')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        cursor: '2026-11-01T12:00:00.000Z',
                        products: [{ id: null, name: null }], // Triggers NOT NULL constraint violation!
                        productVariants: []
                    })
                };
            }
            return originalFetch(url);
        };

        try {
            await syncEngine.processPullSync();
        } catch (e) {
            // Expected transaction failure
        }

        // Verify cursor was NOT advanced
        const cursor = await syncEngine.getSetting('last_pull_cursor');
        assert.strictEqual(cursor, initialCursor, 'Cursor must remain unchanged when pull transaction fails');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 8: Cloud order download (PENDING status, no stock deduction)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(8, 'Cloud order download (PENDING status, no stock deduction)', async () => {
        const initialStock = 50;
        await new Promise(r => db.run("UPDATE product_variants SET current_stock = ? WHERE id = 1", [initialStock], r));

        const pendingInvNo = `ORD-PENDING-${Date.now()}`;
        global.fetch = async (url) => {
            if (url.includes('/api/sync/pull')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        cursor: new Date().toISOString(),
                        sales: [{
                            id: 9911,
                            uuid: `ord-uuid-${Date.now()}`,
                            invoice_no: pendingInvNo,
                            order_status: 'PENDING',
                            status: 'pending',
                            net_amount: 5000,
                            customer_id: 1
                        }],
                        saleItems: [{
                            id: 9911,
                            sale_id: 9911,
                            variant_id: 1,
                            quantity: 10,
                            price: 500,
                            total: 5000
                        }],
                        stockMovements: [] // No stock movement for pending order!
                    })
                };
            }
            return originalFetch(url);
        };

        await syncEngine.processPullSync();

        // Verify sale exists with order_status = PENDING
        const sale = await new Promise(r => db.get("SELECT order_status, status FROM sales WHERE invoice_no = ?", [pendingInvNo], (e, row) => r(row)));
        assert(sale, 'Pending order must be downloaded');
        assert.strictEqual(sale.order_status, 'PENDING');
        assert.strictEqual(sale.status, 'pending');

        // Verify stock was NOT deducted
        const v = await new Promise(r => db.get("SELECT current_stock FROM product_variants WHERE id = 1", [], (e, row) => r(row)));
        assert.strictEqual(v.current_stock, initialStock, 'Stock must NOT be deducted for PENDING orders');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 9: Duplicate online order prevention
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(9, 'Duplicate online order prevention', async () => {
        const orderInv = `ORD-UNIQUE-${Date.now()}`;
        const orderPayload = {
            success: true,
            cursor: new Date().toISOString(),
            sales: [{
                id: 9922,
                uuid: `dup-order-${Date.now()}`,
                invoice_no: orderInv,
                order_status: 'PENDING',
                status: 'pending',
                net_amount: 1200
            }],
            saleItems: []
        };

        global.fetch = async () => ({ ok: true, json: async () => orderPayload });

        // Pull twice
        await syncEngine.processPullSync();
        await syncEngine.processPullSync();

        // Check count of rows in sales for this invoice_no
        const row = await new Promise(r => db.get("SELECT COUNT(*) as count FROM sales WHERE invoice_no = ?", [orderInv], (e, row) => r(row)));
        assert.strictEqual(row.count, 1, 'Duplicate online orders must not create multiple sales records');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 10: Concurrent synchronization workers (Mutex lock)
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(10, 'Concurrent synchronization workers (Mutex lock)', async () => {
        // Slow down pull so the second call runs while the first is active
        global.fetch = async (url) => {
            if (url.includes('/api/sync/pull')) {
                await new Promise(r => setTimeout(r, 100));
                return {
                    ok: true,
                    json: async () => ({ success: true, cursor: new Date().toISOString() })
                };
            }
            return { ok: true, json: async () => ({ success: true }) };
        };

        const p1 = syncEngine.processTwoWaySync();
        const p2 = syncEngine.processTwoWaySync();

        const [res1, res2] = await Promise.all([p1, p2]);

        assert(res1.status === 'busy' || res2.status === 'busy', 'One of the concurrent sync workers must be rejected with status: busy');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 11: Cash refund synchronization
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(11, 'Cash refund synchronization', async () => {
        // Variant stock = 40
        await new Promise(r => db.run("UPDATE product_variants SET current_stock = 40 WHERE id = 1", [], r));

        const returnMovementUuid = `ret-uuid-${Date.now()}`;
        // Cloud sends a RETURN stock movement (+5 units returned into warehouse)
        global.fetch = async (url) => {
            if (url.includes('/api/sync/pull')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        cursor: new Date().toISOString(),
                        stockMovements: [{
                            uuid: returnMovementUuid,
                            variant_id: 1,
                            movement_type: 'RETURN',
                            quantity: 5,
                            equivalent_qty: 5,
                            reference_id: 'REF-RET-01'
                        }]
                    })
                };
            }
            return originalFetch(url);
        };

        await syncEngine.processPullSync();

        // Verify variant stock increased by 5 (40 + 5 = 45)
        const v = await new Promise(r => db.get("SELECT current_stock FROM product_variants WHERE id = 1", [], (e, row) => r(row)));
        assert.strictEqual(v.current_stock, 45, 'Return stock movement must increase warehouse inventory');

        // Pull again with same movement: stock must NOT increase again (idempotent)
        await syncEngine.processPullSync();
        const v2 = await new Promise(r => db.get("SELECT current_stock FROM product_variants WHERE id = 1", [], (e, row) => r(row)));
        assert.strictEqual(v2.current_stock, 45, 'Duplicate return stock movement must not be applied twice');
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Test 12: Payment and ledger synchronization
    // ─────────────────────────────────────────────────────────────────────────
    await runTest(12, 'Payment and ledger synchronization', async () => {
        // Customer balance = Rs. 3,000
        await new Promise(r => db.run("UPDATE customers SET balance = 3000 WHERE id = 1", [], r));

        const paymentLedgerUuid = `pay-ledger-uuid-${Date.now()}`;
        // Cloud sends a customer payment of Rs. 1,000
        global.fetch = async (url) => {
            if (url.includes('/api/sync/pull')) {
                return {
                    ok: true,
                    json: async () => ({
                        success: true,
                        cursor: new Date().toISOString(),
                        customerLedger: [{
                            uuid: paymentLedgerUuid,
                            customer_id: 1,
                            amount: 1000,
                            type: 'payment',
                            description: 'Bank Transfer Payment'
                        }]
                    })
                };
            }
            return originalFetch(url);
        };

        await syncEngine.processPullSync();

        // Verify balance decreased from 3000 to 2000
        const c = await new Promise(r => db.get("SELECT balance FROM customers WHERE id = 1", [], (e, row) => r(row)));
        assert.strictEqual(c.balance, 2000, 'Customer payment in ledger must reduce customer balance by Rs. 1,000');

        // Pull again with same ledger uuid: balance must not decrease again
        await syncEngine.processPullSync();
        const c2 = await new Promise(r => db.get("SELECT balance FROM customers WHERE id = 1", [], (e, row) => r(row)));
        assert.strictEqual(c2.balance, 2000, 'Duplicate ledger entry must not reduce balance twice');
    });

    // Restore fetch
    global.fetch = originalFetch;

    console.log('\n====================================================');
    console.log(`Test Execution Complete: ${passedTests} Passed, ${failedTests} Failed`);
    console.log('====================================================');

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
