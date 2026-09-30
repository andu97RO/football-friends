import { create } from 'zustand';

export type ToastRequest = {
  id: number;
  message: string;
  tone?: 'default' | 'error';
  action?: { label: string; onPress: () => void };
  duration?: number;
};

let nextId = 1;

export const useToastStore = create<{ toast: ToastRequest | null; dismiss: (id?: number) => void }>((set, get) => ({
  toast: null,
  dismiss: (id) => {
    if (id === undefined || get().toast?.id === id) set({ toast: null });
  },
}));

/** Brief confirmation at the bottom of the screen, optionally with Undo. */
export function showToast(message: string, options: Omit<ToastRequest, 'id' | 'message'> = {}): void {
  useToastStore.setState({ toast: { id: nextId++, message, ...options } });
}
