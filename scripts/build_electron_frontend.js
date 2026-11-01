const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const apiDir = path.join(__dirname, '..', 'frontend', 'src', 'app', 'api');
const backupDir = path.join(__dirname, '..', 'frontend', 'src', 'api_backup');

function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(element => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);
        if (fs.lstatSync(fromPath).isDirectory()) {
            copyFolderSync(fromPath, toPath);
        } else {
            fs.copyFileSync(fromPath, toPath);
        }
    });
}

function deleteFolderContentsSync(dir) {
    if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(file => {
            const curPath = path.join(dir, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderContentsSync(curPath);
                try { fs.rmdirSync(curPath); } catch (e) {}
            } else {
                fs.unlinkSync(curPath);
            }
        });
    }
}

console.log('=== Building Frontend for Electron Static Export ===');
const hasApi = fs.existsSync(apiDir);

try {
    if (hasApi) {
        console.log('1. Backing up api routes...');
        copyFolderSync(apiDir, backupDir);
        console.log('2. Temporarily clearing api directory for Next.js static export...');
        deleteFolderContentsSync(apiDir);
    }

    console.log('3. Running Next.js static export build...');
    execSync('npm run build', {
        cwd: path.join(__dirname, '..', 'frontend'),
        stdio: 'inherit',
        env: { ...process.env, STATIC_EXPORT: 'true' }
    });

    console.log('4. Next.js static export completed successfully!');
} catch (err) {
    console.error('Build error:', err.message);
    process.exitCode = 1;
} finally {
    if (hasApi && fs.existsSync(backupDir)) {
        console.log('5. Restoring api routes from backup...');
        copyFolderSync(backupDir, apiDir);
        deleteFolderContentsSync(backupDir);
        try { fs.rmdirSync(backupDir); } catch (e) {}
        console.log('6. Api routes restored completely.');
    }
}
