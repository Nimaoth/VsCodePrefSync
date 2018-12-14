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

# Getting Started
To use this extension follow these steps
1. Create a GitHub/GitLab repository (or whatever you want)
2. Install the extension
3. Go to your user settings
4. Set `vscodeprefsync.repositoryUrl` to the url of the repository you created
5. Upload you settings/keybindings using the command `prefsync: Upload your settings and keybindings to a git repository`
