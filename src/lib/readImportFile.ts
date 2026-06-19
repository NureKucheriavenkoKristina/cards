import { File as ExpoFsFile } from "expo-file-system";
import { Platform } from "react-native";

/**
 * Read picked document as UTF-8 text (CSV / TXT).
 */
export async function readUriAsUtf8(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return res.text();
  }
  const file = new ExpoFsFile(uri);
  const buf = await file.arrayBuffer();
  return new TextDecoder("utf-8").decode(buf);
}

/**
 * Read picked document as binary buffer (XLSX).
 */
export async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
  const file = new ExpoFsFile(uri);
  return file.arrayBuffer();
}
