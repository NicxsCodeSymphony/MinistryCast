export const BUNDLED_VERSION = __APP_VERSION__;

export async function readAppVersion() {
  try {
    const { getVersion } = await import("@tauri-apps/api/app");
    return await getVersion();
  } catch {
    return BUNDLED_VERSION;
  }
}
