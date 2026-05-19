import packageJson from "../../package.json";

/** Nome prodotto mostrato in UI (allineato a `productName` in tauri.conf.json). */
export const APP_DISPLAY_NAME = "HelpDesk Manager";

/** Versione release (allineata a package.json / tauri.conf.json). */
export const APP_VERSION = packageJson.version;

export const APP_AUTHOR = "Diego Giotta";

export const APP_SUPPORT_EMAIL = "dgtech93@gmail.com";
