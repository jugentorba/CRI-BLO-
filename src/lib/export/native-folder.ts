import { registerPlugin } from "@capacitor/core";

export type NativeStorageScope = "export" | "cloud";

export interface NativeFolderPickResult {
  status: "selected" | "cancelled";
  name?: string;
}

export interface NativeWriteStartResult {
  wrote: boolean;
  token?: string;
  folderName?: string;
}

export interface NativeReadStartResult {
  found: boolean;
  token?: string;
  folderName?: string;
}

export interface NativeReadChunkResult {
  base64: string;
  done: boolean;
}

interface CriBloStoragePlugin {
  pickFolder(options?: { scope?: NativeStorageScope }): Promise<NativeFolderPickResult>;
  beginWrite(options: {
    fileName: string;
    mimeType: string;
    scope?: NativeStorageScope;
  }): Promise<NativeWriteStartResult>;
  writeChunk(options: { token: string; base64: string }): Promise<void>;
  finishWrite(options: { token: string }): Promise<void>;
  abortWrite(options: { token: string }): Promise<void>;
  beginRead(options: {
    fileName: string;
    scope?: NativeStorageScope;
  }): Promise<NativeReadStartResult>;
  readChunk(options: { token: string }): Promise<NativeReadChunkResult>;
  finishRead(options: { token: string }): Promise<void>;
}

export const CriBloStorage = registerPlugin<CriBloStoragePlugin>("CriBloStorage");
