import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useTheme } from './hooks/useTheme';
import { StorageService } from './services/StorageService';
import { Alarm, WakeLogItem } from './types/alarm';
import { useAlarmScheduler } from './hooks/useAlarmScheduler';
import { Header } from './components/layout/Header';
import { BottomNav, TabType } from './components/layout/BottomNav';
import { AlarmCard } from './components/alarm/AlarmCard';
import { DynamicIslandAlarm } from './components/common/DynamicIslandAlarm';
import { NextAlarmToast, ToastMessage } from './components/common/NextAlarmToast';
import { useBackNavigation } from './hooks/useBackNavigation';
import { getTimeUntilAlarm } from './utils/timeFormat';
import { api } from './api/client';
import { BellOff } from 'lucide-react';

// Lazy-load heavy screens to make initial app launch near instantaneous
const AlarmEditorModal = lazy(() => import('./components/alarm/AlarmEditorModal').then((m) => ({ default: m.AlarmEditorModal })));
const RingingScreen = lazy(() => import('./components/ringing/RingingScreen').then((m) => ({ default: m.RingingScreen })));
const ActivityScreen = lazy(() => import('./components/stats/ActivityScreen').then((m) => ({ default: m.ActivityScreen })));
const ProfileScreen = lazy(() => import('./components/profile/ProfileScreen').then((m) => ({ default: m.ProfileScreen })));
const SettingsScreen = lazy(() => import('./components/settings/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const CameraPermissionModal = lazy(() => import('./components/onboarding/CameraPermissionModal').then((m) => ({ default: m.CameraPermissionModal })));

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  // Start with user-defined alarms (empty by default)
  const [alarms, setAlarms] = useState<Alarm[]>(() => StorageService.getAlarms());

  const [activeTab, setActiveTab] = useState<TabType>('ALARM');
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(!StorageService.hasSeenOnboarding());
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = React.useCallback((text: string, icon: 'clock' | 'info' = 'clock') => {
    setToast({
      id: String(Date.now()),
      text,
      icon,
    });
  }, []);

  const handleAlarmTrigger = React.useCallback((triggeredAlarm: Alarm) => {
    console.log(`[Rise Engine] Alarm triggered: ${triggeredAlarm.time}`);
  }, []);

  // Alarm Scheduler Hook
  const {
    activeRingingAlarm,
    testAlarmImmediately,
    completeDismissal,
    clearDismissal,
  } = useAlarmScheduler({
    alarms,
    onAlarmTrigger: handleAlarmTrigger,
  });

  // Professional Android back button & edge swipe-to-go-back gesture handling
  useBackNavigation({
    activeRingingAlarm,
    isEditorOpen,
    closeEditor: React.useCallback(() => {
      setIsEditorOpen(false);
      setEditingAlarm(null);
    }, []),
    isSettingsOpen,
    closeSettings: React.useCallback(() => setIsSettingsOpen(false), []),
    showOnboarding,
    closeOnboarding: React.useCallback(() => setShowOnboarding(false), []),
    activeTab,
    setActiveTab,
    showToast,
  });

  // Sync with remote server on mount if logged in
  useEffect(() => {
    const user = StorageService.getUser();
    if (user?.token) {
      api.getAlarms()
        .then((res) => {
          if (res.alarms) {
            setAlarms(res.alarms);
            StorageService.saveAlarms(res.alarms);
          }
        })
        .catch((err) => {
          console.warn('Using local offline alarms:', err);
        });
    }
  }, []);

  // Alarm CRUD
  const handleToggleAlarm = async (id: string) => {
    let justEnabledAlarm: Alarm | undefined;
    const updated = alarms.map((a) => {
      if (a.id === id) {
        const nextState = !a.isEnabled;
        const updatedAlarm = { ...a, isEnabled: nextState };
        if (nextState) {
          justEnabledAlarm = updatedAlarm;
        }
        return updatedAlarm;
      }
      return a;
    });
    setAlarms(updated);
    StorageService.saveAlarms(updated);

    if (justEnabledAlarm) {
      clearDismissal(justEnabledAlarm.id);
      const { formattedText } = getTimeUntilAlarm(
        justEnabledAlarm.time,
        justEnabledAlarm.daysOfWeek
      );
      showToast(formattedText, 'clock');
    }

    const user = StorageService.getUser();
    if (user?.token) {
      api.toggleAlarm(id).catch(() => {});
    }
  };

  const handleSaveAlarm = async (alarm: Alarm) => {
    // Clear any past dismissal so updated alarm rings cleanly
    if (alarm.isEnabled) {
      clearDismissal(alarm.id);
    }

    // Update localStorage first
    const updatedAlarms = StorageService.addOrUpdateAlarm(alarm);
    
    // Force React state update with the definitive localStorage version
    setAlarms([...updatedAlarms]);
    setIsEditorOpen(false);
    setEditingAlarm(null);

    // If saved alarm is enabled, show the "Next alarm in X minutes" toast matching screenshot
    if (alarm.isEnabled) {
      const { formattedText } = getTimeUntilAlarm(alarm.time, alarm.daysOfWeek);
      showToast(formattedText, 'clock');
    }

    const user = StorageService.getUser();
    if (user?.token) {
      try {
        const existing = alarms.find((a) => a.id === alarm.id);
        if (existing) {
          await api.updateAlarm(alarm.id, alarm);
        } else {
          await api.createAlarm(alarm);
        }
      } catch (e) {
        console.warn('Alarm cloud sync error:', e);
      }
    }
  };

  const handleDeleteAlarm = async (id: string) => {
    const updated = StorageService.deleteAlarm(id);
    setAlarms(updated);
    setIsEditorOpen(false);
    setEditingAlarm(null);

    const user = StorageService.getUser();
    if (user?.token) {
      api.deleteAlarm(id).catch(() => {});
    }
  };

  // Ringing & Dismissal Verification
  const handleDismissVerified = React.useCallback(async () => {
    const { alarm, responseTimeSeconds } = completeDismissal();
    if (!alarm) return;

    const logItem: WakeLogItem = {
      id: `log-${Date.now()}`,
      alarmId: alarm.id,
      scheduledTime: new Date().toISOString(),
      dismissedAt: new Date().toISOString(),
      responseTimeSeconds,
      dismissalType: alarm.dismissalType,
      success: true,
    };

    StorageService.addWakeLog(logItem);

    // Bug #4 fix: Handle one-time vs repeating alarms after dismissal
    const isOneTimeAlarm = !alarm.daysOfWeek || alarm.daysOfWeek.length === 0;
    if (isOneTimeAlarm) {
      // One-time alarm: disable it after it has been dismissed
      const updatedAlarms = alarms.map((a) =>
        a.id === alarm.id ? { ...a, isEnabled: false } : a
      );
      setAlarms(updatedAlarms);
      StorageService.saveAlarms(updatedAlarms);
    } else {
      // Repeating alarm: keep it enabled and re-sync to schedule next occurrence
      // Force re-sync by creating a new array reference
      const currentAlarms = StorageService.getAlarms();
      setAlarms([...currentAlarms]);
    }

    const user = StorageService.getUser();
    if (user?.token) {
      api.recordDismissal({
        alarmId: alarm.id,
        scheduledTime: logItem.scheduledTime,
        responseTimeSeconds,
        dismissalType: alarm.dismissalType,
        success: true,
      }).catch(() => {});
    }
  }, [completeDismissal, alarms]);

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text flex flex-col font-sans select-none pb-28 transition-colors duration-200">
      {/* Top Header with theme toggle on top right */}
      <Header
        theme={theme}
        alarms={alarms}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onInstantTest={() => {
          const target = alarms[0] || {
            id: 'demo-test',
            time: '07:00',
            label: 'Test Wake-Up',
            daysOfWeek: [],
            dismissalType: 'PUSHUP_MATH',
            pushupTarget: 5,
            referenceDescriptor: null,
            rampDuration: 20,
            preAlarmEnabled: false,
            isEnabled: true,
          };
          testAlarmImmediately(target);
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto px-5 pb-36">
        {/* Tab 1: Alarms */}
        {activeTab === 'ALARM' && (
          <div className="animate-fade-in space-y-1">
            {alarms.length === 0 ? (
              <div className="py-16 text-center text-theme-subtext space-y-3">
                <div className="w-16 h-16 rounded-full bg-theme-card border border-theme-border flex items-center justify-center mx-auto text-neutral-400">
                  <BellOff size={28} />
                </div>
                <h3 className="text-lg font-bold text-theme-text">No alarms yet</h3>
                <p className="text-sm max-w-xs mx-auto">
                  Tap the <strong className="text-blue-500 font-bold">+</strong> button below to configure your first wake-up alarm.
                </p>
              </div>
            ) : (
              alarms.map((alarm) => (
                <AlarmCard
                  key={alarm.id}
                  alarm={alarm}
                  onToggle={handleToggleAlarm}
                  onEdit={(a) => {
                    setEditingAlarm(a);
                    setIsEditorOpen(true);
                  }}
                  onDelete={handleDeleteAlarm}
                />
              ))
            )}
          </div>
        )}

        {/* Tab 2: Activity History */}
        {activeTab === 'ACTIVITY' && (
          <Suspense fallback={null}>
            <div className="animate-fade-in">
              <ActivityScreen />
            </div>
          </Suspense>
        )}

        {/* Tab 3: Profile */}
        {activeTab === 'PROFILE' && (
          <Suspense fallback={null}>
            <div className="animate-fade-in">
              <ProfileScreen />
            </div>
          </Suspense>
        )}
      </main>

      {/* Centered Floating Action Button & Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onNewAlarm={() => {
          setEditingAlarm(null);
          setIsEditorOpen(true);
        }}
      />

      {/* Alarm Editor Modal */}
      {isEditorOpen && (
        <Suspense fallback={null}>
          <AlarmEditorModal
            key={editingAlarm ? editingAlarm.id : 'new-alarm'}
            alarm={editingAlarm}
            onSave={handleSaveAlarm}
            onDelete={handleDeleteAlarm}
            onClose={() => {
              setIsEditorOpen(false);
              setEditingAlarm(null);
            }}
          />
        </Suspense>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div
          onClick={() => setIsSettingsOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-theme-card border border-theme-border rounded-2xl max-h-[90vh] overflow-y-auto"
          >
            <Suspense fallback={null}>
              <SettingsScreen
                theme={theme}
                onToggleTheme={toggleTheme}
                onClose={() => setIsSettingsOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* Dynamic Island Banner (iPhone Style Floating Pill) */}
      {activeRingingAlarm && (
        <DynamicIslandAlarm alarm={activeRingingAlarm} />
      )}

      {/* Ringing Screen (Strict No-Snooze Challenge) */}
      {activeRingingAlarm && (
        <Suspense fallback={null}>
          <RingingScreen
            alarm={activeRingingAlarm}
            onDismissVerified={handleDismissVerified}
          />
        </Suspense>
      )}

      {/* First Launch Camera Permission Explainer */}
      {showOnboarding && (
        <Suspense fallback={null}>
          <CameraPermissionModal onDismiss={() => setShowOnboarding(false)} />
        </Suspense>
      )}

      {/* Next Alarm Countdown Toast Pill (Floating at Bottom) */}
      <NextAlarmToast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
