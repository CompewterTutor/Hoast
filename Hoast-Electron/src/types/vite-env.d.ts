/// <reference types="vite/client" />

// Global Vite environment variables for the main process
interface ImportMetaEnv {
  // Define environment variables here if needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Global variables injected by Vite for Electron Forge
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;