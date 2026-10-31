/**
 * Standalone License Key Generator for Luxe Resto POS
 * 
 * Usage:
 *   node scripts/generate-license.js basic
 *   node scripts/generate-license.js standard
 *   node scripts/generate-license.js premium
 *   node scripts/generate-license.js all
 */

const { generateKey, validateKey } = require('./licenseUtils');

const args = process.argv.slice(2);
const planArg = args[0] ? args[0].toLowerCase().trim() : 'all';
const countArg = parseInt(args[1], 10) || 1;

console.log('====================================================');
console.log('       LUXE RESTO POS - LICENSE KEY GENERATOR       ');
console.log('====================================================\n');

if (planArg === 'all') {
    ['basic', 'standard', 'premium'].forEach(p => {
        console.log(`[ ${p.toUpperCase()} PLAN KEYS ]`);
        for (let i = 1; i <= countArg; i++) {
            const key = generateKey(p);
            const verified = validateKey(key);
            console.log(`  Key ${i}: ${key}  (Valid: ${verified === p ? 'YES' : 'NO'})`);
        }
        console.log('');
    });
} else if (['basic', 'standard', 'premium'].includes(planArg)) {
    console.log(`Generating ${countArg} key(s) for [ ${planArg.toUpperCase()} ] Plan:\n`);
    for (let i = 1; i <= countArg; i++) {
        const key = generateKey(planArg);
        const verified = validateKey(key);
        console.log(`  Key ${i}: ${key}  (Valid: ${verified === planArg ? 'YES' : 'NO'})`);
    }
} else {
    console.log('Unknown plan! Please choose: basic, standard, premium, or all');
    console.log('Example: node scripts/generate-license.js premium 3');
}

console.log('\n====================================================');
