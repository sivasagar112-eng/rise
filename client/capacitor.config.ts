import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rise.alarm',
  appName: 'Rise',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_alarm_notification',
      iconColor: '#3B82F6',
    },
  },
};

export default config;
