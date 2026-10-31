'use client';
import React from 'react';
import { IconCheck, IconWarning, IconClose } from './Icons';

/**
 * Custom non-blocking modal alert to replace native window.alert() and window.confirm().
 * Native alerts freeze the UI thread in Electron / Chromium.
 */
export default function CustomModalAlert({
    isOpen,
    onClose,
    type = 'info', // 'success' | 'error' | 'warning' | 'info' | 'confirm'
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Cancel',
    onConfirm
}) {
    if (!isOpen) return null;

    const isConfirm = type === 'confirm' || !!onConfirm;

    const typeConfig = {
        success: {
            bgIcon: 'bg-emerald-50 border-emerald-200 text-emerald-600',
            borderColor: 'border-emerald-200',
            buttonClass: 'bg-emerald-700 hover:bg-emerald-800 text-white',
            defaultTitle: 'Success',
            icon: <IconCheck className="w-6 h-6 text-emerald-600" />
        },
        error: {
            bgIcon: 'bg-rose-50 border-rose-200 text-rose-600',
            borderColor: 'border-rose-200',
            buttonClass: 'bg-rose-600 hover:bg-rose-700 text-white',
            defaultTitle: 'Error Notice',
            icon: <IconClose className="w-6 h-6 text-rose-600" />
        },
        warning: {
            bgIcon: 'bg-amber-50 border-[#F3E5AB] text-[#B8860B]',
            borderColor: 'border-[#F3E5AB]',
            buttonClass: 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white',
            defaultTitle: 'Attention',
            icon: <IconWarning className="w-6 h-6 text-[#B8860B]" />
        },
        confirm: {
            bgIcon: 'bg-amber-50 border-[#F3E5AB] text-[#B8860B]',
            borderColor: 'border-[#F3E5AB]',
            buttonClass: 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white',
            defaultTitle: 'Please Confirm',
            icon: <IconWarning className="w-6 h-6 text-[#B8860B]" />
        },
        info: {
            bgIcon: 'bg-yellow-50 border-yellow-200 text-[#B8860B]',
            borderColor: 'border-yellow-200',
            buttonClass: 'bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white',
            defaultTitle: 'Notification',
            icon: <IconWarning className="w-6 h-6 text-[#B8860B]" />
        }
    };

    const currentConfig = typeConfig[type] || typeConfig.info;

    const handleConfirm = () => {
        if (onConfirm) onConfirm();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[120] p-4">
            <div 
                className={`bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl border ${currentConfig.borderColor} transform transition-all animate-in fade-in zoom-in-95 duration-150`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${currentConfig.bgIcon}`}>
                        {currentConfig.icon}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                        <h4 className="text-base font-extrabold text-gray-900 leading-tight">
                            {title || currentConfig.defaultTitle}
                        </h4>
                        <div className="text-xs text-gray-600 mt-1.5 whitespace-pre-line leading-relaxed font-medium">
                            {message}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer shrink-0"
                    >
                        <IconClose className="w-4 h-4" />
                    </button>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-2">
                    {isConfirm && (
                        <button
                            type="button"
                            onClick={onClose}
                            style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #e5e7eb' }}
                            className="px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer hover:bg-gray-100"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleConfirm}
                        style={{ backgroundColor: '#000000', color: '#ffffff', border: '1px solid #000000' }}
                        className="btn-black !bg-black !text-white px-5 py-2.5 text-xs font-bold rounded-xl shadow-md transition-all hover:opacity-90 active:scale-95 cursor-pointer"
                    >
                        <span style={{ color: '#ffffff' }}>{confirmText}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
