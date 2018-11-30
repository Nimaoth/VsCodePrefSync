'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import * as path from 'path';
import * as fs from 'fs';
import * as simpleGit from 'simple-git/promise';
import { getAppdataPath, mkdirRec } from './utility_functions';
import { diffResultToHtml } from './diff_parsing';

const uploadCommand = 'extension.uploadSettingsToGithub';
const downloadCommand = 'extension.downloadSettingsFromGithub';
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

    registerCommand(context, uploadCommand, 'Upload settings', uploadSettingsToGithub);
    registerCommand(context, downloadCommand, 'Download settings', downloadSettingsFromGithub);
    registerCommand(context, changesCommand, "Check for changes", checkForChanges);
    registerCommand(context, revertLocalCommand, "Revert changes", revertLocalChanges);


    vscode.commands.executeCommand(changesCommand);
}

type ProgressType = vscode.Progress<{ message?: string; increment?: number }>;

function registerCommand(context: vscode.ExtensionContext, id: string, name: string, method: (config: Config, prog: ProgressType) => Promise<void>): vscode.Disposable {
    const command = vscode.commands.registerCommand(id, () => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: name
        }, async function(p) {
            const config = getConfig();
            if (!config.ok) {
                return;
            }

            try {
                await method(config, p);
            } catch (e) {
                vscode.window.showErrorMessage(`[${name}] Error occured: ${e}`);
            }
        });
    });

    context.subscriptions.push(command);

    return command;
}

function updatePrefsSyncWindow(title: string | null, message: string) {
    let assetsPath = vscode.Uri.file(path.join(extContext.extensionPath, 'assets'));

    if (prefsyncWindow === null) {
        prefsyncWindow = vscode.window.createWebviewPanel("PrefsSync", "PrefsSync", {
            preserveFocus: true,
            viewColumn: vscode.ViewColumn.Active
        }, {
            enableScripts: true,
            localResourceRoots: [
                assetsPath
            ]
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
            <link rel="stylesheet" type="text/css" media="screen" href="${path.join(assetsPath.toString(), 'diff_view/diff_view.css')}" />
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

            <script src="${path.join(assetsPath.toString(), 'diff_view/diff_view.js')}"></script>
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
    Diverged
}

type Config = {
    ok: boolean,
    url: string,
    localRep: string,
    pullBeforePush: boolean,
    openChanges: boolean
};

function getConfig() : Config {
    let vscodeprefsync = vscode.workspace.getConfiguration("vscodeprefsync");

    let config: Config = {
        ok: true,
        url: "",
        localRep: "",
        pullBeforePush: true,
        openChanges: false
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

    config.openChanges = vscodeprefsync.get("automaticallyOpenChanges") as boolean;

    return config;
}

async function getRepositoryStatus(git: simpleGit.SimpleGit, progress: ProgressType | null) : Promise<RepositoryStatus> {
    const local = (await git.revparse(["@"])).trim();
    const remote = (await git.revparse(["@{u}"])).trim();
    const base = (await git.raw(["merge-base", "@", "@{u}"])).trim();

    let status = RepositoryStatus.Diverged;
    if (local === remote) {
        status = RepositoryStatus.UpToDate;
    } else if (local === base) {
        status = RepositoryStatus.Behind;
    } else if (remote === base) {
        status = RepositoryStatus.Ahead;
    }

    return status;
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

    if (!justCloned) {
        if (progress !== null) {
            progress.report({message: "fetching..."});
        }
        await git.fetch();
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

async function revertLocalChanges(config: Config, progress: ProgressType) {
    const git = await getLocalRepository(config, progress);

    progress.report({message: "resetting ..."});
    await git.reset(["--hard", "@{u}"]);

    copyRepFilesToLocal(config, progress);

    if (prefsyncWindow !== null) {
        updatePrefsSyncWindow(null, "Your settings are up to date.");
    }
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
    case RepositoryStatus.UpToDate:
        vscode.window.showInformationMessage("[Check for changes] There are no local changes.");
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        }
        break;

    case RepositoryStatus.Behind:
        if (config.openChanges) {
            const diff = await git.diff(["--src-prefix=local/", "--dst-prefix=remote/", "@", "@{u}"]);
            showDiff(diff, status);
        }
        vscode.window.showInformationMessage("[Check for changes] There are changes on the remote repository.");
        break;

    case RepositoryStatus.Ahead:
        if (config.openChanges) {
            const diff = await git.diff(["--src-prefix=remote/", "--dst-prefix=local/", "@{u}", "@"]);
            showDiff(diff, status);
        }
        vscode.window.showInformationMessage("[Check for changes] There are local changes.");
        await git.reset(["HEAD~1"]);
        break;

    case RepositoryStatus.Diverged:
        if (config.openChanges) {
            const diff = await git.diff(["--src-prefix=remote/", "--dst-prefix=local/", "@{u}", "@"]);
            showDiff(diff, status);
        }
        vscode.window.showInformationMessage("[Check for changes] There are changes on both the local and remote repository. Please resolve these issues manually.");
        await git.reset(["HEAD~1"]);
        break;
    }
}

async function uploadSettingsToGithub(config: Config, progress: ProgressType) {
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
        vscode.window.showInformationMessage("[Upload settings] There are no local changes.");
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        }
        return;

    case RepositoryStatus.Behind:
        vscode.window.showInformationMessage("[Upload settings] There are no local changes, but remote changes. Consider downloading the newest settings.");
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "There are no local changes, but remote changes. Consider downloading the newest settings.");
        }
        return;

    case RepositoryStatus.Diverged: {
        vscode.window.showWarningMessage("[Upload settings] Your local settings have diverged from the remote repository. Please manually merge your settings with your local repository.");
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your local settings have diverged from the remote repository. Please manually merge your settings with your local repository.");
        }
        await git.reset(["HEAD~1"]);
        return;
    }

    case RepositoryStatus.Ahead: {
        if (config.openChanges) {
            const diff = await git.diff(["--src-prefix=remote/", "--dst-prefix=local/", "@{u}", "@"]);
            await showDiff(diff, status);
        }

        // get commit message
        const commitMessage = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: "commit message"
        });

        if (commitMessage === undefined) {
            await git.reset(["--hard", "HEAD~1"]);
            vscode.window.showInformationMessage("Upload settings: Canceled upload of configuration");
            return;
        }

        // rename temp commit
        await git.raw(["commit", "--amend", "-m", commitMessage]);

        // push new settings
        progress.report({message: "pushing..."});
        await git.push("origin", "master");
        vscode.window.showInformationMessage(`Finished uploading settings to git repository '${config.url}'`);
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        }
    }
    }
}

async function downloadSettingsFromGithub(config: Config, progress: ProgressType) {
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
        vscode.window.showInformationMessage("[Download settings] There are no remote changes.");
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        }
        return;

    case RepositoryStatus.Ahead:
        vscode.window.showInformationMessage("[Download settings] There are no remote changes, but you have local changes. Consider uploading your settings.");
        await git.reset(["HEAD~1"]);
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "There are no remote changes, but you have local changes. Consider uploading your settings.");
        }
        return;

    case RepositoryStatus.Diverged:
        vscode.window.showErrorMessage("[Download settings] Your local settings have diverged from the remote repository. There is nothing I can do.");
        await git.reset(["HEAD~1"]);
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your local settings have diverged from the remote repository. There is nothing I can do.");
        }
        return;

    case RepositoryStatus.Behind:
        if (config.openChanges) {
            const diff = await git.diff(["--src-prefix=local/", "--dst-prefix=remote/", "@", "@{u}"]);
            await showDiff(diff, status);
        }

        const incomingChangeMessage = await git.raw(["log", "@..@{u}", "--pretty=format:%s"]);

        // merge
        progress.report({message: "merging..."});
        await git.merge(["origin/master"]);
        copyRepFilesToLocal(config, progress);

        vscode.window.showInformationMessage(`[Download settings] Finished downloading settings from git repository '${config.url}': ${incomingChangeMessage}`);
        if (prefsyncWindow !== null) {
            updatePrefsSyncWindow(null, "Your settings are up to date.");
        }
        break;
    }
}

// this method is called when your extension is deactivated
export function deactivate() {
    channel.dispose();
}