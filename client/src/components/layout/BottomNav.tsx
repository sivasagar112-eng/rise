import React from 'react';
import { Bell, User, Plus } from 'lucide-react';
import { Haptics } from '../../services/HapticFeedback';

export type TabType = 'ALARM' | 'PROFILE';

interface BottomNavProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onNewAlarm: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onSelectTab, onNewAlarm }) => {
  const handleNewAlarm = () => {
    Haptics.medium();
    onNewAlarm();
  };

  const handleSelectTab = (tab: TabType) => {
    Haptics.selection();
    onSelectTab(tab);
  };

  return (
    <>
      {/* ── Floating Action Button (FAB) ── */}
      {activeTab === 'ALARM' && (
        <div className="fixed bottom-[78px] left-1/2 -translate-x-1/2 z-40">
          <button
            onClick={handleNewAlarm}
            aria-label="Add new alarm"
            className="
              w-[62px] h-[62px] rounded-full
              bg-gradient-to-tr from-blue-600 to-indigo-500 text-white
              flex items-center justify-center
              press-pop
              hover:brightness-110 active:scale-90
              transition-all duration-200
            "
            style={{
              boxShadow:
                '0 8px 30px rgba(37, 99, 235, 0.45), 0 2px 8px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
            }}
          >
            <Plus size={28} strokeWidth={2.6} className="transition-transform duration-200 active:rotate-90" />
          </button>
        </div>
      )}

      {/* ── Floating Glass Dock Navigation Bar ── */}
      <nav
        className="
          fixed bottom-0 left-0 right-0 z-30
          glass-card
          border-t border-theme-border
          py-2.5 px-8
          transition-colors duration-300
        "
        style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
      >
        <div className="w-full max-w-sm mx-auto grid grid-cols-2 items-center">
          {([
            { tab: 'ALARM' as TabType, Icon: Bell, label: 'Alarms' },
            { tab: 'PROFILE' as TabType, Icon: User, label: 'Profile' },
          ] as const).map(({ tab, Icon, label }) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => handleSelectTab(tab)}
                className="flex flex-col items-center gap-1 py-1 relative press-spring group"
              >
                {/* Active Indicator Glow Pill */}
                {active && (
                  <span
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-1 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pop-in"
                  />
                )}

                <div
                  className={`p-1 rounded-xl transition-all duration-200 ${
                    active ? 'bg-blue-500/10 scale-110' : 'group-hover:bg-theme-card'
                  }`}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.5 : 1.9}
                    className={`transition-colors duration-200 ${
                      active ? 'text-blue-500' : 'text-theme-subtext'
                    }`}
                  />
                </div>

                <span
                  className={`text-[11px] font-bold tracking-tight transition-colors duration-200 ${
                    active ? 'text-blue-500 font-extrabold' : 'text-theme-subtext'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
