import { hostname } from "os";
import { readFile, writeFile, mkdir } from "fs/promises";
import { akpDir, devPath } from "./paths.js";

export async function getMachineId(): Promise<string> {
  try {
    const existing = await readFile(devPath(), "utf8");
    return `${hostname()}:${existing.trim()}`;
  } catch {
    const id = crypto.randomUUID();
    try {
      await mkdir(akpDir(), { recursive: true });
      await writeFile(devPath(), id, "utf8");
    } catch { /* best effort */ }
    return `${hostname()}:${id}`;
  }
}
