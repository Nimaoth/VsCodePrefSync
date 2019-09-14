'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as path from 'path';
import * as fs from 'fs';
import * as simpleGit from 'simple-git/promise';
import { getAppdataPath, mkdirRec } from './utility_functions';
import { diffResultToHtml } from './diff_parsing';

const uploadCommand = 'extension.uploadSettings';
const downloadCommand = 'extension.downloadSettings';
const changesCommand = 'extension.checkForSettingsChanges';
const revertLocalCommand = 'extension.revertLocalSettings';

const settingsFile = "settings.json";
const keybindingsFile = "keybindings.json";


let channel: vscode.OutputChannel;
let prefsyncWindow : vscode.WebviewPanel | null = null;
let extContext : vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
    extContext = context;
    channel = vscode.window.createOutputChannel("prefsync: git diff");

    registerCommand(context, uploadCommand, 'Upload settings', uploadSettings);
    registerCommand(context, downloadCommand, 'Download settings', downloadSettings);
    registerCommand(context, changesCommand, "Check for changes", checkForChanges);
    registerCommand(context, revertLocalCommand, "Revert changes", revertLocalChanges);

    vscode.commands.executeCommand(changesCommand);
}

type ProgressType = vscode.Progress<{ message?: string; increment?: number }>;

function registerCommand(context: vscode.ExtensionContext, id: string, name: string, method: (config: Config, prog: ProgressType) => Promise<void>): vscode.Disposable {
    const command = vscode.commands.registerCommand(id, async () => {
        const config = getConfig();
        if (!config.ok) {
            return;
        }

        try {
            await method(config, {
                report: function() {}
            });
        } catch (e) {
            vscode.window.showErrorMessage(`[${name}] Error occured: ${e}`);
        }
    });

    context.subscriptions.push(command);

    return command;
}

function updatePrefsSyncWindow(title: string | null, message: string) {
    const vscodeprefsync = vscode.workspace.getConfiguration("vscodeprefsync");
    const openChangesInWindow = vscodeprefsync.get("automaticallyOpenChanges");
    if (openChangesInWindow !== true) {
        return;
    }

    let assetsPath = vscode.Uri.file(path.join(extContext.extensionPath, 'assets'));

    if (prefsyncWindow === null) {
        prefsyncWindow = vscode.window.createWebviewPanel("PrefsSync", "PrefsSync", {
            preserveFocus: true,
            viewColumn: vscode.ViewColumn.Active
        }, {
            enableScripts: true
        });
        prefsyncWindow.onDidDispose(() => {
            prefsyncWindow = null;
        }, null, extContext.subscriptions);

        prefsyncWindow.webview.onDidReceiveMessage(m => {
            switch (m.command) {
                case 'check_again':
                    vscode.commands.executeCommand(changesCommand);
                    break;
                case 'upload':
                    vscode.commands.executeCommand(uploadCommand);
                    break;
                case 'download':
                    vscode.commands.executeCommand(downloadCommand);
                    break;
                case 'revert':
                    vscode.commands.executeCommand(revertLocalCommand);
                    break;
            }
        });
    }

    assetsPath = assetsPath.with({ scheme: 'vscode-resource' });

    prefsyncWindow.title = title || "PrefsSync";
    prefsyncWindow.webview.html = `<!DOCTYPE html>
    <html>
        <head>
            <meta charset="utf-8" />
            <style>
                body {
                    margin: 20px;
                }
                
                .addition {
                    color: lightgreen;
                }
                .removal {
                    color: red;
                }
                .regular {
                    
                }
                
                .code {
                    padding: 5px;
                    border: 1px solid grey;
                }
                
                code {
                    white-space: pre;
                }
                
                .files {
                    margin: 30px 0;
                }
                
                .changes {
                    margin: 10px 0;
                }
                
                ul {
                    list-style: none;
                }
                
                * {
                    font-family: monospace;
                    font-size: 20px;
                }
            </style>
        </head>
        <body>
            <button type="button" id="bCheckAgain">Check Again</button>
            <button type="button" id="bUpload">Upload</button>
            <button type="button" id="bDownload">Download</button>
            <button type="button" id="bRevert">Revert</button>

            <div>
                ${message}
            </div>

            <span id="test"></span>

            <script>
                let bCheckAgain = document.getElementById("bCheckAgain");
                let bUpload = document.getElementById("bUpload");
                let bDownload = document.getElementById("bDownload");
                let bRevert = document.getElementById("bRevert");
                let sTest = document.getElementById("test");

                const vscode = acquireVsCodeApi();

                function click(callback) {
                    return event => {
                        if (event.detail === 0) { // key pressed by enter key
                            return;
                        }
                        callback(event);
                    };
                }

                bCheckAgain.addEventListener('click', click(event => {
                    vscode.postMessage({
                        command: 'check_again'
                    });
                }));

                bDownload.addEventListener('click', click(event => {
                    vscode.postMessage({
                        command: 'download'
                    });
                }));

                bUpload.addEventListener('click', click(event => {
                    vscode.postMessage({
                        command: 'upload'
                    });
                }));

                bRevert.addEventListener('click', click(event => {
                    vscode.postMessage({
                        command: 'revert'
                    });
                }));
            </script>
        </body>
    </html>`;
    prefsyncWindow.reveal();
}

function showDiff(text: string, status: RepositoryStatus) {
    // show raw diff
    channel.clear();
    channel.append(text);

    // show nice diff
    let title = "Diff";
    switch (status) {
        case null: break;
        case undefined: break;
        default: title = "Diff: " + RepositoryStatus[status];
    }

    updatePrefsSyncWindow(title, diffResultToHtml(text, status));
}

export enum RepositoryStatus {
    UpToDate,
    Behind,
    Ahead,
    Diverged,
    Unknown
}

type Config = {
    ok: boolean,
    url: string,
    localRep: string,
    openChanges: boolean,
    project: string | null,
    gitPath: string | null,
    localFiles: string[]
};

function getConfig() : Config {
    let vscodeprefsync = vscode.workspace.getConfiguration("vscodeprefsync");
    let git = vscode.workspace.getConfiguration("git");

    let config: Config = {
        ok: true,
        url: "",
        localRep: path.join(extContext.extensionPath, "repository"),
        openChanges: false,
        project: null,
        gitPath: null,
        localFiles: []
    };

    config.url = vscodeprefsync.get("repositoryUrl") as string;
    if (config.url === null || config.url === undefined || config.url === "") {
        vscode.window.showErrorMessage("Please provide the setting 'vscodeprefsync.repositoryUrl'");
        config.ok = false;
    }

    const rep = vscodeprefsync.get("localRepository") as string;
    if (rep !== null && rep !== undefined && rep !== "") {
        config.localRep = rep;
    }

    const gitPath = git.get("path") as string;
    if (gitPath !== null && gitPath !== undefined && gitPath !== "") {
        config.gitPath = gitPath;
    }

    const project = vscodeprefsync.get<string|null>("project");
    if (project === undefined) {
        config.project = null; 
    } else {
        config.project = project;
    }

    const lf = vscodeprefsync.get<string[]|null>("files");
    if (lf !== undefined) {
        config.localFiles = lf as string[];
    }

    config.openChanges = vscodeprefsync.get("automaticallyOpenChanges") as boolean;

    return config;
}

async function getRepositoryStatus(git: simpleGit.SimpleGit, progress: ProgressType | null) : Promise<RepositoryStatus> {
    try {
        let local = await git.revparse(["@"]);
        let remote = await git.revparse(["@{u}"]);
        let base = await git.raw(["merge-base", "@", "@{u}"]);

        // tslint:disable-next-line:triple-equals
        if (local != null) {
            local = local.trim();
        }
        // tslint:disable-next-line:triple-equals
        if (remote != null) {
            remote = remote.trim();
        }
        // tslint:disable-next-line:triple-equals
        if (base != null) {
            base = base.trim();
        }

        if (local === null || remote === null || base === null) {
            return RepositoryStatus.Unknown;
        }

        let status = RepositoryStatus.Diverged;
        if (local === remote) {
            status = RepositoryStatus.UpToDate;
        } else if (local === base) {
            status = RepositoryStatus.Behind;
        } else if (remote === base) {
            status = RepositoryStatus.Ahead;
        }

        return status;
    } catch (e) {
        return RepositoryStatus.Unknown;
    }
}

/**
 * clone repository if it does not yet exists
 */
async function getLocalRepository(config: Config, progress: ProgressType | null) : Promise<simpleGit.SimpleGit> {
    let parent = path.dirname(config.localRep);
    if (!fs.existsSync(parent)) {
        if (progress !== null) {
            progress.report({message: "create local repository directory..."});
        }
        mkdirRec(parent);
    }

    let git = simpleGit(parent);

    if (config.gitPath !== null) {
        git = git.customBinary(config.gitPath);
    }

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

    if (!justCloned) {
        if (progress !== null) {
            progress.report({message: "fetching..."});
        }
        await git.fetch();
    }

    return git;
}

function copyFile(from: string, to: string) {
    if (fs.existsSync(from)) {
        const dir = path.dirname(to);
        if (!fs.existsSync(dir)) {
            mkdirRec(dir);
        }
        fs.copyFileSync(from, to);
    } else if (fs.existsSync(to)) {
        fs.unlinkSync(to);
    }
}

// copy user settings and optional workspace settings from local machine to repository
function copyLocalFilesToRep(config: Config, progress: ProgressType | null) {
    if (progress !== null) {
        progress.report({message: "copy files..."});
    }

    const vscodePath = path.join(getAppdataPath(), "Code", "User");

    const usrSettings     = path.join(vscodePath, settingsFile);
    const usrKeybingdings = path.join(vscodePath, keybindingsFile);
    copyFile(usrSettings, path.join(config.localRep, settingsFile));
    copyFile(usrKeybingdings, path.join(config.localRep, keybindingsFile));

    if (config.project !== null && vscode.workspace.workspaceFolders !== undefined) {
        const wsVscode       = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, ".vscode");
        const wsSettings     = path.join(wsVscode, settingsFile);

        const repProject     = path.join(config.localRep, config.project);
        const repSettings    = path.join(repProject, settingsFile);

        copyFile(wsSettings, repSettings);

        for (const file of config.localFiles) {
            const from = path.join(wsVscode, file);
            const to = path.join(repProject, file);
            copyFile(from, to);
        }
    }
}

// copy user settings and optional workspace settings from repository to local machine
function copyRepFilesToLocal(config: Config, progress: ProgressType | null) {
    if (progress !== null) {
        progress.report({message: "copy files..."});
    }

    const vscodePath = path.join(getAppdataPath(), "Code", "User");
    const usrSettings     = path.join(vscodePath, settingsFile);
    const usrKeybingdings = path.join(vscodePath, keybindingsFile);

    copyFile(path.join(config.localRep, settingsFile), usrSettings);
    copyFile(path.join(config.localRep, keybindingsFile), usrKeybingdings);

    if (config.project !== null && vscode.workspace.workspaceFolders !== undefined) {
        const wsVscode       = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, ".vscode");
        const wsSettings     = path.join(wsVscode, settingsFile);

        const repProject     = path.join(config.localRep, config.project);
        const repSettings    = path.join(repProject, settingsFile);

        copyFile(repSettings, wsSettings);

        for (const file of config.localFiles) {
            const from = path.join(repProject, file);
            const to = path.join(wsVscode, file);
            copyFile(from, to);
        }
    }
}

async function revertLocalChanges(config: Config, progress: ProgressType) {
    const git = await getLocalRepository(config, progress);

    progress.report({message: "resetting ..."});
    await git.reset(["--hard", "@{u}"]);

    copyRepFilesToLocal(config, progress);

    if (prefsyncWindow !== null) {
        updatePrefsSyncWindow(null, "Your settings are up to date.");
    }
}

async function diffLocalToRemote(git: simpleGit.SimpleGit, status: RepositoryStatus) {
    const diff = await git.diff(["--src-prefix=local/", "--dst-prefix=remote/", "@", "@{u}"]);
    showDiff(diff, status);
}

async function diffRemoteToLocal(git: simpleGit.SimpleGit, status: RepositoryStatus) {
    const diff = await git.diff(["--src-prefix=remote/", "--dst-prefix=local/", "@{u}", "@"]);
    showDiff(diff, status);
}

async function checkForChanges(config: Config, progress: ProgressType) {
    const git = await getLocalRepository(config, progress);

    progress.report({message: "Syncing VSCode folder with local repository..."});
    copyLocalFilesToRep(config, progress);
    const changes = await git.raw(["status", "-s"]);
    if (changes !== null) {
        git.add("./*");
        await git.commit("[auto] sync local files");
    }

    // check status
    const status = await getRepositoryStatus(git, progress);

    switch (status) {
    case RepositoryStatus.Unknown:
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Failed to get status of local settings.");
        } else {
            vscode.window.showWarningMessage("[Check for changes] Failed to get status of local settings.");
        }
        break;

    case RepositoryStatus.UpToDate:
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        }
        break;

    case RepositoryStatus.Behind:
        if (config.openChanges) {
            diffLocalToRemote(git, status);
        } else {
            vscode.window.showInformationMessage("[Check for changes] There are changes on the remote repository.");
        }
        break;

    case RepositoryStatus.Ahead:
        if (config.openChanges) {
            await diffRemoteToLocal(git, status);
        } else {
            vscode.window.showInformationMessage("[Check for changes] There are local changes.");
        }
        await git.reset(["HEAD~1"]);
        break;

    case RepositoryStatus.Diverged:
        if (config.openChanges) {
            await diffRemoteToLocal(git, status);
        }
        else {
            vscode.window.showInformationMessage("[Check for changes] There are changes on both the local and remote repository. Please resolve these issues manually.");
        }
        await git.reset(["HEAD~1"]);
        break;
    }
}

async function uploadSettings(config: Config, progress: ProgressType) {
    const git = await getLocalRepository(config, progress);

    progress.report({message: "Syncing VSCode folder with local repository..."});
    copyLocalFilesToRep(config, progress);
    const changes = await git.raw(["status", "-s"]);
    if (changes !== null) {
        git.add("./*");
        await git.commit("[auto] sync local files");
    }

    // check status
    const status = await getRepositoryStatus(git, progress);

    switch (status) {
    case RepositoryStatus.UpToDate:
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        }
        return;

    case RepositoryStatus.Behind:
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "There are no local changes, but remote changes. Consider downloading the newest settings.");
        } else {
            vscode.window.showInformationMessage("[Upload settings] There are no local changes, but remote changes. Consider downloading the newest settings.");
        }
        return;

    case RepositoryStatus.Diverged: {
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your local settings have diverged from the remote repository. Please manually merge your settings with your local repository.");
        }
        vscode.window.showWarningMessage("[Upload settings] Your local settings have diverged from the remote repository. Please manually merge your settings with your local repository.");
        await git.reset(["HEAD~1"]);
        return;
    }

    case RepositoryStatus.Unknown:
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Failed to get status of local settings.");
        } else {
            vscode.window.showWarningMessage("[Upload settings] Failed to get status of local settings.");
        }
        // fallthrough

    case RepositoryStatus.Ahead: {
        if (config.openChanges) {
            await diffRemoteToLocal(git, status);
        }

        // get commit message
        const commitMessage = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: "commit message"
        });

        if (commitMessage === undefined) {
            await git.reset(["--hard", "HEAD~1"]);
            return;
        }

        // rename temp commit
        await git.raw(["commit", "--amend", "-m", commitMessage]);

        // push new settings
        progress.report({message: "pushing..."});
        await git.push("origin", "master");
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        }
    }
    }
}

async function downloadSettings(config: Config, progress: ProgressType) {
    const git = await getLocalRepository(config, progress);

    progress.report({message: "Syncing VSCode folder with local repository..."});
    copyLocalFilesToRep(config, progress);
    const changes = await git.raw(["status", "-s"]);
    if (changes !== null) {
        git.add("./*");
        await git.commit("[auto] sync local files");
    }

    const status = await getRepositoryStatus(git, progress);
    switch (status) {
    case RepositoryStatus.UpToDate:
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        }
        return;

    case RepositoryStatus.Ahead:
        await git.reset(["HEAD~1"]);
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "There are no remote changes, but you have local changes. Consider uploading your settings.");
        } else {
            vscode.window.showInformationMessage("[Download settings] There are no remote changes, but you have local changes. Consider uploading your settings.");
        }
        return;

    case RepositoryStatus.Diverged:
        vscode.window.showErrorMessage("[Download settings] Your local settings have diverged from the remote repository. There is nothing I can do.");
        await git.reset(["HEAD~1"]);
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your local settings have diverged from the remote repository. There is nothing I can do.");
        }
        return;

    case RepositoryStatus.Unknown:
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Failed to get status of local settings.");
        } else {
            vscode.window.showWarningMessage("[Download settings] Failed to get status of local settings.");
        }
        // fallthrough

    case RepositoryStatus.Behind:
        if (config.openChanges) {
            await diffLocalToRemote(git, status);
        }

        const incomingChangeMessage = await git.raw(["log", "@..@{u}", "--pretty=format:%s"]);

        // merge
        progress.report({message: "merging..."});
        await git.merge(["origin/master"]);
        copyRepFilesToLocal(config, progress);

        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        } else {
            vscode.window.showInformationMessage(`[Download settings] Finished downloading settings from git repository '${config.url}': ${incomingChangeMessage}`);
        }
        break;
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
    channel.dispose();
}