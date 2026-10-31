// backend/services/schedulerService.js
const db = require('../database');
const { sendBulkDuesReminders } = require('./reminderService');

let schedulerInterval = null;
// Key format: "YYYY-MM-DD@HH:MM" — unique per day AND per configured time
// This allows re-firing when user changes the reminder time on the same day
let lastFiredKey = '';

/**
 * Parse any time string (12h or 24h) to HH:MM 24-hour format.
 * Examples: "06:58 PM" → "18:58", "18:58" → "18:58", "2:48 PM" → "14:48"
 */
function parseTimeTo24h(timeStr) {
    if (!timeStr) return '10:00';
    let str = timeStr.trim();
    const isPM = /pm/i.test(str);
    const isAM = /am/i.test(str);
    str = str.replace(/[apmAPM]/g, '').trim();
    const parts = str.split(':');
    let hour = parseInt(parts[0], 10) || 0;
    let minute = parseInt(parts[1], 10) || 0;
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function getNow() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const date = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
    return { h, m, date, time24: `${h}:${m}` };
}

/**
 * Build a unique fire key for a given date + scheduled time.
 * Format: "2026-07-27@14:48" — one fire per day per configured time.
 */
function buildFiredKey(date, time24) {
    return `${date}@${time24}`;
}

/**
 * Start (or restart) the daily reminder scheduler.
 * Checks every 30 seconds. Also fires immediately (catch-up) if the scheduled
 * time already passed today and hasn't fired yet for this configured time.
 */
function scheduleReminderJob() {
    // Stop any previously running scheduler
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[WhatsApp Scheduler] Previous scheduler stopped.');
    }

    // Read current settings from DB
    db.all(`SELECT key, value FROM settings WHERE key IN ('wa_reminder_enabled', 'wa_reminder_time')`, [], async (err, rows) => {
        let enabled = 'false';
        let rawTime = '10:00';

        if (!err && rows) {
            rows.forEach(r => {
                if (r.key === 'wa_reminder_enabled') enabled = r.value;
                if (r.key === 'wa_reminder_time') rawTime = r.value;
            });
        }

        if (enabled !== 'true') {
            console.log('[WhatsApp Scheduler] Auto-reminders are disabled. Scheduler not started.');
            return;
        }

        const time24 = parseTimeTo24h(rawTime);
        console.log(`[WhatsApp Scheduler] ✅ Active — scheduled daily at ${time24} local time. Checking every 30s.`);

        // --- Catch-up: fire immediately if today's job for this time hasn't run yet ---
        const { h, m, date } = getNow();
        const currentMinutes = parseInt(h) * 60 + parseInt(m);
        const [schedH, schedM] = time24.split(':').map(Number);
        const scheduledMinutes = schedH * 60 + schedM;
        const catchUpKey = buildFiredKey(date, time24);

        if (currentMinutes >= scheduledMinutes && lastFiredKey !== catchUpKey) {
            console.log(`[WhatsApp Scheduler] ⏰ Catch-up: ${time24} already passed today (${date}). Running reminders now...`);
            try {
                const res = await sendBulkDuesReminders(true);
                // Only mark as fired if WA was actually connected (not skipped)
                if (res && res.success !== false) {
                    lastFiredKey = catchUpKey;
                } else if (res && res.message && res.message.includes('not connected')) {
                    console.log('[WhatsApp Scheduler] ⚠️ WA not connected during catch-up — will retry when WA connects.');
                } else {
                    lastFiredKey = catchUpKey;
                }
                console.log('[WhatsApp Scheduler] ✅ Catch-up done:', res.message || JSON.stringify(res));
            } catch (e) {
                console.error('[WhatsApp Scheduler] ❌ Catch-up error:', e.message);
            }
        }

        // --- Regular interval: fire at exact scheduled time each day ---
        schedulerInterval = setInterval(async () => {
            const { date, time24: currentTime } = getNow();
            const fireKey = buildFiredKey(date, time24);

            if (currentTime === time24 && lastFiredKey !== fireKey) {
                lastFiredKey = fireKey;
                console.log(`[WhatsApp Scheduler] ⏰ Triggered at ${time24} on ${date}. Running daily auto-reminders...`);
                try {
                    const res = await sendBulkDuesReminders(true);
                    console.log('[WhatsApp Scheduler] ✅ Done:', res.message || JSON.stringify(res));
                } catch (e) {
                    console.error('[WhatsApp Scheduler] ❌ Error running reminders:', e.message);
                }
            }
        }, 30000); // every 30 seconds
    });
}

module.exports = { scheduleReminderJob };
