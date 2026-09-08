import React, { useState, useEffect } from 'react';
import { useTheme } from './hooks/useTheme';
import { StorageService } from './services/StorageService';
import { Alarm, WakeLogItem } from './types/alarm';
import { useAlarmScheduler } from './hooks/useAlarmScheduler';
import { Header } from './components/layout/Header';
import { BottomNav, TabType } from './components/layout/BottomNav';
import { AlarmCard } from './components/alarm/AlarmCard';
import { AlarmEditorModal } from './components/alarm/AlarmEditorModal';
import { RingingScreen } from './components/ringing/RingingScreen';
import { ActivityScreen } from './components/stats/ActivityScreen';
import { ProfileScreen } from './components/profile/ProfileScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { CameraPermissionModal } from './components/onboarding/CameraPermissionModal';
import { DynamicIslandAlarm } from './components/common/DynamicIslandAlarm';
import { api } from './api/client';
import { BellOff } from 'lucide-react';

export const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  // Start with user-defined alarms (empty by default)
  const [alarms, setAlarms] = useState<Alarm[]>(() => StorageService.getAlarms());

  const [activeTab, setActiveTab] = useState<TabType>('ALARM');
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(!StorageService.hasSeenOnboarding());

  // Alarm Scheduler Hook
  const {
    activeRingingAlarm,
    testAlarmImmediately,
    completeDismissal,
  } = useAlarmScheduler({
    alarms,
    onAlarmTrigger: (triggeredAlarm) => {
      console.log(`[Rise Engine] Alarm triggered: ${triggeredAlarm.time}`);
    },
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
    const updated = alarms.map((a) =>
      a.id === id ? { ...a, isEnabled: !a.isEnabled } : a
    );
    setAlarms(updated);
    StorageService.saveAlarms(updated);

    const user = StorageService.getUser();
    if (user?.token) {
      api.toggleAlarm(id).catch(() => {});
    }
  };

  const handleSaveAlarm = async (alarm: Alarm) => {
    const updated = StorageService.addOrUpdateAlarm(alarm);
    setAlarms(updated);
    setIsEditorOpen(false);
    setEditingAlarm(null);

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
  const handleDismissVerified = async () => {
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
  };

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
      <main className="flex-1 w-full max-w-md mx-auto px-5">
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
          <div className="animate-fade-in">
            <ActivityScreen />
          </div>
        )}

        {/* Tab 3: Profile */}
        {activeTab === 'PROFILE' && (
          <div className="animate-fade-in">
            <ProfileScreen />
          </div>
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
        <AlarmEditorModal
          alarm={editingAlarm}
          onSave={handleSaveAlarm}
          onDelete={handleDeleteAlarm}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingAlarm(null);
          }}
        />
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md bg-theme-card border border-theme-border rounded-2xl max-h-[90vh] overflow-y-auto">
            <SettingsScreen
              theme={theme}
              onToggleTheme={toggleTheme}
              onClose={() => setIsSettingsOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Dynamic Island Banner (iPhone Style Floating Pill) */}
      {activeRingingAlarm && (
        <DynamicIslandAlarm alarm={activeRingingAlarm} />
      )}

      {/* Ringing Screen (Strict No-Snooze Challenge) */}
      {activeRingingAlarm && (
        <RingingScreen
          alarm={activeRingingAlarm}
          onDismissVerified={handleDismissVerified}
        />
      )}

      {/* First Launch Camera Permission Explainer */}
      {showOnboarding && (
        <CameraPermissionModal onDismiss={() => setShowOnboarding(false)} />
      )}
    </div>
  );
};
