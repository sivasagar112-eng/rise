import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { TabType } from '../components/layout/BottomNav';
import { Alarm } from '../types/alarm';

interface UseBackNavigationProps {
  activeRingingAlarm: Alarm | null;
  isEditorOpen: boolean;
  closeEditor: () => void;
  isSettingsOpen: boolean;
  closeSettings: () => void;
  showOnboarding: boolean;
  closeOnboarding: () => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  showToast: (text: string) => void;
}

export function useBackNavigation({
  activeRingingAlarm,
  isEditorOpen,
  closeEditor,
  isSettingsOpen,
  closeSettings,
  showOnboarding,
  closeOnboarding,
  activeTab,
  setActiveTab,
  showToast,
}: UseBackNavigationProps) {
  // Use refs to avoid stale closures in the Capacitor event listener
  const ringingRef = useRef(activeRingingAlarm);
  ringingRef.current = activeRingingAlarm;

  const editorRef = useRef(isEditorOpen);
  editorRef.current = isEditorOpen;

  const settingsRef = useRef(isSettingsOpen);
  settingsRef.current = isSettingsOpen;

  const onboardingRef = useRef(showOnboarding);
  onboardingRef.current = showOnboarding;

  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;

  const lastBackPressRef = useRef<number>(0);

  // Tab navigation history stack
  const tabHistoryRef = useRef<TabType[]>(['ALARM']);

  useEffect(() => {
    if (tabHistoryRef.current[tabHistoryRef.current.length - 1] !== activeTab) {
      tabHistoryRef.current.push(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    let backListener: any = null;

    const handleBackAction = () => {
      // 1. If an alarm is currently firing, BLOCK back button completely (zero snooze guarantee)
      if (ringingRef.current) {
        return;
      }

      // 2. If the Alarm Editor (New/Edit Alarm) modal is open, close it!
      if (editorRef.current) {
        closeEditor();
        return;
      }

      // 3. If Settings modal is open, close it!
      if (settingsRef.current) {
        closeSettings();
        return;
      }

      // 4. If Onboarding modal is open, close it!
      if (onboardingRef.current) {
        closeOnboarding();
        return;
      }

      // 5. If user is in another tab (Activity or Profile), navigate back to previous tab / ALARM tab
      if (tabHistoryRef.current.length > 1) {
        tabHistoryRef.current.pop(); // Remove current tab
        const prevTab = tabHistoryRef.current[tabHistoryRef.current.length - 1] || 'ALARM';
        setActiveTab(prevTab);
        return;
      } else if (tabRef.current !== 'ALARM') {
        setActiveTab('ALARM');
        return;
      }

      // 6. At root ALARM tab: Double-back to exit prevention
      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        CapApp.exitApp();
      } else {
        lastBackPressRef.current = now;
        showToast('Press back again to exit');
      }
    };

    // Register Capacitor native back button & edge swipe gesture listener
    CapApp.addListener('backButton', () => {
      handleBackAction();
    }).then((listener) => {
      backListener = listener;
    }).catch((err) => {
      console.warn('[useBackNavigation] Capacitor backButton listener unavailable:', err);
    });

    // Also support keyboard Escape key
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBackAction();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (backListener && backListener.remove) {
        backListener.remove();
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeEditor, closeSettings, closeOnboarding, setActiveTab, showToast]);
}
