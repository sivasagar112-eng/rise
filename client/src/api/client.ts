import { StorageService } from '../services/StorageService';
import { Alarm, SleepWindowInsight } from '../types/alarm';

const API_BASE = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const user = StorageService.getUser();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (user?.token) {
    headers['Authorization'] = `Bearer ${user.token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = 'Network request failed';
    try {
      const data = await response.json();
      errorMsg = data.error || errorMsg;
    } catch {
      // response wasn't json
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // Auth
  async register(email: string, password: string) {
    return request<{ user: { id: string; email: string }; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async login(email: string, password: string) {
    return request<{ user: { id: string; email: string }; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async getMe() {
    return request<{ user: { id: string; email: string } }>('/auth/me');
  },

  // Alarms
  async getAlarms() {
    return request<{ alarms: Alarm[] }>('/alarms');
  },

  async createAlarm(alarm: Omit<Alarm, 'id'>) {
    return request<{ alarm: Alarm }>('/alarms', {
      method: 'POST',
      body: JSON.stringify(alarm),
    });
  },

  async updateAlarm(id: string, updates: Partial<Alarm>) {
    return request<{ alarm: Alarm }>(`/alarms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async toggleAlarm(id: string) {
    return request<{ alarm: Alarm }>(`/alarms/${id}/toggle`, {
      method: 'PATCH',
    });
  },

  async deleteAlarm(id: string) {
    return request<{ success: boolean }>(`/alarms/${id}`, {
      method: 'DELETE',
    });
  },

  // Wake Logs
  async recordDismissal(payload: {
    alarmId?: string | null;
    scheduledTime: string;
    responseTimeSeconds: number;
    dismissalType: string;
    success: boolean;
  }) {
    return request<{ log: unknown; currentStreak: number; message: string }>('/logs/dismiss', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getInsights() {
    return request<{
      currentStreak: number;
      totalDismissals: number;
      sleepWindows: SleepWindowInsight[];
    }>('/logs/insights');
  },
};
