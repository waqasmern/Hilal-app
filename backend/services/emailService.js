const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

/**
 * Builds a Nodemailer transporter from stored or provided settings.
 */
function createTransporter(config) {
    const service = (config.service || 'gmail').toLowerCase();
    const user = config.user || '';
    const pass = config.pass || '';

    if (!user || !pass) {
        throw new Error('Email credentials missing: sender email and app password are required.');
    }

    if (service === 'gmail') {
        return nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass },
            tls: { rejectUnauthorized: false }
        });
    }

    if (service === 'outlook' || service === 'hotmail') {
        return nodemailer.createTransport({
            service: 'hotmail',
            auth: { user, pass },
            tls: { rejectUnauthorized: false }
        });
    }

    if (service === 'yahoo') {
        return nodemailer.createTransport({
            service: 'yahoo',
            auth: { user, pass },
            tls: { rejectUnauthorized: false }
        });
    }

    // Custom SMTP
    const host = config.host || 'smtp.gmail.com';
    const port = parseInt(config.port, 10) || 465;
    const secure = config.secure === true || config.secure === 'true' || port === 465;

    return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });
}

/**
 * Sends a test email to verify credentials.
 */
async function sendTestEmail(config, recipient) {
    const transporter = createTransporter(config);
    const to = recipient || config.user;

    const mailOptions = {
        from: `"Hilal Wholesaler System" <${config.user}>`,
        to,
        subject: `✅ Hilal Wholesaler - Email Backup Test Verification (${new Date().toLocaleDateString()})`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                <div style="background: #0B3B7B; padding: 20px; border-radius: 12px; text-align: center; color: white;">
                    <h2 style="margin: 0; font-size: 20px;">Hilal Foods Solutions</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.85;">Wholesale & Retail Distribution System</p>
                </div>
                
                <div style="padding: 24px 0;">
                    <h3 style="color: #10B981; margin-top: 0;">🎉 SMTP Email Connection Successful!</h3>
                    <p style="color: #475569; font-size: 14px; line-height: 1.6;">
                        Your email settings for automated and online database backups are working perfectly.
                    </p>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0;">
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Sender Email:</td>
                            <td style="padding: 8px 0; color: #0f172a; text-align: right; font-family: monospace;">${config.user}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Recipient Email:</td>
                            <td style="padding: 8px 0; color: #0f172a; text-align: right; font-family: monospace;">${to}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Service / Host:</td>
                            <td style="padding: 8px 0; color: #0f172a; text-align: right;">${config.service || config.host || 'Gmail'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Verified At:</td>
                            <td style="padding: 8px 0; color: #0f172a; text-align: right;">${new Date().toLocaleString()}</td>
                        </tr>
                    </table>
                </div>

                <div style="background: #f8fafc; padding: 14px; border-radius: 8px; font-size: 12px; color: #64748b; text-align: center;">
                    This is an automated system notification from your Hilal Wholesaler Desktop POS.
                </div>
            </div>
        `
    };

    return await transporter.sendMail(mailOptions);
}

/**
 * Sends a full database backup attached as a .db file.
 */
async function sendBackupEmail(config, recipient, backupFilePath, summary = {}) {
    if (!fs.existsSync(backupFilePath)) {
        throw new Error(`Backup file not found at: ${backupFilePath}`);
    }

    const transporter = createTransporter(config);
    const to = recipient || config.recipient || config.user;
    const fileName = path.basename(backupFilePath);
    const fileStats = fs.statSync(backupFilePath);
    const sizeFormatted = fileStats.size > 1024 * 1024
        ? `${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`
        : `${(fileStats.size / 1024).toFixed(1)} KB`;

    const nowFormatted = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short'
    });

    const mailOptions = {
        from: `"Hilal Wholesaler System" <${config.user}>`,
        to,
        subject: `📦 Hilal Wholesaler - Database Backup [${nowFormatted}]`,
        html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
                <div style="background: #0B3B7B; padding: 22px; border-radius: 12px; text-align: center; color: white;">
                    <h2 style="margin: 0; font-size: 22px; font-weight: 800;">${summary.shop_name || 'Hilal Foods Solutions'}</h2>
                    <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.85;">Offline &amp; Cloud Database Backup Notification</p>
                </div>
                
                <div style="padding: 24px 0;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                        <h3 style="color: #0f172a; margin: 0; font-size: 16px;">Attached Database Snapshot:</h3>
                        <span style="background: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 6px;">COMPLETED</span>
                    </div>

                    <p style="color: #475569; font-size: 13.5px; line-height: 1.5; margin: 8px 0 16px 0;">
                        Attached is the complete, latest SQLite database file (<strong>${fileName}</strong>) for your shop. You can use this file to restore all your sales, customers, catalog, and inventory anytime.
                    </p>

                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 20px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Backup File:</td>
                                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-family: monospace; font-weight: 600;">${fileName}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">File Size:</td>
                                <td style="padding: 6px 0; color: #0f172a; text-align: right; font-weight: 700;">${sizeFormatted}</td>
                            </tr>
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Created Date &amp; Time:</td>
                                <td style="padding: 6px 0; color: #0f172a; text-align: right;">${nowFormatted}</td>
                            </tr>
                            ${summary.totalSales !== undefined ? `
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Total Invoices:</td>
                                <td style="padding: 6px 0; color: #0f172a; text-align: right;">${summary.totalSales}</td>
                            </tr>` : ''}
                            ${summary.totalCustomers !== undefined ? `
                            <tr style="border-bottom: 1px solid #e2e8f0;">
                                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Total Customers:</td>
                                <td style="padding: 6px 0; color: #0f172a; text-align: right;">${summary.totalCustomers}</td>
                            </tr>` : ''}
                            ${summary.totalProducts !== undefined ? `
                            <tr>
                                <td style="padding: 6px 0; color: #64748b; font-weight: 600;">Catalog Products:</td>
                                <td style="padding: 6px 0; color: #0f172a; text-align: right;">${summary.totalProducts}</td>
                            </tr>` : ''}
                        </table>
                    </div>

                    <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px; border-radius: 6px; font-size: 12px; color: #1e40af;">
                        <strong>💡 How to Restore:</strong> Download the attached <code>.db</code> file. Open Hilal Wholesaler Shop &gt; Go to <strong>Backup</strong> &gt; Click <strong>Restore Database</strong> &gt; Select this file.
                    </div>
                </div>

                <div style="background: #f8fafc; padding: 14px; border-radius: 8px; font-size: 11px; color: #94a3b8; text-align: center;">
                    Hilal Wholesaler POS &amp; Inventory System • Safe &amp; Automated Cloud Email Protection
                </div>
            </div>
        `,
        attachments: [
            {
                filename: fileName,
                path: backupFilePath,
                contentType: 'application/x-sqlite3'
            }
        ]
    };

    return await transporter.sendMail(mailOptions);
}

module.exports = {
    createTransporter,
    sendTestEmail,
    sendBackupEmail
};

