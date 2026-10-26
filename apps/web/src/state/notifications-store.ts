import { create } from 'zustand';

export type NotificationKind = 'info' | 'success' | 'error';

export interface NotificationAction {
  readonly label: string;
  readonly run: () => void;
}

export interface AppNotification {
  readonly id: number;
  readonly kind: NotificationKind;
  readonly message: string;
  readonly action?: NotificationAction;
}

interface NotificationsState {
  readonly items: readonly AppNotification[];
  readonly notify: (kind: NotificationKind, message: string, action?: NotificationAction) => void;
  readonly dismiss: (id: number) => void;
}

const AUTO_DISMISS_MS = 5000;
let nextId = 1;

export const useNotifications = create<NotificationsState>()((set, get) => ({
  items: [],
  notify: (kind, message, action) => {
    const id = nextId++;
    set({
      items: [...get().items.slice(-3), { id, kind, message, ...(action ? { action } : {}) }],
    });
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
  },
  dismiss: (id) => {
    set({ items: get().items.filter((n) => n.id !== id) });
  },
}));

export const notify = (kind: NotificationKind, message: string, action?: NotificationAction) =>
  useNotifications.getState().notify(kind, message, action);
