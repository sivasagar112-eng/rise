import { registerPlugin, Capacitor } from '@capacitor/core';

export interface GoogleUser {
  uid: string;
  email: string;
  displayName: string;
  photoUrl: string;
}

export interface GoogleAuthPluginInterface {
  signIn(): Promise<GoogleUser>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<Partial<GoogleUser>>;
}

export const GoogleAuthPlugin = registerPlugin<GoogleAuthPluginInterface>('GoogleAuth');

export class GoogleAuthService {
  static isAvailable(): boolean {
    return Capacitor.isNativePlatform();
  }

  static async signIn(): Promise<GoogleUser> {
    if (!this.isAvailable()) {
      throw new Error('Google Sign-In via Credential Manager is available on Android devices.');
    }
    return await GoogleAuthPlugin.signIn();
  }

  static async signOut(): Promise<void> {
    if (this.isAvailable()) {
      try {
        await GoogleAuthPlugin.signOut();
      } catch (err) {
        console.warn('Native Google signOut error:', err);
      }
    }
  }

  static async getCurrentUser(): Promise<Partial<GoogleUser> | null> {
    if (!this.isAvailable()) return null;
    try {
      const user = await GoogleAuthPlugin.getCurrentUser();
      return user?.uid ? user : null;
    } catch {
      return null;
    }
  }
}
