import React from 'react';
import { Bell, History, User, Plus } from 'lucide-react';

export type TabType = 'ALARM' | 'ACTIVITY' | 'PROFILE';

interface BottomNavProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onNewAlarm: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  onNewAlarm,
}) => {
  return (
    <>
      {/* Floating Action Button (FAB) — only visible on the Alarm tab */}
      {activeTab === 'ALARM' && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={onNewAlarm}
            className="w-14 h-14 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all duration-150"
            aria-label="Add new alarm"
          >
            <Plus size={28} strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* Bottom Bar Navigation with evenly spaced Alarm, Activity, and Profile */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-theme-bg/95 backdrop-blur-md border-t border-theme-border py-2.5 px-4 select-none transition-colors duration-200">
        <div className="w-full max-w-md mx-auto grid grid-cols-3 items-center text-center">
          {/* Tab 1: Alarm */}
          <button
            onClick={() => onSelectTab('ALARM')}
            className={`flex flex-col items-center py-1 transition-colors ${
              activeTab === 'ALARM'
                ? 'text-blue-500 font-semibold'
                : 'text-theme-subtext hover:text-theme-text'
            }`}
          >
            <Bell size={22} className={activeTab === 'ALARM' ? 'stroke-[2.3]' : 'stroke-[1.8]'} />
            <span className="text-xs mt-1">Alarm</span>
          </button>

          {/* Tab 2: Activity */}
          <button
            onClick={() => onSelectTab('ACTIVITY')}
            className={`flex flex-col items-center py-1 transition-colors ${
              activeTab === 'ACTIVITY'
                ? 'text-blue-500 font-semibold'
                : 'text-theme-subtext hover:text-theme-text'
            }`}
          >
            <History size={22} className={activeTab === 'ACTIVITY' ? 'stroke-[2.3]' : 'stroke-[1.8]'} />
            <span className="text-xs mt-1">Activity</span>
          </button>

          {/* Tab 3: Profile */}
          <button
            onClick={() => onSelectTab('PROFILE')}
            className={`flex flex-col items-center py-1 transition-colors ${
              activeTab === 'PROFILE'
                ? 'text-blue-500 font-semibold'
                : 'text-theme-subtext hover:text-theme-text'
            }`}
          >
            <User size={22} className={activeTab === 'PROFILE' ? 'stroke-[2.3]' : 'stroke-[1.8]'} />
            <span className="text-xs mt-1">Profile</span>
          </button>
        </div>
      </nav>
    </>
  );
};
