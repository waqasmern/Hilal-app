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
            bgIcon: 'bg-amber-50 border-amber-200 text-amber-600',
            borderColor: 'border-amber-200',
            buttonClass: 'bg-amber-600 hover:bg-amber-700 text-white',
            defaultTitle: 'Attention',
            icon: <IconWarning className="w-6 h-6 text-amber-600" />
        },
        confirm: {
            bgIcon: 'bg-blue-50 border-blue-200 text-[#0B3B7B]',
            borderColor: 'border-blue-200',
            buttonClass: 'bg-[#0B3B7B] hover:bg-[#072B5C] text-white',
            defaultTitle: 'Please Confirm',
            icon: <IconWarning className="w-6 h-6 text-[#0B3B7B]" />
        },
        info: {
            bgIcon: 'bg-blue-50 border-blue-200 text-[#0B3B7B]',
            borderColor: 'border-blue-200',
            buttonClass: 'bg-[#0B3B7B] hover:bg-[#072B5C] text-white',
            defaultTitle: 'Notification',
            icon: <IconWarning className="w-6 h-6 text-[#0B3B7B]" />
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
                            className="px-4 py-2 text-xs font-bold rounded-xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all cursor-pointer"
                        >
                            {cancelText}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className={`px-5 py-2.5 text-xs font-bold rounded-xl shadow-md transition-all hover:opacity-90 active:scale-95 cursor-pointer ${
                            type === 'error' ? 'bg-rose-600 text-white' :
                            type === 'warning' ? 'bg-amber-600 text-white' :
                            type === 'success' ? 'bg-emerald-600 text-white' :
                            'bg-[#0B3B7B] hover:bg-[#072B5C] text-white'
                        }`}
                    >
                        <span>{confirmText}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
