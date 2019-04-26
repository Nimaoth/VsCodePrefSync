# VsCodePrefSync

Visual Studio Code extension that allows you to synchronize you user settings and key bindings using git

[Download here](https://marketplace.visualstudio.com/items?itemName=Nimaoth.vscodeprefsync)


## Features

This extension adds the following commands:
- prefsync: Upload your settings and keybindings to a git repository (`extension.uploadSettings`)
- prefsync: Download settings and keybindings from a git repository (`extension.downloadSettings`)
- prefsync: Check for changes in current Settings (`extension.checkForSettingsChanges`)
- prefsync: Revert local settings to remote (`extension.revertLocalSettings`)

## Extension Settings

This extension contributes the following settings:


* `vscodeprefsync.repositoryUrl`: Url of the git repository to use for syncing settings
* `vscodeprefsync.localRepository`: Where to check out the repository
* `vscodeprefsync.automaticallyOpenChanges`: Open the result from a git diff in an editor window after downloading settings or checking for changes
* `vscodeprefsync.project`: Unique name. If you want to sync settings.json or other files in your local .vscode directory then provide this setting in your local .vscode/settings.json
* `vscodeprefsync.files`: Array of strings. Additional files to be synchronized from your local .vscode folder. You must provide the setting 'vscodeprefsync.project' for this to work

# Getting Started
To use this extension follow these steps
1. Create a GitHub/GitLab repository (or whatever you want)
2. Install the extension
3. Go to your user settings
4. Set `vscodeprefsync.repositoryUrl` to the url of the repository you created
5. Upload you settings/keybindings using the command `prefsync: Upload your settings and keybindings to a git repository`

# Synchronizing files in .vscode
If you are using a version control system and `.vscode` is already part of that you shouldn't need to do this, but if you want to synchronize your local settings file or other files in the `.vscode` directory follow these steps:

1. Add the `vscodeprefsync.project` to your local settings file and specify a name (e.g. name of your project)
2. Specify all files in `.vscode` that you want to synchronize as a string array for the setting `vscodeprefsync.files` (`settings.json` will automatically be synchronized and doesn't have to be specified here)
3. Upload your settings.
4. Add the setting `vscodeprefsync.project` to your local settings file on other computers that you want to synchronize with.
