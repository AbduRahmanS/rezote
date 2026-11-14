/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL of the Rezote sync server, for example https://rezote-sync.example.workers.dev */
  readonly VITE_SYNC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
