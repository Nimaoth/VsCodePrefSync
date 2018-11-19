'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
const simpleGit = require('simple-git/promise');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage(`Activating VsCodePrefSync extension`);

    let upload = vscode.commands.registerCommand('extension.uploadPreferencesToGithub', () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Upload settings"
        }, p => {
            return uploadPreferencesToGithub(p);
        });
    });
    let download = vscode.commands.registerCommand('extension.downloadPreferencesFromGithub', () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Download settings"
        }, p => {
            return downloadPreferencesFromGithub(p);
        });
    });

    context.subscriptions.push(upload);
    context.subscriptions.push(download);
}

function getAppdataPath() : string {
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

function mkdirRec(dir: string) {
    let base = path.dirname(dir);
    if (!fs.existsSync(base)) {
        mkdirRec(base);
    }
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

type Config = {ok: boolean, url: string, localRep: string, pullBeforePush: boolean};

function getConfig() : Config {
    let vscodeprefsync = vscode.workspace.getConfiguration("vscodeprefsync");

    let config: Config = {
        ok: true,
        url: "",
        localRep: "",
        pullBeforePush: true
    };

    config.url = vscodeprefsync.get("repositoryUrl") as string;
    if (config.url === null || config.url === undefined || config.url === "") {
        vscode.window.showErrorMessage("Please provide the setting 'vscodeprefsync.repositoryUrl'");
        config.ok = false;
    }

    config.localRep = vscodeprefsync.get("localRepository") as string;
    if (config.localRep === null || config.localRep === undefined || config.localRep === "") {
        vscode.window.showErrorMessage("Please provide the setting 'vscodeprefsync.localRepository'");
        config.ok = false;
    }

    config.pullBeforePush = vscodeprefsync.get("pullBeforePush") as boolean;
    if (typeof(config.pullBeforePush) !== "boolean") {
        vscode.window.showErrorMessage("Please provide the setting 'vscodeprefsync.pullBeforePush'");
        config.ok = false;
    }

    return config;
}

async function uploadPreferencesToGithub(progress: vscode.Progress<{ message?: string; increment?: number }>) {
    let config = getConfig();
    if (!config.ok) {
        return;
    }

    try {
        progress.report({message: "get AppData path..."});
        let vscodePath = path.join(getAppdataPath(), "Code", "User");
        let settingsPath = path.join(vscodePath, "settings.json");
        let keybindingsPath = path.join(vscodePath, "keybindings.json");
        
        let parent = path.dirname(config.localRep);
        if (!fs.existsSync(parent)) {
            progress.report({message: "create local repository direcory..."});
            mkdirRec(parent);
        }
        
        let git = simpleGit(parent);
        
        // check out git repository if does not yet exist
        if (!fs.existsSync(path.join(config.localRep, ".git"))) {
            progress.report({message: "clone repository..."});
            let repName = path.basename(config.localRep);
            await git.clone(config.url, repName);
        }
        
        // change working dir
        await git.cwd(config.localRep);
        
        if (config.pullBeforePush) {
            progress.report({message: "pull..."});
            await git.pull();
        }
        
        // copy local files to repository
        progress.report({message: "copy files..."});
        let settingsPathRep = path.join(config.localRep, "settings.json");
        let keybindingsPathRep = path.join(config.localRep, "keybindings.json");
        fs.copyFileSync(settingsPath, settingsPathRep);
        fs.copyFileSync(keybindingsPath, keybindingsPathRep);

        // check if there are changes, if not, return
        {
            let changes = await git.raw(["status", "-s"]);
            if (changes === null) {
                vscode.window.showInformationMessage("Upload settings: nothing has changed, do nothing.");
                return;
            }
        }

        // find latest commit message
        progress.report({message: "calculating commit message..."});
        let commitMessage = "new version! " + new Date().toISOString();
        try {
            let res = await git.log(["-1", "--pretty=%B"]);
            let msg = res.all[0].hash;
            commitMessage = "" + (Number(msg) + 1);
        } catch (e) {}
        
        progress.report({message: "commit files..."});
        await git.add("./*");
        await git.commit(commitMessage);
        
        progress.report({message: "push..."});
        await git.push("origin", "master");

        vscode.window.showInformationMessage(`Finished uploading settings to git repository '${config.url}'`);
    }
    catch (e) {
        vscode.window.showErrorMessage(`Failed to upload settings to git repository '${config.url}': ${e}`);
    }
}

async function downloadPreferencesFromGithub(progress: vscode.Progress<{ message?: string; increment?: number }>) {
    let config = getConfig();
    if (!config.ok) {
        return;
    }

    try {
        progress.report({message: "get AppData path..."});
        let vscodePath = path.join(getAppdataPath(), "Code", "User");
        let settingsPath = path.join(vscodePath, "settings.json");
        let keybindingsPath = path.join(vscodePath, "keybindings.json");

        let parent = path.dirname(config.localRep);
        if (!fs.existsSync(parent)) {
            progress.report({message: "create local repository direcory..."});
            mkdirRec(parent);
        }

        let git = simpleGit(parent);

        // check out git repository if does not yet exist
        let justCloned = false;
        if (!fs.existsSync(path.join(config.localRep, ".git"))) {
            progress.report({message: "clone repository..."});
            let repName = path.basename(config.localRep);
            await git.clone(config.url, repName);
            justCloned = true;
        }

        // change working dir
        await git.cwd(config.localRep);

        if (!justCloned) {
            progress.report({message: "pull..."});
            await git.pull();
        }

        // copy local files to repository
            progress.report({message: "copy files..."});
        let settingsPathRep = path.join(config.localRep, "settings.json");
        let keybindingsPathRep = path.join(config.localRep, "keybindings.json");
        fs.copyFileSync(settingsPathRep, settingsPath);
        fs.copyFileSync(keybindingsPathRep, keybindingsPath);

        vscode.window.showInformationMessage(`Finished downloading settings from git repository '${config.url}'`);
    }
    catch (e) {
        vscode.window.showErrorMessage(`Failed to download settings from git repository '${config.url}': ${e}`);
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}