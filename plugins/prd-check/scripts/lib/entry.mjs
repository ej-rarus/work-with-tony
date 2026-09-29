import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// True when the module at metaUrl is the script node was asked to run. Compares
// real paths so a script started through a symlink (for example /tmp on macOS,
// which points at /private/tmp) still runs instead of silently doing nothing.
export function isEntry(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argv1);
  } catch {
    return false;
  }
}
