import fs from "node:fs";
import { MediaLibrary } from "./media";

/** Node only: load manifests from a file path (ROUTE_MEDIA_MANIFEST). */
export function mediaFromFile(file: string): MediaLibrary {
  if (!fs.existsSync(file)) return new MediaLibrary([]);
  try {
    const lib = new MediaLibrary(JSON.parse(fs.readFileSync(file, "utf8")));
    for (const w of lib.warnings) console.warn(`[media] ${w}`);
    return lib;
  } catch (err) {
    console.warn(`[media] could not read ${file}: ${(err as Error).message}`);
    return new MediaLibrary([]);
  }
}
