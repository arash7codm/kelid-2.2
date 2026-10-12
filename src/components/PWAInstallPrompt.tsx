import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
        <span>برنامه روی گوشی نصب شده است</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => {
          if (isInstallable) {
            install();
          } else if (isIOS) {
            setShowIOSGuide(true);
          } else {
            alert('برای نصب کلید روی گوشی، از منوی سه نقطه مرورگر کروم گزینه «نصب برنامه» یا «Add to Home screen» را انتخاب کنید.');
          }
        }}
        className={className || "px-3 py-2 rounded-xl bg-gradient-to-r from-[#d4b06a] to-[#f1cb83] text-[#070d1a] font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(241,203,131,0.35)] active:scale-95 transition-all cursor-pointer"}
        type="button"
      >
        <span className="material-symbols-outlined text-[18px]">install_mobile</span>
        <span>نصب برنامه روی گوشی (PWA)</span>
      </button>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-2xl glass-panel p-5 border border-[#f1cb83]/30 text-right space-y-3">
            <h3 className="font-bold text-sm text-[#f1cb83]">راهنمای نصب روی آیفون و آیپد (iOS)</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              ۱. در نوار پایین مرورگر سافاری دکمه‌ی <strong>Share (اشتراک‌گذاری)</strong> را لمس کنید.<br />
              ۲. اسکرول کرده و گزینه‌ی <strong>Add to Home Screen (افزودن به صفحه اصلی)</strong> را انتخاب نمایید.
            </p>
            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 rounded-xl bg-[#f1cb83] text-[#070d1a] font-bold text-xs mt-2"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const PWAInstallPrompt = PWAInstallButton;
