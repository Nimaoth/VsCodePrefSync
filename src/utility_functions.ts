import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export function getAppdataPath() : string {
    switch (os.platform()) {
    case "win32":
        return path.join(os.homedir(), "AppData", "Roaming");
    case "darwin":
        return path.join(os.homedir(), "Library", "Application Support");
    case "linux":
        return path.join(os.homedir(), ".config");
    }
    return "UserSettings";
}

export function mkdirRec(dir: string) {
    let base = path.dirname(dir);
    if (!fs.existsSync(base)) {
        mkdirRec(base);
    }
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}
