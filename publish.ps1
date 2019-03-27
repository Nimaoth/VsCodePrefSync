
$extensionName = "vscodeprefsync"
$vscodeExtDir = "$env:USERPROFILE\.vscode\extensions"
$distDir = ".\dist\$extensionName" 

vsce package
if ($LASTEXITCODE -eq 0) {
    vsce publish
    Write-Host "Done."
}
