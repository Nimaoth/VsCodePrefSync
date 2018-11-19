param ([bool]$npm_install = $False)

if ($npm_install) {
    &npm install
}
&npm run compile

$targetDir = "dist/vscodeprefsync"

if (Test-Path "dist") {
    Remove-Item "dist" -Force -Recurse
}
New-Item -Path . -Name $targetDir -ItemType "directory"

Copy-Item .\node_modules $targetDir -Recurse
Copy-Item .\out $targetDir -Recurse
Copy-Item .\LICENSE $targetDir
Copy-Item .\package.json $targetDir
Copy-Item .\README.md $targetDir
Copy-Item .\CHANGELOG.md $targetDir