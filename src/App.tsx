import React, { useState, useEffect, useMemo } from 'react';
import { db, getSetting, setSetting, preloadAllBlobs } from './db';
import { Property, Applicant, Collaborator, ReminderTask } from './types';
import { AtmosphericBackground } from './components/AtmosphericBackground';
import { TopAppHeader } from './components/TopAppHeader';
import { BottomNavigationBar, MainTabType } from './components/BottomNavigationBar';
import { QuickActionSheet } from './components/QuickActionSheet';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { GlobalMapChooserHost } from './components/MapAppChooserModal';
import { KelarabadSettingsPanel } from './components/KelarabadSettingsPanel';
import {
  loadTarhHadiConfig,
  saveTarhHadiConfig,
  getDefaultTarhHadiConfig,
  getTarhHadiConfigSync,
  subscribeTarhHadiConfig,
  TarhHadiCalibrationConfig,
} from './services/kelarabadTarhHadi';

// Views
import { DashboardView } from './views/DashboardView';
import { PropertyListView } from './views/PropertyListView';
import { PropertyDetailView } from './views/PropertyDetailView';
import { PropertyFormView } from './views/PropertyFormView';
import { ApplicantListView } from './views/ApplicantListView';
import { ApplicantFormView } from './views/ApplicantFormView';
import { CollaboratorListView } from './views/CollaboratorListView';
import { CollaboratorFormView } from './views/CollaboratorFormView';
import { FollowUpInboxView } from './views/FollowUpInboxView';
import { CalendarView } from './views/CalendarView';
import { VoiceReminderView } from './views/VoiceReminderView';
import { MapView } from './views/MapView';

// Services
import { computeSyncStatus, triggerBackup, performRefresh, exportAppJson, importAppJson, SyncStatusInfo } from './services/sync';
import {
  DEFAULT_GEMINI_MODEL,
  getStoredGeminiApiKey,
  saveStoredGeminiApiKey,
  deleteStoredGeminiApiKey,
  getStoredGeminiModel,
  saveStoredGeminiModel,
  testGeminiApiKey,
} from './services/ai';
import { calculateMatchScore } from './services/matching';
import { toPersianDigits, getTodayJalali } from './utils/jalali';

export type ScreenState = 
  | { type: 'dashboard' }
  | { type: 'properties'; filterPreset?: string }
  | { type: 'property-detail'; property: Property }
  | { type: 'property-form'; property?: Property | null }
  | { type: 'applicants' }
  | { type: 'applicant-form'; applicant?: Applicant | null }
  | { type: 'collaborators' }
  | { type: 'collaborator-form'; collaborator?: Collaborator | null }
  | { type: 'inbox' }
  | { type: 'calendar'; date?: string }
  | { type: 'voice-reminder'; linkedCode?: string; reminder?: ReminderTask | null; initialDate?: string }
  | {
      type: 'map';
      pickMode?: boolean;
      showTarhHadiOverlay?: boolean;
      calibratingPointId?: string;
      initialCoords?: { lat: number; lng: number };
    }
  | { type: 'settings' }
  | { type: 'backup-panel' }
  | { type: 'device-health' };

export default function App() {
  const [screen, setScreen] = useState<ScreenState>({ type: 'dashboard' });
  const [history, setHistory] = useState<ScreenState[]>([]);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  
  // Data state
  const [properties, setProperties] = useState<Property[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [reminders, setReminders] = useState<ReminderTask[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatusInfo>({
    light: 'dim',
    statusText: 'در حال بارگذاری...',
    subText: 'بررسی وضعیت همگام‌سازی',
    unsavedCount: 0,
    hasServerUpdate: false
  });

  // Settings & workspace state
  const [userRole, setUserRole] = useState('مدیر');
  const [userName, setUserName] = useState('مشاور ارشد');
  const [tarhHadiConfig, setTarhHadiConfig] = useState<TarhHadiCalibrationConfig>(
    getDefaultTarhHadiConfig()
  );
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [hasSavedGeminiKey, setHasSavedGeminiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiModelInput, setGeminiModelInput] = useState(DEFAULT_GEMINI_MODEL);
  const [isTestingGeminiKey, setIsTestingGeminiKey] = useState(false);
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Load core data from Dexie
  const refreshData = async () => {
    try {
      await preloadAllBlobs();
      const p = await db.properties.toArray();
      const a = await db.applicants.toArray();
      const c = await db.collaborators.toArray();
      const r = await db.reminders.toArray();
      setProperties(p);
      setApplicants(a);
      setCollaborators(c);
      setReminders(r);

      const status = await computeSyncStatus();
      setSyncStatus(status);

      const savedRole = await getSetting('userRole', 'مدیر');
      const savedName = await getSetting('userName', 'مشاور ارشد');
      const loadedTarhConfig = await loadTarhHadiConfig();
      const storedKey = await getStoredGeminiApiKey();
      const storedModel = await getStoredGeminiModel();
      setUserRole(savedRole);
      setUserName(savedName);
      setTarhHadiConfig(loadedTarhConfig);
      setGeminiKeyInput(storedKey);
      setHasSavedGeminiKey(Boolean(storedKey));
      setGeminiModelInput(storedModel);
    } catch (e) {
      console.error('Error fetching data:', e);
    }
  };

  useEffect(() => {
    refreshData();
    return subscribeTarhHadiConfig((updated) => {
      setTarhHadiConfig(updated);
    });
  }, []);

  // Compute all matching pairs for dashboard & alerts
  const matches = useMemo(() => {
    const list: any[] = [];
    const activeProps = properties.filter(p => !p.deleted && p.status === 'فعال');
    const activeApps = applicants.filter(a => !a.deleted);

    for (const prop of activeProps) {
      for (const app of activeApps) {
        const { percentage, reasons } = calculateMatchScore(prop, app);
        if (percentage >= 70) {
          list.push({
            property: prop,
            applicant: app,
            percentage,
            reasons
          });
        }
      }
    }
    return list.sort((a, b) => b.percentage - a.percentage);
  }, [properties, applicants]);

  const tarhHadiNeedsCalibration =
    !tarhHadiConfig.isCalibrated && !tarhHadiConfig.isNotificationDismissed;

  // Compute overdue count for top header (including unconfirmed Tarh Hadi calibration notice)
  const overdueCount = useMemo(() => {
    return (
      reminders.filter((r) => r.status === 'pending').length +
      (tarhHadiNeedsCalibration ? 1 : 0)
    );
  }, [reminders, tarhHadiNeedsCalibration]);

  // Track scroll position history
  const [scrollPositions, setScrollPositions] = useState<Record<number, number>>({});

  const navigateTo = (nextScreen: ScreenState) => {
    // Save current scroll position
    const currentScroll = window.scrollY || document.documentElement.scrollTop || 0;
    setScrollPositions(prev => ({ ...prev, [history.length]: currentScroll }));
    
    setHistory(prev => [...prev, screen]);
    setScreen(nextScreen);
    // Use requestAnimationFrame for clean layout rendering before scroll reset
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
  };

  const handleBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      const targetHistoryIndex = history.length - 1;
      const targetScroll = scrollPositions[targetHistoryIndex] || 0;

      setHistory(h => h.slice(0, -1));
      setScreen(prev);

      requestAnimationFrame(() => {
        window.scrollTo({ top: targetScroll, left: 0, behavior: 'instant' });
      });
    } else {
      setScreen({ type: 'dashboard' });
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      });
    }
  };

  const handleSelectTab = (tab: MainTabType) => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (tab === 'dashboard') setScreen({ type: 'dashboard' });
    else if (tab === 'properties') setScreen({ type: 'properties' });
    else if (tab === 'applicants') setScreen({ type: 'applicants' });
    else if (tab === 'collaborators') setScreen({ type: 'collaborators' });
  };

  const getActiveTab = (): MainTabType | null => {
    if (screen.type === 'dashboard') return 'dashboard';
    if (screen.type === 'properties' || screen.type === 'property-detail' || screen.type === 'property-form') return 'properties';
    if (screen.type === 'applicants' || screen.type === 'applicant-form') return 'applicants';
    if (screen.type === 'collaborators' || screen.type === 'collaborator-form') return 'collaborators';
    return null;
  };

  // Sync actions
  const handleBackupNow = async () => {
    const res = await triggerBackup();
    if (res.success) {
      showToast(res.message);
      await refreshData();
    }
  };

  const handleRefreshSync = async () => {
    const res = await performRefresh();
    if (res.success) {
      showToast(res.message);
      await refreshData();
    }
  };

  return (
    <div
      className="min-h-[100dvh] bg-[#070b14] text-[#dae2ff] font-sans antialiased relative selection:bg-[#f1cb83] selection:text-[#0a1328]"
      style={{
        paddingTop: 'var(--header-h, calc(4rem + env(safe-area-inset-top, 0px)))',
        paddingBottom: 'calc(var(--nav-h, calc(5rem + env(safe-area-inset-bottom, 0px))) + 1.5rem)',
      }}
    >
      {/* Background canvas effects */}
      <AtmosphericBackground />

      {/* Global Top App Header */}
      <TopAppHeader
        overdueCount={overdueCount}
        onOpenInbox={() => navigateTo({ type: 'inbox' })}
        onOpenCalendar={() => navigateTo({ type: 'calendar' })}
        onOpenSettings={() => navigateTo({ type: 'settings' })}
        userRole={userRole}
        userName={userName}
      />

      {/* Toast Notification Container */}
      {toastMessage && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-[100] max-w-sm w-11/12 animate-in fade-in slide-in-from-top-4 duration-300"
          style={{ top: 'calc(var(--header-h, 72px) + 0.75rem)' }}
        >
          <div className="p-3.5 rounded-2xl bg-[#161f34]/95 border border-[#f1cb83]/40 shadow-2xl backdrop-blur-xl text-center text-sm font-medium text-[#f1cb83] flex items-center justify-center gap-2">
            <span className="material-symbols-outlined text-[#f1cb83] text-lg">check_circle</span>
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* Main Screen Views */}
      <main className="relative z-10 max-w-2xl mx-auto px-3 sm:px-4 pt-3">
        {screen.type === 'dashboard' && (
          <DashboardView
            properties={properties}
            applicants={applicants}
            collaborators={collaborators}
            reminders={reminders}
            matches={matches}
            syncStatus={syncStatus}
            onBackupNow={handleBackupNow}
            onRefreshSync={handleRefreshSync}
            onImportJson={() => navigateTo({ type: 'backup-panel' })}
            onOpenBackupPanel={() => navigateTo({ type: 'backup-panel' })}
            onNavigateTab={(tab, filterPreset) => {
              if (tab === 'properties') navigateTo({ type: 'properties', filterPreset });
              else if (tab === 'applicants') navigateTo({ type: 'applicants' });
              else if (tab === 'collaborators') navigateTo({ type: 'collaborators' });
            }}
            onOpenPropertyDetail={(prop) => navigateTo({ type: 'property-detail', property: prop })}
            onOpenApplicantDetail={(app) => navigateTo({ type: 'applicant-form', applicant: app })}
            onOpenInbox={() => navigateTo({ type: 'inbox' })}
            onStartVoiceReminder={() => navigateTo({ type: 'voice-reminder' })}
            onSearchQuery={(q) => navigateTo({ type: 'properties', filterPreset: q })}
          />
        )}

        {screen.type === 'properties' && (
          <PropertyListView
            properties={properties}
            applicants={applicants}
            onOpenPropertyDetail={(prop) => navigateTo({ type: 'property-detail', property: prop })}
            onEditProperty={(prop) => navigateTo({ type: 'property-form', property: prop })}
            onAddNewProperty={() => navigateTo({ type: 'property-form', property: null })}
            onOpenMap={() => navigateTo({ type: 'map' })}
            onOpenApplicantDetail={(app) => navigateTo({ type: 'applicant-form', applicant: app })}
            filterPreset={screen.filterPreset}
          />
        )}

        {screen.type === 'property-detail' && (
          <PropertyDetailView
            property={properties.find((p) => p.id === screen.property.id) || screen.property}
            applicants={applicants}
            onBack={handleBack}
            onEdit={(prop) => navigateTo({ type: 'property-form', property: prop })}
            onDelete={async (propertyId) => {
              await db.properties.delete(propertyId);
              showToast('ملک با موفقیت از سامانه حذف شد');
              await refreshData();
              setScreen({ type: 'properties' });
            }}
            onOpenMap={() => navigateTo({ type: 'map' })}
            onOpenApplicantDetail={(app) => navigateTo({ type: 'applicant-form', applicant: app })}
            currentUserRole={userRole}
          />
        )}

        {screen.type === 'property-form' && (
          <PropertyFormView
            initialProperty={
              screen.property
                ? properties.find((p) => p.id === screen.property?.id) || screen.property
                : null
            }
            onSave={async (savedProp) => {
              await db.properties.put(savedProp);
              showToast(screen.property ? 'تغییرات ملک با موفقیت ذخیره شد' : 'ملک جدید با موفقیت ثبت شد');
              await refreshData();
              // Update any stale property reference in navigation history
              setHistory((prev) =>
                prev.map((item) =>
                  item.type === 'property-detail' && item.property.id === savedProp.id
                    ? { ...item, property: savedProp }
                    : item
                )
              );
              setScreen({ type: 'properties' });
              requestAnimationFrame(() => {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              });
            }}
            onDelete={
              screen.property
                ? async (propertyId) => {
                    await db.properties.delete(propertyId);
                    showToast('ملک با موفقیت از سامانه حذف شد');
                    await refreshData();
                    setScreen({ type: 'properties' });
                    requestAnimationFrame(() => {
                      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    });
                  }
                : undefined
            }
            onCancel={handleBack}
            onOpenMapPicker={() => navigateTo({ type: 'map', pickMode: true })}
            currentUserRole={userRole}
          />
        )}

        {screen.type === 'applicants' && (
          <ApplicantListView
            applicants={applicants}
            properties={properties}
            onOpenApplicantDetail={(app) => navigateTo({ type: 'applicant-form', applicant: app })}
            onEditApplicant={(app) => navigateTo({ type: 'applicant-form', applicant: app })}
            onAddNewApplicant={() => navigateTo({ type: 'applicant-form', applicant: null })}
            onOpenPropertyDetail={(prop) => navigateTo({ type: 'property-detail', property: prop })}
            onViewMatchedProperties={(app) => navigateTo({ type: 'properties' })}
            onScheduleUrgentCall={(app) => navigateTo({ type: 'voice-reminder', linkedCode: app.code })}
          />
        )}

        {screen.type === 'applicant-form' && (
          <ApplicantFormView
            initialApplicant={screen.applicant}
            properties={properties}
            onSave={async (savedApp) => {
              await db.applicants.put(savedApp);
              showToast(screen.applicant ? 'اطلاعات متقاضی بروزرسانی شد' : 'متقاضی جدید با موفقیت ثبت شد');
              await refreshData();
              setScreen({ type: 'applicants' });
              requestAnimationFrame(() => {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              });
            }}
            onDelete={
              screen.applicant
                ? async (applicantId) => {
                    await db.applicants.delete(applicantId);
                    showToast('پرونده متقاضی با موفقیت حذف شد');
                    await refreshData();
                    setScreen({ type: 'applicants' });
                    requestAnimationFrame(() => {
                      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    });
                  }
                : undefined
            }
            onCancel={handleBack}
            onOpenPropertyDetail={(prop) => navigateTo({ type: 'property-detail', property: prop })}
            currentUserRole={userRole}
          />
        )}

        {screen.type === 'collaborators' && (
          <CollaboratorListView
            collaborators={collaborators}
            properties={properties}
            onOpenCollaboratorDetail={(collab) => navigateTo({ type: 'collaborator-form', collaborator: collab })}
            onEditCollaborator={(collab) => navigateTo({ type: 'collaborator-form', collaborator: collab })}
            onAddNewCollaborator={() => navigateTo({ type: 'collaborator-form', collaborator: null })}
            onViewCollaboratorProperties={(collab) => navigateTo({ type: 'properties' })}
            onScheduleUrgentCall={(collab) => navigateTo({ type: 'voice-reminder', linkedCode: collab.code })}
            onRefreshSync={handleRefreshSync}
          />
        )}

        {screen.type === 'collaborator-form' && (
          <CollaboratorFormView
            initialCollaborator={screen.collaborator}
            onSave={async (savedCollab) => {
              await db.collaborators.put(savedCollab);
              showToast(screen.collaborator ? 'اطلاعات همکار بروزرسانی شد' : 'همکار جدید در شبکه معرفین ثبت شد');
              await refreshData();
              setScreen({ type: 'collaborators' });
              requestAnimationFrame(() => {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              });
            }}
            onDelete={
              screen.collaborator
                ? async (collaboratorId) => {
                    await db.collaborators.delete(collaboratorId);
                    showToast('پرونده همکار از سامانه حذف شد');
                    await refreshData();
                    setScreen({ type: 'collaborators' });
                    requestAnimationFrame(() => {
                      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                    });
                  }
                : undefined
            }
            onCancel={handleBack}
            currentUserRole={userRole}
          />
        )}

        {screen.type === 'inbox' && (
          <FollowUpInboxView
            reminders={reminders}
            properties={properties}
            onCompleteReminder={async (id) => {
              const r = await db.reminders.get(id);
              if (r) {
                await db.reminders.put({ ...r, status: 'completed', updatedAt: new Date().toISOString() });
                showToast('پیگیری با موفقیت انجام شد');
                await refreshData();
              }
            }}
            onSnoozeReminder={(id) => {
              const found = reminders.find((r) => r.id === id);
              if (found) {
                navigateTo({ type: 'voice-reminder', reminder: found });
              }
            }}
            onRenewReminder={(reminder) => {
              navigateTo({ type: 'voice-reminder', reminder });
            }}
            onDeleteReminder={async (id) => {
              await db.reminders.delete(id);
              showToast('یادآور حذف شد');
              await refreshData();
            }}
            onStartVoiceReminder={() => navigateTo({ type: 'voice-reminder', reminder: null })}
            onOpenCalendar={() => navigateTo({ type: 'calendar' })}
            onBack={handleBack}
            onOpenPropertyCode={(code) => {
              const norm = code.trim().toLowerCase();
              const found = properties.find((p) => p.code.trim().toLowerCase() === norm);
              if (found) navigateTo({ type: 'property-detail', property: found });
              else navigateTo({ type: 'properties' });
            }}
            onOpenPerson={(personCode, personName) => {
              const codeNorm = personCode?.trim().toLowerCase();
              const nameNorm = personName?.trim();
              const matchedApp = applicants.find(
                (a) =>
                  (codeNorm && a.code.trim().toLowerCase() === codeNorm) ||
                  (nameNorm && a.fullName.trim() === nameNorm)
              );
              if (matchedApp) {
                navigateTo({ type: 'applicant-form', applicant: matchedApp });
                return;
              }
              const matchedCollab = collaborators.find(
                (c) =>
                  (codeNorm && c.code.trim().toLowerCase() === codeNorm) ||
                  (nameNorm && c.fullName.trim() === nameNorm)
              );
              if (matchedCollab) {
                navigateTo({ type: 'collaborator-form', collaborator: matchedCollab });
                return;
              }
              navigateTo({ type: 'applicants' });
            }}
            tarhHadiNeedsCalibration={tarhHadiNeedsCalibration}
            onOpenTarhHadiSettings={() => {
              navigateTo({ type: 'settings' });
              setTimeout(() => {
                document
                  .getElementById('kelarabad-tarh-hadi-settings')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 150);
            }}
            onConfirmDefaultTarhHadi={async () => {
              const updated: TarhHadiCalibrationConfig = {
                ...tarhHadiConfig,
                isCalibrated: true,
                isNotificationDismissed: true,
                updatedAt: new Date().toISOString(),
                updatedBy: userName,
              };
              await saveTarhHadiConfig(updated);
              setTarhHadiConfig(updated);
              showToast('کالیبراسیون پیش‌فرض نقشه طرح هادی کلارآباد تایید و فعال شد ✓');
            }}
          />
        )}

        {screen.type === 'calendar' && (
          <CalendarView
            reminders={reminders}
            onOpenReminder={(reminder) => navigateTo({ type: 'voice-reminder', reminder })}
            onNewReminderDate={(jalaliDate) =>
              navigateTo({ type: 'voice-reminder', initialDate: jalaliDate })
            }
            onBack={handleBack}
          />
        )}

        {screen.type === 'voice-reminder' && (
          <VoiceReminderView
            properties={properties}
            collaborators={collaborators}
            applicants={applicants}
            initialReminder={screen.reminder || null}
            linkedCode={screen.linkedCode}
            initialDate={screen.initialDate}
            onSaveReminder={async (newReminder) => {
              await db.reminders.put(newReminder);
              showToast(
                screen.reminder
                  ? 'یادآور با موفقیت تمدید و زمان‌بندی شد'
                  : 'یادآور هوشمند صوتی ذخیره گردید'
              );
              await refreshData();
            }}
            onOpenInbox={() => navigateTo({ type: 'inbox' })}
            onClose={handleBack}
          />
        )}

        {screen.type === 'map' && (
          <MapView
            properties={properties}
            onOpenPropertyDetail={(prop) => navigateTo({ type: 'property-detail', property: prop })}
            onBack={handleBack}
            pickMode={screen.pickMode}
            initialCoords={screen.initialCoords}
            initialShowTarhHadiOverlay={screen.showTarhHadiOverlay}
            calibratingPointId={screen.calibratingPointId}
            pickLabel={
              screen.calibratingPointId
                ? 'انتخاب مختصات نقطه مرجع کالیبراسیون طرح هادی روی نقشه ماهواره‌ای'
                : undefined
            }
            onConfirmPickLocation={async (coords) => {
              if (screen.calibratingPointId) {
                const currentCfg = getTarhHadiConfigSync();
                const updatedPoints = currentCfg.controlPoints.map((cp) =>
                  cp.id === screen.calibratingPointId
                    ? {
                        ...cp,
                        lat: coords.lat,
                        lng: coords.lng,
                        rawInput: `${coords.lat.toFixed(6)} , ${coords.lng.toFixed(6)}`,
                      }
                    : cp
                );
                const updatedCfg: TarhHadiCalibrationConfig = {
                  ...currentCfg,
                  controlPoints: updatedPoints,
                  updatedAt: new Date().toISOString(),
                };
                await saveTarhHadiConfig(updatedCfg);
                setTarhHadiConfig(updatedCfg);
                showToast(
                  `مختصات نقطه مرجع از روی نقشه ماهواره‌ای ثبت شد: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                );
                handleBack();
                return;
              }
              showToast(`مختصات ثبت شد: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
              handleBack();
            }}
          />
        )}

        {screen.type === 'settings' && (
          <div className="space-y-4 py-3">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <button onClick={handleBack} className="p-2 rounded-xl bg-[#21293f] text-[#f1cb83]">
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
                <div>
                  <h2 className="text-lg font-bold text-[#f1cb83]">تنظیمات و سفارشی‌سازی سامانه</h2>
                  <p className="text-xs text-[#b8c5f5]/70">پیکربندی کلید، طرح هادی کلارآباد، نقش‌ها و هوش مصنوعی</p>
                </div>
              </div>
            </div>

            {/* Kelarabad Master Plan (طرح هادی کلارآباد) Calibration & Land-Use Panel */}
            <KelarabadSettingsPanel
              config={tarhHadiConfig}
              userRole={userRole}
              userName={userName}
              onConfigSaved={(updated) => setTarhHadiConfig(updated)}
              onShowToast={showToast}
              onOpenSatelliteMapWithOverlay={() =>
                navigateTo({ type: 'map', showTarhHadiOverlay: true })
              }
              onPickControlPointOnSatelliteMap={(pointId, initialCoords) =>
                navigateTo({
                  type: 'map',
                  pickMode: true,
                  calibratingPointId: pointId,
                  initialCoords,
                })
              }
            />

            {/* PWA & Health Status */}
            <div className="p-4 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] space-y-3">
              <h3 className="text-sm font-bold text-[#dae2ff] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#f1cb83]">security</span>
                <span>نصب PWA و سلامت دستگاه</span>
              </h3>
              <p className="text-xs text-[#b8c5f5]/70">برنامه بدون نیاز به اینترنت برای ثبت و بایگانی آفلاین در دسترس است.</p>
              <PWAInstallPrompt />
              <button 
                onClick={() => navigateTo({ type: 'device-health' })}
                className="w-full py-2.5 px-4 rounded-xl bg-[#21293f] border border-[#2c344b] text-xs font-semibold text-[#f1cb83] flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">health_and_safety</span>
                تست سلامت سخت‌افزار، باتری و حافظه محلی
              </button>
            </div>

            {/* User Profile */}
            <div className="p-4 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] space-y-3">
              <h3 className="text-sm font-bold text-[#dae2ff] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#f1cb83]">badge</span>
                <span>مشخصات کاربر و عنوان کارتابل</span>
              </h3>
              <div className="space-y-2">
                <label className="text-xs text-[#b8c5f5]">نام کاربر یا دفتر املاک</label>
                <input
                  type="text"
                  value={userName}
                  onChange={async (e) => {
                    setUserName(e.target.value);
                    await setSetting('userName', e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a1328] border border-[#2c344b] text-sm text-[#f1cb83] focus:border-[#f1cb83]"
                  placeholder="مثال: مشاور ارشد مهندس شمس"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-[#b8c5f5]">نقش کاربر</label>
                <select
                  value={userRole}
                  onChange={async (e) => {
                    setUserRole(e.target.value);
                    await setSetting('userRole', e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0a1328] border border-[#2c344b] text-sm text-[#f1cb83] focus:border-[#f1cb83]"
                >
                  <option value="مدیر">مدیر کل سیستم</option>
                  <option value="مشاور">مشاور و سرپرست فایل</option>
                  <option value="کارشناس">کارشناس جذب متقاضی</option>
                  <option value="معرف">معرف و همکار</option>
                </select>
              </div>
            </div>

            {/* کلید هوش مصنوعی (Gemini) */}
            <div className="p-4 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-[#dae2ff] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#f1cb83]">key</span>
                  <span>کلید هوش مصنوعی (Gemini)</span>
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    hasSavedGeminiKey
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/15 text-amber-300 border-amber-400/35'
                  }`}
                >
                  {hasSavedGeminiKey ? 'کلید ذخیره شده ✓' : 'بدون کلید (حالت محلی)'}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#b8c5f5] block">
                  کلید اختصاصی Gemini API
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type={showGeminiKey ? 'text' : 'password'}
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    value={geminiKeyInput}
                    onChange={(e) => {
                      setGeminiKeyInput(e.target.value);
                      setGeminiKeyStatus(null);
                    }}
                    placeholder="کلید Gemini خود را اینجا وارد کنید..."
                    className="flex-1 min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0a1328] border border-[#2c344b] text-xs font-mono text-[#f1cb83] focus:border-[#f1cb83] outline-none text-left"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGeminiKey((v) => !v)}
                    aria-label={showGeminiKey ? 'مخفی کردن کلید' : 'نمایش کلید'}
                    className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#21293f] border border-[#2c344b] text-xs font-bold text-[#f1cb83] flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showGeminiKey ? 'visibility_off' : 'visibility'}
                    </span>
                    <span>{showGeminiKey ? 'مخفی' : 'نمایش'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[#b8c5f5] block">
                  نام مدل هوش مصنوعی (Model)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={geminiModelInput}
                  onChange={(e) => setGeminiModelInput(e.target.value)}
                  placeholder={DEFAULT_GEMINI_MODEL}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0a1328] border border-[#2c344b] text-xs font-mono text-[#dae2ff] focus:border-[#f1cb83] outline-none text-left"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    const cleanKey = geminiKeyInput.trim();
                    const savedModel = await saveStoredGeminiModel(geminiModelInput);
                    setGeminiModelInput(savedModel);
                    if (!cleanKey) {
                      setGeminiKeyStatus({
                        type: 'error',
                        text: 'لطفاً کلید هوش مصنوعی را وارد کنید یا برای پاک کردن از دکمه «حذف کلید» استفاده نمایید.',
                      });
                      return;
                    }
                    await saveStoredGeminiApiKey(cleanKey);
                    setGeminiKeyInput(cleanKey);
                    setHasSavedGeminiKey(true);
                    setGeminiKeyStatus({
                      type: 'success',
                      text: 'کلید هوش مصنوعی و نام مدل فقط در حافظه داخلی این گوشی (IndexedDB) ذخیره شد ✓',
                    });
                    showToast('کلید هوش مصنوعی در حافظه دستگاه ذخیره شد');
                  }}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-[#f1cb83] text-[#0a1328] font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg cursor-pointer active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">save</span>
                  <span>ذخیره</span>
                </button>

                <button
                  type="button"
                  disabled={isTestingGeminiKey}
                  onClick={async () => {
                    setIsTestingGeminiKey(true);
                    setGeminiKeyStatus({
                      type: 'info',
                      text: 'در حال ارسال درخواست تست به سرویس Gemini...',
                    });
                    const res = await testGeminiApiKey(geminiKeyInput, geminiModelInput);
                    setIsTestingGeminiKey(false);
                    setGeminiKeyStatus({
                      type: res.ok ? 'success' : 'error',
                      text: res.message,
                    });
                  }}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-[#21293f] border border-[#f1cb83]/40 text-[#f1cb83] font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all disabled:opacity-60"
                >
                  <span
                    className={`material-symbols-outlined text-[18px] ${
                      isTestingGeminiKey ? 'animate-spin' : ''
                    }`}
                  >
                    {isTestingGeminiKey ? 'progress_activity' : 'network_check'}
                  </span>
                  <span>تست کلید</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await deleteStoredGeminiApiKey();
                    setGeminiKeyInput('');
                    setHasSavedGeminiKey(false);
                    setShowGeminiKey(false);
                    setGeminiKeyStatus({
                      type: 'info',
                      text: 'کلید هوش مصنوعی از حافظه این دستگاه حذف شد. سامانه به صورت خودکار از استخراج‌گر محلی فارسی استفاده می‌کند.',
                    });
                    showToast('کلید هوش مصنوعی از حافظه دستگاه حذف شد');
                  }}
                  className="min-h-[44px] py-2.5 px-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                  <span>حذف کلید</span>
                </button>
              </div>

              {geminiKeyStatus && (
                <div
                  className={`p-3 rounded-xl border text-xs font-medium leading-relaxed flex items-start gap-2 ${
                    geminiKeyStatus.type === 'success'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : geminiKeyStatus.type === 'error'
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      : 'bg-[#0a1328] border-[#f1cb83]/35 text-[#f1cb83]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] shrink-0 mt-0.5">
                    {geminiKeyStatus.type === 'success'
                      ? 'check_circle'
                      : geminiKeyStatus.type === 'error'
                      ? 'error'
                      : 'info'}
                  </span>
                  <span>{geminiKeyStatus.text}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#0a1328]/90 border border-[#2c344b] text-[11px] text-[#b8c5f5]/85 leading-relaxed space-y-1.5">
                <p>
                  • <strong className="text-[#f1cb83]">دریافت کلید:</strong> می‌توانید کلید رایگان یا اختصاصی خود را از آدرس{' '}
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="text-[#f1cb83] underline font-mono"
                  >
                    aistudio.google.com/apikey
                  </a>{' '}
                  دریافت کنید.
                </p>
                <p>
                  • <strong className="text-[#f1cb83]">ذخیره امن فقط روی همین گوشی:</strong> این کلید صرفاً در پایگاه داده داخلی مرورگر شما (IndexedDB) ذخیره می‌شود و هرگز در کد برنامه، فایل‌های پشتیبان (Export/Backup) یا اشتراک‌گذاری‌ها قرار نمی‌گیرد.
                </p>
                <p>
                  • <strong className="text-[#f1cb83]">توصیه امنیتی:</strong> در پنل Google Cloud محدودیت کلید (Application restrictions) را روی آدرس سایت خود (HTTP referrers) تنظیم فرمایید. در صورت نبودن کلید یا قطع اینترنت، استخراج یادآور به صورت خودکار با موتور محلی فارسی انجام می‌شود.
                </p>
              </div>
            </div>

            {/* Backup & Sync Direct Link */}
            <div className="p-4 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-[#f1cb83]">پشتیبان‌گیری و همگام‌سازی</h4>
                <p className="text-xs text-[#b8c5f5]/70">دریافت خروجی JSON، بازگردانی، اتصال به درایو</p>
              </div>
              <button
                onClick={() => navigateTo({ type: 'backup-panel' })}
                className="px-4 py-2 rounded-xl bg-[#f1cb83] text-[#0a1328] font-bold text-xs shadow-lg"
              >
                ورود به پنل
              </button>
            </div>
          </div>
        )}

        {screen.type === 'backup-panel' && (
          <div className="space-y-4 py-3">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <button onClick={handleBack} className="p-2 rounded-xl bg-[#21293f] text-[#f1cb83]">
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
                <div>
                  <h2 className="text-lg font-bold text-[#f1cb83]">مرکز پشتیبان‌گیری و امنیت ابری</h2>
                  <p className="text-xs text-[#b8c5f5]/70">مدیریت فایل‌های پشتیبان کامل سامانه کلید</p>
                </div>
              </div>
            </div>

            {/* Export & Import Tools */}
            <div className="p-5 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] space-y-4">
              <h3 className="text-sm font-bold text-[#f1cb83] flex items-center gap-2">
                <span className="material-symbols-outlined">cloud_download</span>
                <span>خروجی استاندارد JSON</span>
              </h3>
              <p className="text-xs text-[#b8c5f5]/80 leading-relaxed">
                یک نسخه کامل از املاک، متقاضیان، معرفین، یادداشت‌های صوتی و تنظیمات در قالب فایل امن JSON بر روی گوشی یا سیستم شما ذخیره خواهد شد.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => {
                    const fullData = {
                      version: '3.0',
                      exportedAt: new Date().toISOString(),
                      properties,
                      applicants,
                      collaborators,
                      reminders
                    };
                    exportAppJson(fullData);
                    showToast('فایل پشتیبان کلید دانلود شد');
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#f1cb83] text-[#0a1328] font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  دریافت فایل پشتیبان (Export JSON)
                </button>
                <label className="flex-1 py-3 px-4 rounded-xl bg-[#21293f] border border-[#2c344b] text-[#f1cb83] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-[#2c344b] transition-all">
                  <span className="material-symbols-outlined text-base">upload_file</span>
                  بازگردانی از فایل (Restore)
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      const success = await importAppJson(text);
                      if (success) {
                        showToast('اطلاعات با موفقیت بازگردانی شد');
                        await refreshData();
                      } else {
                        showToast('خطا در خواندن یا فرمت نامعتبر فایل');
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {/* Database Stats */}
            <div className="p-5 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] space-y-3">
              <h3 className="text-sm font-bold text-[#dae2ff] flex items-center gap-2">
                <span className="material-symbols-outlined text-[#f1cb83]">database</span>
                <span>آمار پایگاه داده محلی (IndexedDB)</span>
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#0a1328] border border-[#2c344b] flex justify-between items-center">
                  <span className="text-[#b8c5f5]">تعداد کل املاک فعال:</span>
                  <span className="font-bold text-[#f1cb83]">{toPersianDigits(properties.length)}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0a1328] border border-[#2c344b] flex justify-between items-center">
                  <span className="text-[#b8c5f5]">متقاضیان در حال انتظار:</span>
                  <span className="font-bold text-[#f1cb83]">{toPersianDigits(applicants.length)}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0a1328] border border-[#2c344b] flex justify-between items-center">
                  <span className="text-[#b8c5f5]">همکاران و معرفین:</span>
                  <span className="font-bold text-[#f1cb83]">{toPersianDigits(collaborators.length)}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#0a1328] border border-[#2c344b] flex justify-between items-center">
                  <span className="text-[#b8c5f5]">یادآورها و پیگیری‌ها:</span>
                  <span className="font-bold text-[#f1cb83]">{toPersianDigits(reminders.length)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {screen.type === 'device-health' && (
          <div className="space-y-4 py-3">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <button onClick={handleBack} className="p-2 rounded-xl bg-[#21293f] text-[#f1cb83]">
                  <span className="material-symbols-outlined">arrow_forward</span>
                </button>
                <div>
                  <h2 className="text-lg font-bold text-[#f1cb83]">سلامت و تطابق دستگاه با PWA</h2>
                  <p className="text-xs text-[#b8c5f5]/70">بررسی قابلیت‌های سخت‌افزاری و ذخیره‌سازی محلی</p>
                </div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[#161f34]/80 border border-[#2c344b] space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-[#2c344b]">
                <span className="text-xs text-[#b8c5f5]">وضعیت اتصال شبکه</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${navigator.onLine ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {navigator.onLine ? 'آنلاین (Online)' : 'آفلاین (بدون اینترنت)'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#2c344b]">
                <span className="text-xs text-[#b8c5f5]">پشتیبانی از سرویس‌ورکر (PWA)</span>
                <span className="text-xs font-bold text-emerald-400">
                  {'serviceWorker' in navigator ? 'فعال و ثبت شده' : 'پشتیبانی نمی‌شود'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#2c344b]">
                <span className="text-xs text-[#b8c5f5]">پشتیبانی از وب‌آدیو و ضبط صوت</span>
                <span className="text-xs font-bold text-emerald-400">
                  {'mediaDevices' in navigator ? 'آماده برای ضبط صوت' : 'محدود'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#2c344b]">
                <span className="text-xs text-[#b8c5f5]">فضای ذخیره‌سازی ابری IndexedDB</span>
                <span className="text-xs font-bold text-[#f1cb83]">
                  سریع و بدون سقف محدودکننده
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-[#b8c5f5]">محیط اجرایی (User Agent)</span>
                <span className="text-[11px] text-[#b8c5f5]/70 max-w-[200px] truncate" dir="ltr">
                  {navigator.userAgent}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom Navigation */}
      <BottomNavigationBar
        activeTab={getActiveTab()}
        onSelectTab={handleSelectTab}
        onOpenQuickAction={() => setIsQuickActionOpen(true)}
      />

      {/* Central "+" Quick Action Sheet */}
      <QuickActionSheet
        isOpen={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        onSelectAction={(action) => {
          setIsQuickActionOpen(false);
          if (action === 'new-property') navigateTo({ type: 'property-form', property: null });
          else if (action === 'new-applicant') navigateTo({ type: 'applicant-form', applicant: null });
          else if (action === 'new-collaborator') navigateTo({ type: 'collaborator-form', collaborator: null });
          else if (action === 'voice-reminder') navigateTo({ type: 'voice-reminder' });
        }}
      />

      {/* Global Reusable Map App Chooser Bottom Sheet */}
      <GlobalMapChooserHost />
    </div>
  );
}
