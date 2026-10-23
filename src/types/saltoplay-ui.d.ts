export interface SaltoPlayUIConfiguration {
  enabled?: boolean;
  welcome?: boolean;
  position?: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right' | 'top-left';
  duration?: number;
}
export interface SaltoPlayNotification {
  id?: string;
  title?: string;
  message?: string;
  description?: string;
  tone?: 'info' | 'success' | 'error';
  duration?: number;
  xp?: number;
  demo?: boolean;
  gameTitle?: string;
}
export interface SaltoPlayUI {
  showWelcome(value: { id?: string; tag?: string; displayName?: string; avatar?: string | null }, options?: { once?: boolean }): string | null;
  notify(value: string | SaltoPlayNotification): string | null;
  showAchievement(value: SaltoPlayNotification): string | null;
  configure(value?: SaltoPlayUIConfiguration): Required<SaltoPlayUIConfiguration>;
  dismissAll(): boolean;
}
declare global {
  interface Window {
    SaltoPlay?: { version: string; ui: SaltoPlayUI; };
  }
}
