import { registerPlugin } from "@capacitor/core";

export interface NativeFolderPickResult {
  status: "selected" | "cancelled";
  name?: string;
}

export interface NativeWriteStartResult {
  wrote: boolean;
  token?: string;
  folderName?: string;
}

interface CriBloStoragePlugin {
  pickFolder(): Promise<NativeFolderPickResult>;
  beginWrite(options: {
    fileName: string;
    mimeType: string;
  }): Promise<NativeWriteStartResult>;
  writeChunk(options: { token: string; base64: string }): Promise<void>;
  finishWrite(options: { token: string }): Promise<void>;
  abortWrite(options: { token: string }): Promise<void>;
}

export const CriBloStorage = registerPlugin<CriBloStoragePlugin>("CriBloStorage");
