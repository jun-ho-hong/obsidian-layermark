export type ClipboardCapabilityEnvironment = {
  navigator?: {
    clipboard?: {
      write?: unknown;
    };
  };
  ClipboardItem?: unknown;
};

export function canWriteImageClipboard(environment: ClipboardCapabilityEnvironment = globalThis): boolean {
  return typeof environment.navigator?.clipboard?.write === "function" && typeof environment.ClipboardItem !== "undefined";
}
