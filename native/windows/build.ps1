param([string]$Package, [string]$Output = "$PSScriptRoot\Concentra.exe")
$ErrorActionPreference = "Stop"
if (!$Package) {
    $Package = Join-Path $env:TEMP "Concentra.WebView2.1.0.3650.58"
    if (!(Test-Path "$Package\lib\net462\Microsoft.Web.WebView2.Core.dll")) {
        Invoke-WebRequest -UseBasicParsing "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.3650.58/microsoft.web.webview2.1.0.3650.58.nupkg" -OutFile "$Package.zip"
        Expand-Archive -LiteralPath "$Package.zip" -DestinationPath $Package -Force
    }
}
$lib = Join-Path $Package 'lib\net462'
$core = "$lib\Microsoft.Web.WebView2.Core.dll"
$forms = "$lib\Microsoft.Web.WebView2.WinForms.dll"
$loader = "$Package\runtimes\win-x64\native\WebView2Loader.dll"
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /codepage:65001 /optimize+ /platform:x64 /target:winexe "/out:$Output" /r:System.Drawing.dll /r:System.Windows.Forms.dll "/r:$core" "/r:$forms" "/resource:$core,Microsoft.Web.WebView2.Core.dll" "/resource:$forms,Microsoft.Web.WebView2.WinForms.dll" "/resource:$loader,WebView2Loader.dll" "$PSScriptRoot\Bootstrap.cs" "$PSScriptRoot\FocusWindow.cs"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar el ejecutable.' }
