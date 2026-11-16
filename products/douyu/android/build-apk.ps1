param(
    [Parameter(Mandatory)][string]$SdkRoot,
    [Parameter(Mandatory)][string]$JavaHome,
    [string]$OutputPath = (Join-Path $PSScriptRoot '..\豆屿拼豆工作室-Android.apk')
)

$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = $JavaHome
$env:Path = "$(Join-Path $JavaHome 'bin');$env:Path"
$tools = Join-Path $SdkRoot 'build-tools/35.0.0'
$platform = Join-Path $SdkRoot 'platforms/android-35/android.jar'
$work = Join-Path ([IO.Path]::GetTempPath()) ("douyu-android-" + [guid]::NewGuid())
$webRoot = Join-Path $PSScriptRoot '../dist'
$keyDir = Join-Path $env:LOCALAPPDATA 'DouyuAndroidSigning'

function Run([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

New-Item -ItemType Directory -Force -Path "$work/res/drawable", "$work/assets/web", "$work/classes", "$work/dex", $keyDir | Out-Null
try {
    foreach ($name in 'index.html','style.css','core.js','palettes.js','touch.js','app.js','mobile.js','palette-licenses.txt') {
        Copy-Item -LiteralPath (Join-Path $webRoot $name) -Destination "$work/assets/web"
    }
    $indexPath = "$work/assets/web/index.html"
    $index = [IO.File]::ReadAllText($indexPath) -replace '<link rel="(?:manifest|apple-touch-icon)"[^>]+>', ''
    [IO.File]::WriteAllText($indexPath, $index)
    Copy-Item -LiteralPath (Join-Path $webRoot 'icons/icon-192.png') -Destination "$work/res/drawable/douyu_icon.png"
    Run "$tools/aapt2.exe" @('compile','--dir',"$work/res",'-o',"$work/res.zip")
    Run "$tools/aapt2.exe" @('link','-I',$platform,'--manifest',"$PSScriptRoot/AndroidManifest.xml",
        '-A',"$work/assets",'-o',"$work/base.apk",'-R',"$work/res.zip")
    Run "$JavaHome/bin/javac.exe" @('-encoding','UTF-8','--release','8',
        '-classpath',$platform,'-d',"$work/classes","$PSScriptRoot/MainActivity.java")
    Run "$JavaHome/bin/jar.exe" @('cf',"$work/classes.jar",'-C',"$work/classes",'.')
    Run "$tools/d8.bat" @('--min-api','26','--lib',$platform,'--output',"$work/dex","$work/classes.jar")
    Run "$JavaHome/bin/jar.exe" @('uf',"$work/base.apk",'-C',"$work/dex",'classes.dex')
    Run "$tools/zipalign.exe" @('-f','4',"$work/base.apk","$work/aligned.apk")

    $keyFile = Join-Path $keyDir 'douyu.jks'
    $passFile = Join-Path $keyDir 'signing-password.txt'
    if (!(Test-Path -LiteralPath $keyFile)) {
        if (!(Test-Path -LiteralPath $passFile)) {
            [IO.File]::WriteAllText($passFile, [guid]::NewGuid().ToString('N') + [Environment]::NewLine)
        }
        Run "$JavaHome/bin/keytool.exe" @('-genkeypair','-keystore',$keyFile,'-alias','douyu',
            '-storepass:file',$passFile,'-keypass:file',$passFile,'-dname','CN=Douyu Offline',
            '-keyalg','RSA','-keysize','2048','-validity','10000','-noprompt')
    }
    Run "$tools/apksigner.bat" @('sign','--ks',$keyFile,'--ks-pass',"file:$passFile",
        '--ks-key-alias','douyu','--v4-signing-enabled','false',
        '--out',$OutputPath,"$work/aligned.apk")
    Run "$tools/apksigner.bat" @('verify','--verbose',$OutputPath)
    Run "$tools/zipalign.exe" @('-c','4',$OutputPath)
} finally {
    $resolved = (Resolve-Path -LiteralPath $work).Path
    $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolved.StartsWith($temp, [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolved).StartsWith('douyu-android-')) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
