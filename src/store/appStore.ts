import { create } from "zustand";

type ThemeMode = "light" | "dark";

interface AppStore {
  theme: ThemeMode;
  vaultUnlocked: boolean;
  vaultConfigured: boolean;
  selectedClientId: string | null;
  search: string;
  setTheme: (t: ThemeMode) => void;
  setVault: (configured: boolean, unlocked: boolean) => void;
  setSelectedClientId: (id: string | null) => void;
  setSearch: (q: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  theme: "light",
  vaultUnlocked: false,
  vaultConfigured: false,
  selectedClientId: null,
  search: "",
  setTheme: (theme) => set({ theme }),
  setVault: (vaultConfigured, vaultUnlocked) => set({ vaultConfigured, vaultUnlocked }),
  setSelectedClientId: (selectedClientId) => set({ selectedClientId }),
  setSearch: (search) => set({ search }),
}));
