# VsCodePrefSync

Visual Studio Code extension that allows you to synchronize you user settings and key bindings using git


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
