# VsCodePrefSync

Visual Studio Code extension that allows you to upload and download you user settings and key bindigs to a get repository


## Features

This extension adds two commands:
- Upload your Preferences and Keybindings to a git repository (`extension.uploadPreferencesToGithub`)
- Download Preferences and Keybindings from a git repository (`extension.downloadPreferencesFromGithub`)

The upload command takes your global user settings (settings.json) and key bindings (keybindings.json), copies them to a local copy of your specified git repository and then commits and pushes this repository.

The download command clones the remote repository (or just performs a `git pull` if the repository was already cloned), and then copies the `settings.json` and `keybindings.json` to your Visual Studio Code directory.

## Extension Settings


This extension contributes the following settings:

* `vscodeprefsync.repositoryUrl`: url of the remote repository
* `vscodeprefsync.localRepository`: path where the extension shoud clone the remote repository
* `vscodeprefsync.pullBeforePush`: if true, the extension pulls before pushing changes

## Known Issues

So far nothing.

## Release Notes


### 0.0.1

Initial release of VsCodePrefSync
