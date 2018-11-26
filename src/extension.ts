'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as path from 'path';
import * as fs from 'fs';
import * as simpleGit from 'simple-git/promise';
import { getAppdataPath, mkdirRec } from "./utility_functions";

const uploadCommand = 'extension.uploadSettingsToGithub';
const downloadCommand = 'extension.downloadSettingsFromGithub';
const changesCommand = 'extension.checkForSettingsChanges';
const quickChangesCommand = 'extension.quickCheckForSettingsChanges';

const settingsFile = "settings.json";
const keybindingsFile = "keybindings.json";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    registerCommand(context, uploadCommand, 'Upload settings', uploadSettingsToGithub);
    registerCommand(context, downloadCommand, 'Download settings', downloadSettingsFromGithub);
    registerCommand(context, changesCommand, "Check for changes", checkForChanges(true));
    registerCommand(context, quickChangesCommand, "Quick Check for changes", checkForChanges(false));


    vscode.commands.executeCommand(changesCommand);
}

type ProgressType = vscode.Progress<{ message?: string; increment?: number }>;

function registerCommand(context: vscode.ExtensionContext, id: string, name: string, method: (prog: ProgressType) => Promise<void>): vscode.Disposable {
    const command = vscode.commands.registerCommand(id, () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: name
        }, p => {
            return method(p);
        });
    });

    context.subscriptions.push(command);

    return command;
}


type Config = {
    ok: boolean,
    url: string,
    localRep: string,
    pullBeforePush: boolean
};

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

async function checkOutRepository(config: Config, progress: ProgressType | null, pull: boolean = true) : Promise<simpleGit.SimpleGit> {
    let parent = path.dirname(config.localRep);
    if (!fs.existsSync(parent)) {
        if (progress !== null) {
            progress.report({message: "create local repository directory..."});
        }
        mkdirRec(parent);
    }

    const git = simpleGit(parent);

    // check out git repository if does not yet exist
    let justCloned = false;
    if (!fs.existsSync(path.join(config.localRep, ".git"))) {
        if (progress !== null) {
            progress.report({message: "clone repository..."});
        }
        let repName = path.basename(config.localRep);
        await git.clone(config.url, repName);
        justCloned = true;
    }

    // change working dir
    await git.cwd(config.localRep);

    if (!justCloned && pull) {
        if (progress !== null) {
            progress.report({message: "pull..."});
        }
        await git.pull();
    }

    return git;
}

function copyLocalFilesToRep(config: Config, progress: ProgressType | null) {
    if (progress !== null) {
        progress.report({message: "copy files..."});
    }

    const vscodePath = path.join(getAppdataPath(), "Code", "User");

    fs.copyFileSync(path.join(vscodePath,       settingsFile),
                    path.join(config.localRep,  settingsFile));
    fs.copyFileSync(path.join(vscodePath,       keybindingsFile),
                    path.join(config.localRep,  keybindingsFile));
}

function copyRepFilesToLocal(config: Config, progress: ProgressType | null) {
    if (progress !== null) {
        progress.report({message: "copy files..."});
    }

    const vscodePath = path.join(getAppdataPath(), "Code", "User");

    fs.copyFileSync(path.join(config.localRep,  settingsFile),
                    path.join(vscodePath,       settingsFile));
    fs.copyFileSync(path.join(config.localRep,  keybindingsFile),
                    path.join(vscodePath,       keybindingsFile));
}

function checkForChanges(pull: boolean) : (_: ProgressType) => Promise<void> {
    return async function(progress: ProgressType) {
        const config = getConfig();
        if (!config.ok) {
            return;
        }

        try {
            progress.report({message: "Checking for changes in settings..."});

            const git = await checkOutRepository(config, progress, pull);
            copyLocalFilesToRep(config, progress);

            // check if there are changes, if not, return
            progress.report({message: "search for changes..."});
            const changes = await git.raw(["status", "-s"]);
            if (changes === null) {
                vscode.window.showInformationMessage("Check for changes: Settings are up to date.");
            }
            else {
                const lines = changes.split(/\n/);
                let files: string[] = [];
                for (const line of lines) {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length === 2) {
                        files.push(parts[1]);
                    }
                }

                files.push("Show Changes");

                const selection = await vscode.window.showInformationMessage("Check for changes: Settings have changes.", ...files);
                switch (selection) {
                case "Show Changes":
                    progress.report({message: "diffing..."});
                    const diff = await git.diff();
                    const doc = await vscode.workspace.openTextDocument({ content: diff });
                    vscode.window.showTextDocument(doc);
                    break;

                case "settings.json":
                    vscode.commands.executeCommand('workbench.action.openSettings');
                    break;

                case "keybindings.json":
                    vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
                    break;
                }
            }
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to check for changes to repository '${config.url}': ${e}`);
        }
    };
}

async function uploadSettingsToGithub(progress: ProgressType) {
    const config = getConfig();
    if (!config.ok) {
        return;
    }

    try {
        const commitMessage = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: "commit message"
        });

        if (commitMessage === undefined) {
            vscode.window.showInformationMessage("Canceled upload of configuration");
            return;
        }

        const git = await checkOutRepository(config, progress, true);
        copyLocalFilesToRep(config, progress);

        // check if there are changes, if not, return
        {
            const changes = await git.raw(["status", "-s"]);
            if (changes === null) {
                vscode.window.showInformationMessage("Upload settings: nothing has changed, do nothing.");
                return;
            }
        }

        // commit and push
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

async function downloadSettingsFromGithub(progress: ProgressType) {
    const config = getConfig();
    if (!config.ok) {
        return;
    }

    try {
        await checkOutRepository(config, progress, true);
        copyRepFilesToLocal(config, progress);
        vscode.window.showInformationMessage(`Finished downloading settings from git repository '${config.url}'`);
    }
    catch (e) {
        vscode.window.showErrorMessage(`Failed to download settings from git repository '${config.url}': ${e}`);
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
}