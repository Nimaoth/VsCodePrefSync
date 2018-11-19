
$extensionName = "vscodeprefsync"
$vscodeExtDir = "$env:USERPROFILE\.vscode\extensions"
$distDir = ".\dist\$extensionName" 

if (Test-Path "$vscodeExtDir\$extensionName") {
    Remove-Item "$vscodeExtDir\$extensionName" -Force -Recurse
}
Copy-Item $distDir $vscodeExtDir -Recurse