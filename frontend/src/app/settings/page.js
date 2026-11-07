'use client';
import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setSettings as setGlobalSettings } from '../../store';
import { QRCodeSVG } from 'qrcode.react';
import { 
    IconSettings, IconWhatsApp, IconUpload, IconPrinter, 
    IconTrash, IconCheckCircle, IconCrossCircle, IconRefresh, 
    IconEye, IconEyeOff, IconBank, IconPlus, IconEdit, IconClose,
    IconWarning, IconCheck, IconSync
} from '../components/Icons';
import { getInstalledPrinters, triggerPrintHtml, generateTestPrintHtml, isElectronRenderer } from '../../lib/printHelper';

export default function SettingsPage() {
    const dispatch = useDispatch();
    const [activeTab, setActiveTab] = useState('general'); // 'general' | 'whatsapp' | 'printer' | 'system'

    const [settings, setSettings] = useState({
        shop_name: 'Hilal Wholesaler Shop',
        shop_tagline: 'Wholesale & Retail Distribution',
        shop_address: 'Main Bazaar, Timergara, KP, Pakistan',
        shop_phone: '+92 300 1234567',
        shop_email: 'hilalwholesaler@gmail.com',
        shop_ntn: '1234567-8',
        currency_symbol: 'Rs.',
        shop_logo: '',
        bank_accounts: JSON.stringify([
            {
                bank_name: 'Meezan Bank',
                account_title: 'Hilal Wholesaler Shop',
                account_number: '0101-0102030405',
                iban: 'PK12MEZN0001010102030405',
                branch: 'Timergara Branch'
            }
        ]),
        device_id: 'DEVICE-CASHIER-01',
        online_sync_enabled: 'true',
        auto_sync_enabled: 'true',
        sync_interval_minutes: '3',
        server_url: 'https://hilal-app-three.vercel.app',
        wa_reminder_enabled: 'false',
        wa_reminder_time: '10:00 AM',
        wa_reminder_frequency: '1',
        wa_reminder_template: 'السلام علیکم {customer_name} صاحب،\n\nیہ {shop_name} کی طرف سے یاددہانی ہے۔ آپ کے ذمے ہمارے بقایا جات مبلغ Rs. {amount} ہیں۔\n\nبراہ کرم جلد از جلد واجب الادا رقم کی ادائیگی کا بندوبست فرمائیں۔ شکریہ!\n{shop_name}',
        selected_printer: '',
        selected_a4_printer: '',
        silent_print: 'false',
        auto_print_sale: 'false',
        default_print_format: 'a4'
    });

    const [saving, setSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [alertState, setAlertState] = useState({ isOpen: false, type: 'info', title: '', message: '' });

    // Printer & Silent Print State
    const [printers, setPrinters] = useState([]);
    const [detectingPrinters, setDetectingPrinters] = useState(false);
    const [testPrinting, setTestPrinting] = useState(false);

    // Bank Accounts Manager State
    const [bankModalOpen, setBankModalOpen] = useState(false);
    const [editingBankIndex, setEditingBankIndex] = useState(null);
    const [bankForm, setBankForm] = useState({
        bank_name: 'Meezan Bank',
        account_title: '',
        account_number: '',
        iban: '',
        branch: ''
    });

    // WhatsApp State
    const [whatsappStatus, setWhatsappStatus] = useState({ status: 'disconnected', qr: null });
    const [pollingInterval, setPollingInterval] = useState(null);
    const [waLoading, setWaLoading] = useState(false);

    // Specific Customer Dues Dispatcher State
    const [customers, setCustomers] = useState([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [customWaMessage, setCustomWaMessage] = useState('');
    const [sendingReminder, setSendingReminder] = useState(false);
    const [sendingPdf, setSendingPdf] = useState(false);
    const [sendingBulk, setSendingBulk] = useState(false);

    // WhatsApp Activity Logs
    const [waLogs, setWaLogs] = useState([]);

    useEffect(() => {
        fetchSettings();
        fetchCustomers();
        fetchWhatsAppStatus();
        fetchWhatsAppLogs();
        fetchPrinters();

        // Poll WhatsApp status every 4 seconds when in whatsapp tab
        const interval = setInterval(() => {
            fetchWhatsAppStatus();
        }, 4000);
        setPollingInterval(interval);

        return () => clearInterval(interval);
    }, []);

    const showAlert = (title, message, type = 'info') => {
        setAlertState({ isOpen: true, title, message, type });
        setTimeout(() => setAlertState(prev => ({ ...prev, isOpen: false })), 4500);
    };

    const fetchPrinters = async () => {
        setDetectingPrinters(true);
        try {
            const list = await getInstalledPrinters();
            setPrinters(list);
        } catch (err) {
            console.warn('Failed to load printers:', err);
        } finally {
            setDetectingPrinters(false);
        }
    };

    const handleTestPrint = async () => {
        setTestPrinting(true);
        try {
            const isSilent = settings.silent_print === 'true';
            const printFormat = 'thermal';
            const html = generateTestPrintHtml(settings, settings.selected_printer, isSilent, printFormat);
            const success = await triggerPrintHtml(html, {
                silent: isSilent,
                printerName: settings.selected_printer,
                format: printFormat
            });
            if (success) {
                showAlert('Test Slip Sent', `Sent 80mm test slip to ${settings.selected_printer || 'System Default Thermal Printer'} (${isSilent ? 'Silent Mode' : 'Standard Dialog Mode'}).`, 'success');
            } else {
                showAlert('Test Slip Dispatched', 'Thermal test print request dispatched to printer.', 'info');
            }
        } catch (err) {
            showAlert('Test Print Failed', err.message, 'error');
        } finally {
            setTestPrinting(false);
        }
    };

    const formatMinutesToReadable = (minStr) => {
        const mins = parseFloat(minStr) || 3;
        if (mins < 60) {
            return `${mins} minute${mins === 1 ? '' : 's'}`;
        }
        const hours = Math.floor(mins / 60);
        const remMinutes = mins % 60;
        if (remMinutes === 0) {
            return `${hours} hour${hours === 1 ? '' : 's'}`;
        }
        return `${hours} hr ${remMinutes} min`;
    };

    const handleTriggerSync = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('http://localhost:5000/api/sync/trigger', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                showAlert('Sync Completed', `Cloud pull: ${data.pull?.status || 'completed'}, offline push: ${data.push?.status || 'up to date'}.`, 'success');
            } else {
                const errData = await res.json().catch(() => ({}));
                showAlert('Sync Notice', errData.error || 'Server error', 'error');
            }
        } catch (err) {
            showAlert('Sync Failed', err.message, 'error');
        } finally {
            setIsSyncing(false);
        }
    };

    const getBankAccounts = () => {
        if (!settings.bank_accounts) return [];
        if (Array.isArray(settings.bank_accounts)) return settings.bank_accounts;
        try {
            const parsed = JSON.parse(settings.bank_accounts);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    const handleOpenAddBank = () => {
        setEditingBankIndex(null);
        setBankForm({
            bank_name: 'Meezan Bank',
            account_title: settings.shop_name || '',
            account_number: '',
            iban: '',
            branch: ''
        });
        setBankModalOpen(true);
    };

    const handleOpenEditBank = (idx) => {
        const list = getBankAccounts();
        setEditingBankIndex(idx);
        setBankForm(list[idx] || { bank_name: 'Meezan Bank', account_title: '', account_number: '', iban: '', branch: '' });
        setBankModalOpen(true);
    };

    const handleDeleteBank = (idx) => {
        const list = getBankAccounts();
        const updated = list.filter((_, i) => i !== idx);
        setSettings(prev => ({ ...prev, bank_accounts: JSON.stringify(updated) }));
        showAlert('Bank Account Removed', 'Click "Save General Settings" to apply.', 'info');
    };

    const handleSaveBank = (e) => {
        e.preventDefault();
        if (!bankForm.bank_name.trim() || !bankForm.account_number.trim()) {
            showAlert('Missing Fields', 'Please enter both Bank Name and Account Number.', 'error');
            return;
        }
        const list = getBankAccounts();
        let updated = [];
        if (editingBankIndex !== null) {
            updated = list.map((b, i) => i === editingBankIndex ? bankForm : b);
        } else {
            updated = [...list, bankForm];
        }
        setSettings(prev => ({ ...prev, bank_accounts: JSON.stringify(updated) }));
        setBankModalOpen(false);
        showAlert('Bank Account Added', 'New bank account ready. Click "Save General Settings" to apply.', 'success');
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/settings');
            if (res.ok) {
                const data = await res.json();
                setSettings(prev => ({ ...prev, ...data }));
                dispatch(setGlobalSettings(data));
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    };

    const fetchCustomers = async () => {
        try {
            const res = await fetch('http://localhost:5000/api/customers');
            if (res.ok) {
                const data = await res.json();
                setCustomers(data || []);
            }
        } catch (err) {
            console.error('Failed to load customers:', err);
        }
    };

    const fetchWhatsAppStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/whatsapp/status', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const data = await res.json();
                setWhatsappStatus(data);
            }
        } catch (err) {
            // Silently ignore if offline
        }
    };

    const fetchWhatsAppLogs = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/whatsapp/logs', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const data = await res.json();
                setWaLogs(data || []);
            }
        } catch (err) {
            console.error('Failed to load WA logs:', err);
        }
    };

    const handleSaveSettings = async (e) => {
        if (e) e.preventDefault();
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/settings', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify(settings)
            });

            if (res.ok) {
                dispatch(setGlobalSettings(settings));
                showAlert('Success', 'Shop settings & WhatsApp configuration updated successfully!', 'success');
            } else {
                const data = await res.json();
                showAlert('Error', data.error || 'Failed to save settings', 'error');
            }
        } catch (err) {
            showAlert('Error', err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // Handle Logo Image Upload & Compression to base64
    const handleLogoUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            showAlert('File Too Large', 'Please upload a logo image smaller than 5MB.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                // Resize image to max 400x400 for crisp, snappy performance
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 400;

                if (width > height && width > maxDim) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else if (height > maxDim) {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/png', 0.9);
                setSettings(prev => ({ ...prev, shop_logo: dataUrl }));
                showAlert('Logo Ready', 'New logo selected! Click "Save Settings" to apply.', 'success');
            };
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveLogo = () => {
        setSettings(prev => ({ ...prev, shop_logo: '' }));
        showAlert('Logo Removed', 'Shop logo cleared. Click "Save Settings" to apply.', 'info');
    };

    // WhatsApp Handlers
    const handleConnectWhatsApp = async () => {
        setWaLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/whatsapp/connect', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                }
            });
            const data = await res.json();
            if (res.ok) {
                showAlert('WhatsApp Connecting', 'Generating new QR code. Scan it from your WhatsApp mobile app.', 'info');
                fetchWhatsAppStatus();
            } else {
                showAlert('Error', data.error || 'Failed to initialize WhatsApp', 'error');
            }
        } catch (err) {
            showAlert('Connection Error', err.message, 'error');
        } finally {
            setWaLoading(false);
        }
    };

    const handleLogoutWhatsApp = async () => {
        if (!confirm('Are you sure you want to disconnect WhatsApp session? You will need to scan QR code again.')) return;
        setWaLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/whatsapp/logout', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                }
            });
            if (res.ok) {
                showAlert('Disconnected', 'WhatsApp session has been logged out.', 'info');
                fetchWhatsAppStatus();
            }
        } catch (err) {
            showAlert('Error', err.message, 'error');
        } finally {
            setWaLoading(false);
        }
    };

    // Send WhatsApp Text Dues Reminder to Specific Customer
    const handleSendCustomerReminder = async () => {
        if (!selectedCustomerId) {
            showAlert('Select Customer', 'Please choose a customer to send the reminder to.', 'error');
            return;
        }

        const customer = customers.find(c => String(c.id) === String(selectedCustomerId));
        if (!customer) return;

        if (!customer.phone) {
            showAlert('No Phone Number', `${customer.name} has no phone number recorded.`, 'error');
            return;
        }

        setSendingReminder(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/whatsapp/send-reminder', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    customer_id: customer.id,
                    message: customWaMessage || undefined
                })
            });

            const data = await res.json();
            if (res.ok) {
                showAlert('Reminder Sent!', `WhatsApp dues reminder sent to ${customer.name}.`, 'success');
                fetchWhatsAppLogs();
                setCustomWaMessage('');
            } else {
                showAlert('Failed to Send', data.error || 'Failed to send reminder', 'error');
            }
        } catch (err) {
            showAlert('Error', err.message, 'error');
        } finally {
            setSendingReminder(false);
        }
    };

    // Send Customer Dues Statement PDF via WhatsApp
    const handleSendCustomerPdf = async () => {
        if (!selectedCustomerId) {
            showAlert('Select Customer', 'Please choose a customer to send the dues statement PDF to.', 'error');
            return;
        }

        const customer = customers.find(c => String(c.id) === String(selectedCustomerId));
        if (!customer) return;

        if (!customer.phone) {
            showAlert('No Phone Number', `${customer.name} has no phone number recorded.`, 'error');
            return;
        }

        setSendingPdf(true);
        try {
            const token = localStorage.getItem('token');
            const now = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
            const cleanName = (customer.name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
            const fileName = `${cleanName}_Dues_Statement_${timestamp}.pdf`;

            // Call backend PDF generator and dispatcher
            const res = await fetch('http://localhost:5000/api/whatsapp/send-pdf', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    customer_id: customer.id,
                    file_name: fileName,
                    message: customWaMessage || undefined,
                    // If no base64 is passed, backend generates high-fidelity statement automatically!
                    pdf_base64: ''
                })
            });

            const data = await res.json();
            if (res.ok) {
                showAlert('PDF Sent via WhatsApp!', `Dues statement PDF successfully sent to ${customer.name}.`, 'success');
                fetchWhatsAppLogs();
                setCustomWaMessage('');
            } else {
                showAlert('Failed to Send PDF', data.error || 'Failed to send PDF statement', 'error');
            }
        } catch (err) {
            showAlert('Error', err.message, 'error');
        } finally {
            setSendingPdf(false);
        }
    };

    // Bulk Reminders Trigger
    const handleSendBulkReminders = async () => {
        const customersWithDues = customers.filter(c => (parseFloat(c.balance) || 0) > 0 && c.phone);
        if (customersWithDues.length === 0) {
            showAlert('No Due Balances', 'There are currently no customers with outstanding dues and valid phone numbers.', 'info');
            return;
        }

        if (!confirm(`Are you sure you want to send WhatsApp reminders to ${customersWithDues.length} customers with outstanding balances?`)) {
            return;
        }

        setSendingBulk(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:5000/api/whatsapp/send-bulk', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${token}` 
                }
            });

            const data = await res.json();
            if (res.ok) {
                showAlert('Bulk Reminders Completed', data.message || `Sent reminders successfully.`, 'success');
                fetchWhatsAppLogs();
            } else {
                showAlert('Error', data.error || 'Failed to send bulk reminders', 'error');
            }
        } catch (err) {
            showAlert('Error', err.message, 'error');
        } finally {
            setSendingBulk(false);
        }
    };

    const selectedCustomer = customers.find(c => String(c.id) === String(selectedCustomerId));

    return (
        <div className="w-full space-y-3.5 sm:space-y-4 pb-12">
            {/* ALERT NOTIFICATION */}
            {alertState.isOpen && (
                <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between shadow-sm transition-all ${
                    alertState.type === 'success' 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : alertState.type === 'error'
                        ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : 'bg-blue-50 text-blue-800 border-blue-200'
                }`}>
                    <div>
                        <span className="font-bold mr-1.5">{alertState.title}:</span>
                        <span>{alertState.message}</span>
                    </div>
                    <button 
                        onClick={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
                        className="text-gray-400 hover:text-gray-700 font-bold ml-2 cursor-pointer"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* TOP HEADER & RESPONSIVE TABS */}
            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
                <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <IconSettings className="w-5 h-5 text-gray-200" />
                    </div>
                    <div>
                        <h1 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight leading-tight">
                            System, Shop &amp; Hardware Settings
                        </h1>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                            Manage Shop Profile, Silent Thermal/A4 Printers, WhatsApp Reminders &amp; Cloud Sync
                        </p>
                    </div>
                </div>

                {/* RESPONSIVE TABS NAVIGATION */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:items-center gap-1.5 p-1 bg-gray-100 rounded-xl border border-gray-200 text-xs font-bold w-full xl:w-auto">
                    <button
                        type="button"
                        onClick={() => setActiveTab('general')}
                        className={`flex-1 px-3 sm:px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                            activeTab === 'general' 
                                ? 'bg-black text-white shadow-xs' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/70'
                        }`}
                    >
                        <IconUpload className="w-3.5 h-3.5" />
                        <span>Shop &amp; Logo</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('whatsapp')}
                        className={`flex-1 px-3 sm:px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                            activeTab === 'whatsapp' 
                                ? 'bg-emerald-700 text-white shadow-xs' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/70'
                        }`}
                    >
                        <IconWhatsApp className="w-3.5 h-3.5 text-emerald-400" />
                        <span>WhatsApp</span>
                        {whatsappStatus.status === 'connected' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" title="Connected"></span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setActiveTab('printer'); fetchPrinters(); }}
                        className={`flex-1 px-3 sm:px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                            activeTab === 'printer' 
                                ? 'bg-black text-white shadow-xs' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/70'
                        }`}
                    >
                        <IconPrinter className="w-3.5 h-3.5" />
                        <span>Printer &amp; Hardware</span>
                        {settings.silent_print === 'true' && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400" title="Silent Print Active"></span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('system')}
                        className={`flex-1 px-3 sm:px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
                            activeTab === 'system' 
                                ? 'bg-black text-white shadow-xs' 
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200/70'
                        }`}
                    >
                        <IconRefresh className="w-3.5 h-3.5" />
                        <span>Sync &amp; Devices</span>
                    </button>
                </div>
            </div>

            {/* TAB 1: SHOP PROFILE & LOGO BRANDING */}
            {activeTab === 'general' && (
                <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-gray-200 shadow-2xs p-4 sm:p-5 space-y-5">
                    {/* LOGO UPLOAD & PREVIEW SECTION */}
                    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
                        <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                            <div>
                                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                    <IconUpload className="w-3.5 h-3.5 text-gray-600" />
                                    <span>Wholesale Shop Logo</span>
                                </h3>
                                <p className="text-[10.5px] text-gray-500">
                                    Appears on Invoices, Customer Ledgers, Receipts, and Reports
                                </p>
                            </div>
                            {settings.shop_logo && (
                                <button
                                    type="button"
                                    onClick={handleRemoveLogo}
                                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                >
                                    <IconTrash className="w-3 h-3 text-rose-600" />
                                    <span>Remove Logo</span>
                                </button>
                            )}
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            {/* Live Logo Preview Box */}
                            <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 bg-white flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-2xs">
                                {settings.shop_logo ? (
                                    <img 
                                        src={settings.shop_logo} 
                                        alt="Shop Logo Preview" 
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <div className="text-center p-2">
                                        <div className="w-8 h-8 rounded-lg bg-gray-100 mx-auto flex items-center justify-center text-gray-400 font-bold text-xs mb-1">
                                            LOGO
                                        </div>
                                        <span className="text-[9px] text-gray-400 font-semibold block leading-tight">No logo uploaded</span>
                                    </div>
                                )}
                            </div>

                            {/* File Upload Controls */}
                            <div className="flex-1 space-y-2 text-center sm:text-left">
                                <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-800 rounded-lg border border-gray-300 font-bold text-xs cursor-pointer shadow-2xs transition-colors">
                                    <IconUpload className="w-3.5 h-3.5 text-gray-500" />
                                    <span>{settings.shop_logo ? 'Change Logo Image' : 'Choose Logo Image'}</span>
                                    <input 
                                        type="file" 
                                        accept="image/png, image/jpeg, image/jpg, image/svg+xml" 
                                        onChange={handleLogoUpload}
                                        className="hidden" 
                                    />
                                </label>
                                <p className="text-[10px] text-gray-400">
                                    Recommended: PNG or JPG with transparent or white background. Max size: 5MB.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* BUSINESS INFO INPUTS */}
                    <div className="space-y-3 text-xs">
                        <h3 className="font-bold text-gray-900 text-xs border-b border-gray-100 pb-1.5">
                            Shop Profile & Contact Information
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2">
                                <label className="block font-bold text-gray-700 mb-1">Wholesale Shop Name</label>
                                <input
                                    type="text"
                                    required
                                    value={settings.shop_name}
                                    onChange={(e) => setSettings({ ...settings, shop_name: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-bold text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Currency Symbol</label>
                                <input
                                    type="text"
                                    value={settings.currency_symbol}
                                    onChange={(e) => setSettings({ ...settings, currency_symbol: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-bold text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 mb-1">
                                Shop Subtitle / Tagline <span className="text-gray-400 font-normal">(Navbar &amp; Wholesale Invoices)</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Wholesale & Retail Distribution"
                                value={settings.shop_tagline !== undefined ? settings.shop_tagline : ''}
                                onChange={(e) => setSettings({ ...settings, shop_tagline: e.target.value })}
                                className="w-full p-2 border border-gray-300 rounded-lg font-semibold text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 mb-1">Shop Address</label>
                            <input
                                type="text"
                                value={settings.shop_address}
                                onChange={(e) => setSettings({ ...settings, shop_address: e.target.value })}
                                className="w-full p-2 border border-gray-300 rounded-lg font-medium text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Shop Phone / WhatsApp Mobile</label>
                                <input
                                    type="text"
                                    value={settings.shop_phone}
                                    onChange={(e) => setSettings({ ...settings, shop_phone: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-medium text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Shop Email / Gmail Address</label>
                                <input
                                    type="email"
                                    placeholder="e.g. hilalwholesaler@gmail.com"
                                    value={settings.shop_email || ''}
                                    onChange={(e) => setSettings({ ...settings, shop_email: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-medium text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">CNIC / NTN Number</label>
                                <input
                                    type="text"
                                    value={settings.shop_ntn}
                                    onChange={(e) => setSettings({ ...settings, shop_ntn: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-medium text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* BANK ACCOUNTS FOR BILLS & INVOICES */}
                    <div className="space-y-3 pt-3 border-t border-gray-200">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                                <h3 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                                    <IconBank className="w-4 h-4 text-[#B8860B]" />
                                    <span>Bank Accounts for Customer Bills &amp; Invoices</span>
                                </h3>
                                <p className="text-[11px] text-gray-500 mt-0.5">
                                    These bank accounts will be automatically printed on customer A4 wholesale bills, receipts, and invoices for online bank transfers.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleOpenAddBank}
                                className="px-3.5 py-1.5 gold-gradient text-white rounded-lg font-bold text-xs shadow-xs hover:opacity-90 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                            >
                                <IconPlus className="w-3.5 h-3.5" />
                                <span>Add Bank Account</span>
                            </button>
                        </div>

                        {/* Accounts Grid */}
                        {getBankAccounts().length === 0 ? (
                            <div className="p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50/50 text-center space-y-1">
                                <p className="text-xs font-semibold text-gray-600">No bank accounts added yet.</p>
                                <p className="text-[11px] text-gray-400">Click &quot;Add Bank Account&quot; to show your online bank transfer details on customer bills.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                {getBankAccounts().map((acc, idx) => (
                                    <div key={idx} className="p-3 bg-white border border-gray-200 rounded-xl relative space-y-1 shadow-2xs">
                                        <div className="flex items-center justify-between border-b border-gray-100 pb-1">
                                            <span className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-[#B8860B]"></span>
                                                {acc.bank_name}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEditBank(idx)}
                                                    className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-900 cursor-pointer"
                                                    title="Edit Bank Account"
                                                >
                                                    <IconEdit className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteBank(idx)}
                                                    className="p-1 hover:bg-rose-50 rounded text-rose-500 hover:text-rose-700 cursor-pointer"
                                                    title="Delete Bank Account"
                                                >
                                                    <IconTrash className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="text-[11px] text-gray-600 pt-0.5">
                                            <span className="text-gray-400">Title: </span>
                                            <span className="font-semibold text-gray-800">{acc.account_title || '-'}</span>
                                        </div>
                                        <div className="text-[11px] text-gray-600">
                                            <span className="text-gray-400">A/C #: </span>
                                            <span className="font-mono font-bold text-gray-900">{acc.account_number}</span>
                                        </div>
                                        {acc.iban && (
                                            <div className="text-[10px] text-gray-500 truncate" title={acc.iban}>
                                                <span className="text-gray-400">IBAN: </span>
                                                <span className="font-mono">{acc.iban}</span>
                                            </div>
                                        )}
                                        {acc.branch && (
                                            <div className="text-[10px] text-gray-500">
                                                <span className="text-gray-400">Branch: </span>
                                                <span>{acc.branch}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="pt-2 border-t border-gray-100 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-5 py-2 bg-black hover:bg-gray-800 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save General Settings'}
                        </button>
                    </div>
                </form>
            )}

            {/* TAB 2: WHATSAPP & DUES AUTOMATION */}
            {activeTab === 'whatsapp' && (
                <div className="space-y-4">
                    {/* SECTION 1: LIVE WHATSAPP CONNECTION STATUS & QR CODE */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-4 sm:p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                    <IconWhatsApp className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-2">
                                        <span>WhatsApp Connection</span>
                                        {whatsappStatus.status === 'connected' ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                                                Connected
                                            </span>
                                        ) : whatsappStatus.status === 'connecting' ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                                Scan QR Code
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200">
                                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                                                Disconnected
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-[10.5px] text-gray-500">
                                        Connect your phone WhatsApp to send automatic & manual dues reminders and PDF statements
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {whatsappStatus.status === 'connected' ? (
                                    <button
                                        type="button"
                                        onClick={handleLogoutWhatsApp}
                                        disabled={waLoading}
                                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                    >
                                        Disconnect
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={handleConnectWhatsApp}
                                        disabled={waLoading}
                                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5"
                                    >
                                        <IconRefresh className={`w-3.5 h-3.5 ${waLoading ? 'animate-spin' : ''}`} />
                                        <span>{whatsappStatus.qr ? 'Generate New QR' : 'Connect WhatsApp'}</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* QR CODE DISPLAY WHEN CONNECTING */}
                        {whatsappStatus.status !== 'connected' && (
                            <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-4 flex flex-col md:flex-row items-center gap-6">
                                {whatsappStatus.qr ? (
                                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm shrink-0">
                                        <QRCodeSVG value={whatsappStatus.qr} size={180} />
                                    </div>
                                ) : (
                                    <div className="w-44 h-44 rounded-xl border-2 border-dashed border-emerald-300 bg-white flex flex-col items-center justify-center p-3 text-center shrink-0">
                                        <IconWhatsApp className="w-8 h-8 text-emerald-500 mb-1 animate-pulse" />
                                        <span className="text-[11px] font-bold text-gray-700">QR Code Waiting</span>
                                        <button
                                            type="button"
                                            onClick={handleConnectWhatsApp}
                                            className="mt-2 px-2.5 py-1 bg-emerald-700 text-white rounded text-[10px] font-bold hover:bg-emerald-800"
                                        >
                                            Start Session
                                        </button>
                                    </div>
                                )}

                                <div className="space-y-2 text-xs">
                                    <h4 className="font-bold text-gray-900">How to link your WhatsApp:</h4>
                                    <ol className="list-decimal list-inside space-y-1 text-gray-600 text-[11px] leading-relaxed">
                                        <li>Open <strong>WhatsApp</strong> on your mobile device.</li>
                                        <li>Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong> and select <strong>Linked Devices</strong>.</li>
                                        <li>Tap <strong>Link a Device</strong> and point your camera at the QR code on the left.</li>
                                        <li>Once connected, dues reminders and PDF invoices can be sent directly from your number!</li>
                                    </ol>
                                    <div className="pt-1">
                                        <span className="text-[10px] text-gray-400">
                                            Session files are stored securely on this computer. No third-party servers see your messages.
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* SECTION 2: DISPATCH REMINDER & PDF STATEMENT TO SPECIFIC CUSTOMER */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-4 sm:p-5 space-y-4">
                        <div className="border-b border-gray-100 pb-2">
                            <h3 className="text-xs sm:text-sm font-bold text-gray-900 flex items-center gap-2">
                                <IconWhatsApp className="w-4 h-4 text-emerald-600" />
                                <span>Send Dues Reminder & PDF Statement to Customer</span>
                            </h3>
                            <p className="text-[10.5px] text-gray-500">
                                Select any customer with due balance to instantly send an Urdu/English reminder or formal PDF statement
                            </p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Select Customer</label>
                                <select
                                    value={selectedCustomerId}
                                    onChange={(e) => {
                                        setSelectedCustomerId(e.target.value);
                                        const c = customers.find(item => String(item.id) === e.target.value);
                                        if (c) {
                                            const defMsg = settings.wa_reminder_template
                                                .replace(/{customer_name}/g, c.name)
                                                .replace(/{amount}/g, Math.round(c.balance || 0).toLocaleString())
                                                .replace(/{shop_name}/g, settings.shop_name);
                                            setCustomWaMessage(defMsg);
                                        }
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-gray-900 outline-none"
                                >
                                    <option value="">-- Choose Customer --</option>
                                    {customers.map((c, idx) => {
                                        const due = parseFloat(c.balance) || 0;
                                        return (
                                            <option key={`set-cust-${c.id ?? idx}-${idx}`} value={c.id}>
                                                {c.name} {c.phone ? `(${c.phone})` : '(No Phone)'} — Dues: Rs. {Math.round(due).toLocaleString()}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {selectedCustomer && (
                                <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 flex items-center justify-between text-xs">
                                    <div>
                                        <div className="font-bold text-gray-900">{selectedCustomer.name}</div>
                                        <div className="text-gray-500 text-[11px]">Phone: {selectedCustomer.phone || 'None'}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400 uppercase font-bold">Outstanding Dues</div>
                                        <div className="text-sm font-extrabold text-rose-700 font-mono">
                                            Rs. {Math.round(selectedCustomer.balance || 0).toLocaleString()}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block font-bold text-gray-700 text-xs mb-1">
                                WhatsApp Message Text / Statement Caption
                            </label>
                            <textarea
                                rows={3}
                                value={customWaMessage}
                                onChange={(e) => setCustomWaMessage(e.target.value)}
                                placeholder="Message will be auto-generated from template if left blank..."
                                className="w-full p-2.5 border border-gray-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-gray-900 outline-none"
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={handleSendCustomerReminder}
                                disabled={sendingReminder || !selectedCustomerId || whatsappStatus.status !== 'connected'}
                                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <IconWhatsApp className="w-3.5 h-3.5 text-white" />
                                <span>{sendingReminder ? 'Sending Text...' : 'Send WhatsApp Reminder (Text)'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleSendCustomerPdf}
                                disabled={sendingPdf || !selectedCustomerId || whatsappStatus.status !== 'connected'}
                                className="px-3.5 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <IconPrinter className="w-3.5 h-3.5 text-gray-300" />
                                <span>{sendingPdf ? 'Generating & Sending PDF...' : 'Send Customer Dues PDF Statement'}</span>
                            </button>

                            {whatsappStatus.status !== 'connected' && (
                                <span className="text-[10.5px] text-amber-700 font-bold ml-2 inline-flex items-center gap-1">
                                    <IconWarning className="w-3.5 h-3.5 text-amber-600 inline shrink-0" />
                                    <span>Please connect WhatsApp above to enable sending</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* SECTION 3: AUTOMATED DAILY REMINDERS CONFIGURATION */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-4 sm:p-5 space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                            <div>
                                <h3 className="text-xs sm:text-sm font-bold text-gray-900">
                                    Automated Daily Dues Reminder Scheduler
                                </h3>
                                <p className="text-[10.5px] text-gray-500">
                                    Automatically dispatch dues reminders to all customers with unpaid balances at your preferred time
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleSendBulkReminders}
                                disabled={sendingBulk || whatsappStatus.status !== 'connected'}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-gray-200 disabled:opacity-50"
                            >
                                {sendingBulk ? 'Sending All...' : 'Run All Due Reminders Now'}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Enable Auto Reminders</label>
                                <select
                                    value={settings.wa_reminder_enabled}
                                    onChange={(e) => setSettings({ ...settings, wa_reminder_enabled: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-bold"
                                >
                                    <option value="true">Enabled (Daily Auto Send)</option>
                                    <option value="false">Disabled (Manual Only)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Daily Send Time</label>
                                <input
                                    type="text"
                                    value={settings.wa_reminder_time}
                                    onChange={(e) => setSettings({ ...settings, wa_reminder_time: e.target.value })}
                                    placeholder="10:00 AM or 18:00"
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-bold"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Send Frequency</label>
                                <select
                                    value={settings.wa_reminder_frequency}
                                    onChange={(e) => setSettings({ ...settings, wa_reminder_frequency: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg text-xs font-semibold"
                                >
                                    <option value="1">Daily (Every 24 Hours)</option>
                                    <option value="3">Every 3 Days</option>
                                    <option value="7">Weekly (Every 7 Days)</option>
                                    <option value="15">Bi-Weekly (Every 15 Days)</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block font-bold text-gray-700 text-xs">
                                    Reminder Message Template
                                </label>
                                <div className="text-[10px] text-gray-400">
                                    Variables: <code className="text-gray-800">{'{customer_name}'}</code>, <code className="text-gray-800">{'{amount}'}</code>, <code className="text-gray-800">{'{shop_name}'}</code>
                                </div>
                            </div>
                            <textarea
                                rows={4}
                                value={settings.wa_reminder_template}
                                onChange={(e) => setSettings({ ...settings, wa_reminder_template: e.target.value })}
                                className="w-full p-2.5 border border-gray-300 rounded-lg text-xs font-mono focus:ring-1 focus:ring-gray-900 outline-none"
                            />
                        </div>

                        <div className="flex justify-end pt-1">
                            <button
                                type="button"
                                onClick={handleSaveSettings}
                                disabled={saving}
                                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save WhatsApp Settings'}
                            </button>
                        </div>
                    </div>

                    {/* SECTION 4: RECENT WHATSAPP REMINDER AUDIT LOG */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-2xs p-4 sm:p-5 space-y-3">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                            <h3 className="text-xs sm:text-sm font-bold text-gray-900">
                                Recent WhatsApp Activity Log
                            </h3>
                            <button
                                type="button"
                                onClick={fetchWhatsAppLogs}
                                className="text-[11px] font-bold text-gray-500 hover:text-gray-900 flex items-center gap-1"
                            >
                                <IconRefresh className="w-3 h-3" />
                                <span>Refresh</span>
                            </button>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[9.5px]">
                                        <th className="py-2 px-2.5">Customer</th>
                                        <th className="py-2 px-2.5">Phone</th>
                                        <th className="py-2 px-2.5 text-right">Dues Amount</th>
                                        <th className="py-2 px-2.5 text-center">Type</th>
                                        <th className="py-2 px-2.5 text-center">Status</th>
                                        <th className="py-2 px-2.5 text-right">Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-[11px]">
                                    {waLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-6 text-center text-gray-400">
                                                No WhatsApp reminders logged yet
                                            </td>
                                        </tr>
                                    ) : (
                                        waLogs.slice(0, 15).map((log) => (
                                            <tr key={log.id} className="hover:bg-gray-50/60">
                                                <td className="py-2 px-2.5 font-bold text-gray-900">
                                                    {log.customer_name || 'Customer'}
                                                </td>
                                                <td className="py-2 px-2.5 font-mono text-gray-600">
                                                    {log.phone}
                                                </td>
                                                <td className="py-2 px-2.5 text-right font-mono font-bold text-rose-700">
                                                    Rs. {Math.round(log.amount || 0).toLocaleString()}
                                                </td>
                                                <td className="py-2 px-2.5 text-center">
                                                    {log.has_pdf ? (
                                                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-bold">
                                                            PDF Statement
                                                        </span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[9px] font-semibold">
                                                            Text Reminder
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-2.5 text-center">
                                                    {log.status === 'sent' ? (
                                                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px]">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                                                            Sent
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-rose-700 font-bold text-[10px]">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                                                            Failed
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-2.5 text-right text-gray-400 text-[10px] font-mono">
                                                    {log.sent_at}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: SYSTEM & DESKTOP SYNC OPTIONS */}
            {activeTab === 'system' && (
                <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-gray-200 shadow-2xs p-4 sm:p-5 space-y-5">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center shadow-xs">
                                <IconSync className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-gray-900 text-sm">Cloud Synchronization & Hardware Station</h3>
                                <p className="text-[11px] text-gray-500">
                                    Control automatic cloud synchronization, custom interval schedules, and device settings
                                </p>
                            </div>
                        </div>

                        {/* Status badge */}
                        <div className="flex items-center gap-2">
                            {settings.auto_sync_enabled !== 'false' ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span>Auto-Sync Active ({formatMinutesToReadable(settings.sync_interval_minutes || 3)})</span>
                                </div>
                            ) : (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px] font-bold">
                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                    <span>Auto-Sync Stopped / Manual Only</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* MAIN SYNC CONTROLS */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* CARD 1: AUTO SYNC TOGGLE & CUSTOM INTERVAL */}
                        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-4 md:col-span-2">
                            {/* Toggle Header */}
                            <div className="flex items-center justify-between gap-4">
                                <div className="space-y-0.5">
                                    <label className="text-xs font-extrabold text-gray-900 flex items-center gap-2">
                                        <span>Background Auto-Sync Engine</span>
                                        {settings.auto_sync_enabled !== 'false' ? (
                                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                                                Active (ON)
                                            </span>
                                        ) : (
                                            <span className="text-[10px] bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-bold">
                                                Stopped (OFF)
                                            </span>
                                        )}
                                    </label>
                                    <p className="text-[11px] text-gray-500">
                                        Turn ON or OFF automatic background syncing. When OFF, the app will never sync automatically until you click Sync.
                                    </p>
                                </div>

                                {/* Modern Sliding Toggle Button */}
                                <button
                                    type="button"
                                    onClick={() => setSettings(prev => ({ 
                                        ...prev, 
                                        auto_sync_enabled: prev.auto_sync_enabled === 'false' ? 'true' : 'false' 
                                    }))}
                                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner ${
                                        settings.auto_sync_enabled !== 'false' ? 'bg-emerald-600' : 'bg-gray-300'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                            settings.auto_sync_enabled !== 'false' ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            </div>

                            {/* CUSTOM TIME INTERVAL SETTINGS */}
                            <div className={`pt-3 border-t border-gray-200 space-y-3 transition-opacity ${
                                settings.auto_sync_enabled === 'false' ? 'opacity-40 pointer-events-none' : 'opacity-100'
                            }`}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-800">
                                            Sync Frequency / Custom Interval Time
                                        </label>
                                        <p className="text-[11px] text-gray-500">
                                            Select a quick preset (e.g. every 3 mins, 1 hour) or type any custom duration in minutes.
                                        </p>
                                    </div>
                                    <div className="text-xs font-bold text-gray-900 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-2xs">
                                        Scheduled: <span className="text-emerald-700 font-extrabold">{formatMinutesToReadable(settings.sync_interval_minutes || 3)}</span>
                                    </div>
                                </div>

                                {/* Quick Presets */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Presets:</span>
                                    {[
                                        { label: '3 Mins', value: '3' },
                                        { label: '5 Mins', value: '5' },
                                        { label: '15 Mins', value: '15' },
                                        { label: '30 Mins', value: '30' },
                                        { label: '1 Hour', value: '60' },
                                        { label: '2 Hours', value: '120' }
                                    ].map(preset => {
                                        const isSelected = String(settings.sync_interval_minutes || '3') === preset.value;
                                        return (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                onClick={() => setSettings(prev => ({ ...prev, sync_interval_minutes: preset.value }))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                                                    isSelected
                                                        ? 'bg-black text-white border-black shadow-xs'
                                                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom Numerical Input Box */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                                            Custom Time in Minutes (e.g. 3, 45, 60, 120)
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="1"
                                                max="1440"
                                                step="1"
                                                value={settings.sync_interval_minutes || 3}
                                                onChange={(e) => {
                                                    const val = Math.max(1, parseInt(e.target.value) || 1);
                                                    setSettings({ ...settings, sync_interval_minutes: String(val) });
                                                }}
                                                className="w-full p-2 border border-gray-300 rounded-lg text-xs font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                                                placeholder="e.g. 3, 15, 60"
                                            />
                                            <span className="absolute right-3 top-2 text-xs font-semibold text-gray-400">
                                                minutes
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-700 mb-1">
                                            Hour Shortcuts
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setSettings(prev => ({ ...prev, sync_interval_minutes: '60' }))}
                                                className={`flex-1 py-2 px-2.5 border rounded-lg text-[11px] font-bold transition-colors ${
                                                    String(settings.sync_interval_minutes) === '60'
                                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                                                }`}
                                            >
                                                1 Hour (60m)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSettings(prev => ({ ...prev, sync_interval_minutes: '120' }))}
                                                className={`flex-1 py-2 px-2.5 border rounded-lg text-[11px] font-bold transition-colors ${
                                                    String(settings.sync_interval_minutes) === '120'
                                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                                                }`}
                                            >
                                                2 Hours (120m)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* CARD 2: DEVICE CREDENTIALS & URL */}
                        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
                            <h4 className="font-bold text-xs text-gray-900 border-b border-gray-200 pb-1.5">
                                Station Credentials & Server Target
                            </h4>

                            <div>
                                <label className="block font-bold text-gray-700 text-xs mb-1">Device Identification ID</label>
                                <input
                                    type="text"
                                    value={settings.device_id}
                                    onChange={(e) => setSettings({ ...settings, device_id: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-mono font-bold text-xs bg-white"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Unique cashier / counter workstation ID.</p>
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 text-xs mb-1">Production Cloud Server URL</label>
                                <input
                                    type="text"
                                    value={settings.server_url}
                                    onChange={(e) => setSettings({ ...settings, server_url: e.target.value })}
                                    placeholder="https://hilal-app-three.vercel.app"
                                    className="w-full p-2 border border-gray-300 rounded-lg font-mono font-medium text-xs bg-white"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">Defaults to https://hilal-app-three.vercel.app</p>
                            </div>
                        </div>

                        {/* CARD 3: MANUAL SYNC DISPATCH */}
                        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3 flex flex-col justify-between">
                            <div>
                                <h4 className="font-bold text-xs text-gray-900 border-b border-gray-200 pb-1.5">
                                    Instant Manual Sync Test
                                </h4>
                                <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                                    Trigger an immediate pull and push cycle right now without waiting for the scheduled background timer.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handleTriggerSync}
                                disabled={isSyncing}
                                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <IconSync className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                                <span>{isSyncing ? 'Synchronizing Cloud Now...' : 'Run Immediate Sync Now'}</span>
                            </button>
                        </div>
                    </div>

                    {/* SAVE BUTTON */}
                    <div className="pt-2 border-t border-gray-100 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-6 py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer shadow-2xs disabled:opacity-50 flex items-center gap-2"
                        >
                            <IconCheck className="w-4 h-4" />
                            <span>{saving ? 'Saving System Settings...' : 'Save Sync & Device Settings'}</span>
                        </button>
                    </div>
                </form>
            )}

            {/* TAB 4: PRINTER & HARDWARE SETTINGS */}
            {activeTab === 'printer' && (
                <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-gray-200 shadow-2xs p-4 sm:p-5 space-y-5">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center shadow-xs">
                                <IconPrinter className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h3 className="font-extrabold text-gray-900 text-sm">Printer & Silent Print Configuration</h3>
                                <p className="text-[11px] text-gray-500">
                                    Configure hardware receipt & bill printers, silent direct printing, and auto-print on checkout
                                </p>
                            </div>
                        </div>

                        {/* Environment Diagnostic Status Badge */}
                        <div className="flex items-center gap-2">
                            {isElectronRenderer() ? (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    <span>Desktop Printing Engine Active</span>
                                </div>
                            ) : (
                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px] font-bold">
                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                    <span>Web Browser Mode (OS Dialog)</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* PRINTER SETTINGS GRID */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* CARD 1: TARGET THERMAL PRINTER SELECTION */}
                        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3.5">
                            <div className="flex items-center justify-between">
                                <label className="block font-bold text-xs text-gray-900">
                                    Target 80mm Thermal Printer (Receipts)
                                </label>
                                <button
                                    type="button"
                                    onClick={fetchPrinters}
                                    disabled={detectingPrinters}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                    title="Refresh printer list from Windows"
                                >
                                    <IconRefresh className={`w-3 h-3 ${detectingPrinters ? 'animate-spin' : ''}`} />
                                    <span>{detectingPrinters ? 'Detecting...' : 'Refresh Printers'}</span>
                                </button>
                            </div>

                            <select
                                value={settings.selected_printer || ''}
                                onChange={(e) => setSettings({ ...settings, selected_printer: e.target.value })}
                                className="w-full p-2.5 border border-gray-300 rounded-lg font-bold text-xs bg-white text-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                            >
                                <option value="">Auto-Detect Thermal Printer (e.g. POS-80)</option>
                                <option value="os_dialog">Always Show Windows Print Dialog (Prompt Every Time)</option>
                                {printers && printers.length > 0 && (
                                    <optgroup label="Installed Printers on this Machine">
                                        {printers.map((p, idx) => (
                                            <option key={idx} value={p.name}>
                                                {p.name} {p.isDefault ? '— (Default)' : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>

                            <div className="text-[11px] text-gray-500 flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                    {printers.length > 0 ? (
                                        <>
                                            <IconCheck className="w-3.5 h-3.5 text-emerald-600 inline shrink-0" />
                                            <span>Found {printers.length} installed printer(s) on Windows</span>
                                        </>
                                    ) : (
                                        'No printers detected. System default will be targeted.'
                                    )}
                                </span>
                                {settings.selected_printer && (
                                    <span className="font-mono font-bold text-gray-700 bg-gray-200/60 px-1.5 py-0.5 rounded text-[10px]">
                                        Selected: {settings.selected_printer}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* CARD 2: TARGET A4 PRINTER (INVOICES & WHOLESALE BILLS) */}
                        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3.5">
                            <label className="block font-bold text-xs text-gray-900">
                                Target A4 Printer (Wholesale Invoices & Bills)
                            </label>

                            <select
                                value={settings.selected_a4_printer || ''}
                                onChange={(e) => setSettings({ ...settings, selected_a4_printer: e.target.value })}
                                className="w-full p-2.5 border border-gray-300 rounded-lg font-bold text-xs bg-white text-gray-900 focus:ring-1 focus:ring-gray-900 outline-none"
                            >
                                <option value="">Auto-Format for 80mm Thermal (POS-80) / Safe Default</option>
                                <option value="os_dialog">Always Show Windows Print Dialog (Prompt Every Time)</option>
                                {printers && printers.length > 0 && (
                                    <optgroup label="Installed Printers on this Machine">
                                        {printers.map((p, idx) => (
                                            <option key={idx} value={p.name}>
                                                {p.name} {p.isDefault ? '— (Default)' : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>

                            <div className="text-[11px] text-gray-500">
                                {settings.selected_a4_printer ? (
                                    <span className="font-mono font-bold text-gray-700 bg-gray-200/60 px-1.5 py-0.5 rounded text-[10px]">
                                        A4 Target: {settings.selected_a4_printer}
                                    </span>
                                ) : (
                                    'When no separate A4 printer is configured, bills automatically format for your 80mm thermal printer without feeding empty paper.'
                                )}
                            </div>
                        </div>

                        {/* CARD 3: DEFAULT POS CHECKOUT FORMAT */}
                        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3.5">
                            <label className="block font-bold text-xs text-gray-900">
                                Default Checkout Document Format
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                                <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                    (settings.default_print_format || 'thermal') === 'thermal'
                                        ? 'bg-black text-white border-black shadow-xs'
                                        : 'bg-white text-gray-800 border-gray-200 hover:border-gray-300'
                                }`}>
                                    <input
                                        type="radio"
                                        name="default_print_format"
                                        value="thermal"
                                        checked={(settings.default_print_format || 'thermal') === 'thermal'}
                                        onChange={() => setSettings({ ...settings, default_print_format: 'thermal' })}
                                        className="sr-only"
                                    />
                                    <div>
                                        <div className="font-bold text-xs">80mm Thermal Slip</div>
                                        <div className={`text-[10px] ${(settings.default_print_format || 'thermal') === 'thermal' ? 'text-gray-300' : 'text-gray-500'}`}>
                                            Supports Direct Silent Print
                                        </div>
                                    </div>
                                </label>

                                <label className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                    settings.default_print_format === 'a4'
                                        ? 'bg-black text-white border-black shadow-xs'
                                        : 'bg-white text-gray-800 border-gray-200 hover:border-gray-300'
                                }`}>
                                    <input
                                        type="radio"
                                        name="default_print_format"
                                        value="a4"
                                        checked={settings.default_print_format === 'a4'}
                                        onChange={() => setSettings({ ...settings, default_print_format: 'a4' })}
                                        className="sr-only"
                                    />
                                    <div>
                                        <div className="font-bold text-xs">A4 Wholesale Bill</div>
                                        <div className={`text-[10px] ${settings.default_print_format === 'a4' ? 'text-gray-300' : 'text-gray-500'}`}>
                                            Supports Direct Silent Print & Dialog
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* TOGGLES SECTION */}
                    <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 bg-white">
                        {/* TOGGLE 1: THERMAL SILENT PRINT MODE */}
                        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-gray-900">
                                        Thermal Silent Print Mode (80mm Receipts Only)
                                    </span>
                                    {settings.silent_print === 'true' && (
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded">
                                            ACTIVE
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11.5px] text-gray-500 max-w-xl">
                                    When enabled, clicking &quot;Print 80mm Slip&quot; sends the thermal receipt directly to your selected thermal printer in the background without opening the Windows print dialog. (Does not apply to A4 bills).
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setSettings(prev => ({ 
                                    ...prev, 
                                    silent_print: prev.silent_print === 'true' ? 'false' : 'true' 
                                }))}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    settings.silent_print === 'true' ? 'bg-emerald-600' : 'bg-gray-300'
                                }`}
                                role="switch"
                                aria-checked={settings.silent_print === 'true'}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        settings.silent_print === 'true' ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>

                        {/* TOGGLE 2: AUTO-PRINT ON SALE COMPLETION */}
                        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-gray-900">
                                        Auto-Print Thermal Receipt on POS Checkout
                                    </span>
                                    {settings.auto_print_sale === 'true' && (
                                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded">
                                            AUTO ON
                                        </span>
                                    )}
                                </div>
                                <p className="text-[11.5px] text-gray-500 max-w-xl">
                                    Automatically dispatch the 80mm thermal receipt to your thermal printer immediately after the cashier finishes a sale checkout.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setSettings(prev => ({ 
                                    ...prev, 
                                    auto_print_sale: prev.auto_print_sale === 'true' ? 'false' : 'true' 
                                }))}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    settings.auto_print_sale === 'true' ? 'bg-emerald-600' : 'bg-gray-300'
                                }`}
                                role="switch"
                                aria-checked={settings.auto_print_sale === 'true'}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        settings.auto_print_sale === 'true' ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={handleTestPrint}
                            disabled={testPrinting}
                            className="w-full sm:w-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-bold text-xs transition-colors cursor-pointer border border-gray-300 flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                        >
                            <IconPrinter className="w-3.5 h-3.5 text-gray-700" />
                            <span>{testPrinting ? 'Dispatching Test...' : 'Test Thermal Slip Print'}</span>
                        </button>

                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full sm:w-auto px-5 py-2 bg-black hover:bg-gray-800 text-white rounded-lg font-bold text-xs transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                        >
                            {saving ? 'Saving...' : 'Save Printer Settings'}
                        </button>
                    </div>
                </form>
            )}
            {/* MODAL: ADD / EDIT BANK ACCOUNT */}
            {bankModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg gold-gradient text-white flex items-center justify-center font-bold">
                                    <IconBank className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm">
                                        {editingBankIndex !== null ? 'Edit Bank Account' : 'Add New Bank Account'}
                                    </h3>
                                    <p className="text-[11px] text-gray-500">Printed on customer bills for online payments</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setBankModalOpen(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                            >
                                <IconClose className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveBank} className="space-y-3 text-xs">
                            {/* Popular bank quick-pick buttons */}
                            <div>
                                <label className="block font-bold text-gray-700 mb-1.5">Quick Select Bank</label>
                                <div className="flex flex-wrap gap-1">
                                    {['Meezan Bank', 'HBL', 'Bank Alfalah', 'MCB Bank', 'Allied Bank', 'UBL', 'JazzCash', 'Easypaisa'].map((bName) => (
                                        <button
                                            key={bName}
                                            type="button"
                                            onClick={() => setBankForm({ ...bankForm, bank_name: bName })}
                                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                                                bankForm.bank_name === bName
                                                    ? 'bg-[#B8860B] text-white border-[#B8860B]'
                                                    : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                                            }`}
                                        >
                                            {bName}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Bank Name *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Meezan Bank / HBL / JazzCash"
                                    value={bankForm.bank_name}
                                    onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-semibold text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Account Title *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. Hilal Wholesaler Shop / Muhammad Hilal"
                                    value={bankForm.account_title}
                                    onChange={(e) => setBankForm({ ...bankForm, account_title: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-medium text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Account Number *</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. 0101-0102030405"
                                    value={bankForm.account_number}
                                    onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-mono font-bold text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">IBAN Number (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. PK00MEZN0001010102030405"
                                    value={bankForm.iban}
                                    onChange={(e) => setBankForm({ ...bankForm, iban: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-mono text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-bold text-gray-700 mb-1">Branch Details (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Main Bazar Timergara Branch"
                                    value={bankForm.branch}
                                    onChange={(e) => setBankForm({ ...bankForm, branch: e.target.value })}
                                    className="w-full p-2 border border-gray-300 rounded-lg font-medium text-xs focus:ring-1 focus:ring-gray-900 outline-none"
                                />
                            </div>

                            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setBankModalOpen(false)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg font-bold text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-1.5 gold-gradient text-white rounded-lg font-bold text-xs shadow-xs hover:opacity-90 transition-all cursor-pointer"
                                >
                                    {editingBankIndex !== null ? 'Update Account' : 'Add Account'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
