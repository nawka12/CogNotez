// Build-time variables baked in by electron-vite (MAIN_VITE_ prefix). Both may be empty.
interface ImportMetaEnv {
  readonly MAIN_VITE_GOOGLE_CLIENT_ID?: string
  readonly MAIN_VITE_GOOGLE_CLIENT_SECRET?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
