const crypto = require('crypto');

const LICENSE_SALT = 'LUXE_RESTO_POS_SECRET_SALT_9824_KEYGEN';

const PLAN_MAP = {
    'BAS': 'basic',
    'STD': 'standard',
    'PRM': 'premium'
};

const CODE_MAP = {
    'basic': 'BAS',
    'standard': 'STD',
    'premium': 'PRM'
};

function generateChecksum(planCode, part1, part2) {
    const raw = `${planCode}-${part1}-${part2}-${LICENSE_SALT}`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 4).toUpperCase();
}

function generateKey(plan = 'premium') {
    const planLower = String(plan).toLowerCase().trim();
    const planCode = CODE_MAP[planLower] || 'PRM';
    const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const checksum = generateChecksum(planCode, part1, part2);
    return `LUXE-${planCode}-${part1}-${part2}-${checksum}`;
}

function validateKey(key) {
    if (!key || typeof key !== 'string') return null;
    const cleanKey = key.trim().toUpperCase();

    const legacyKeys = [
        'TARIQ@2026#POS',
        'TARIQ-POS-2026',
        'AFC-POS-ACTIVATE',
        'LUXERESTO2026'
    ];
    if (legacyKeys.includes(cleanKey)) {
        return 'premium';
    }

    const parts = cleanKey.split('-');
    if (parts.length !== 5 || parts[0] !== 'LUXE') {
        return null;
    }

    const [prefix, planCode, part1, part2, checksum] = parts;
    const expectedPlan = PLAN_MAP[planCode];
    if (!expectedPlan) return null;

    const expectedChecksum = generateChecksum(planCode, part1, part2);
    if (checksum === expectedChecksum) {
        return expectedPlan;
    }
    return null;
}

module.exports = {
    generateKey,
    validateKey,
    PLAN_MAP,
    CODE_MAP
};
