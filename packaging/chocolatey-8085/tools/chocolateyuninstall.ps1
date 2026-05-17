$ErrorActionPreference = 'Stop'
$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Chocolatey's Install-ChocolateyZipPackage tracks the extracted files
# via the registry; Uninstall-ChocolateyZipPackage matches the
# packageName + zipFileName pair and removes them.
Uninstall-ChocolateyZipPackage -PackageName 'm85' -ZipFileName 'm85-windows-x86_64.zip'
