$ErrorActionPreference = 'Stop'

$installDir = Join-Path $env:LOCALAPPDATA 'WithLittleBridge'
$bridgePath = Join-Path $installDir 'withlittle_bridge.py'
$branch = 'feature/withlittle-windows-bridge'
$downloadUrl = "https://raw.githubusercontent.com/kstring00/withlittle.com/$branch/windows-bridge/withlittle_bridge.py"

Write-Host ''
Write-Host 'WITH LITTLE WINDOWS BRIDGE' -ForegroundColor Magenta
Write-Host 'Installing the cloud-to-Rainmeter bridge...' -ForegroundColor Gray
Write-Host ''

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Invoke-WebRequest -Uri $downloadUrl -OutFile $bridgePath -UseBasicParsing

$pythonCandidates = @(
    'C:\Users\strin\Downloads\KyleOS_v3_Qt_Clean_Installer\.build-tools\python\pythonw.exe',
    'C:\Users\strin\Downloads\KyleOS_v3_Qt_Clean_Installer\.build-tools\python\python.exe',
    (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\pythonw.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\pythonw.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\pythonw.exe')
)

$python = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $python) {
    $command = Get-Command pythonw.exe -ErrorAction SilentlyContinue
    if (-not $command) { $command = Get-Command python.exe -ErrorAction SilentlyContinue }
    if ($command) { $python = $command.Source }
}
if (-not $python) {
    throw 'Python was not found. The KyleOS bundled Python or a normal Python installation is required.'
}

$configPath = Join-Path $installDir 'config.json'
$resources = 'C:\Users\strin\OneDrive\Documentos\Rainmeter\Skins\KyleCommandCenter\@Resources'
$config = @{
    resources_dir = $resources
    rainmeter_exe = 'C:\Program Files\Rainmeter\Rainmeter.exe'
    habit_config = 'KyleCommandCenter\HabitMomentum'
    poll_seconds = 60
} | ConvertTo-Json
Set-Content -LiteralPath $configPath -Value $config -Encoding utf8

$taskName = 'With Little Rainmeter Bridge'
$arguments = '"' + $bridgePath + '"'
$action = New-ScheduledTaskAction -Execute $python -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Keeps With Little data synchronized with KyleOS Rainmeter widgets.' -Force | Out-Null

Write-Host 'Bridge files installed.' -ForegroundColor Green
Write-Host 'A browser will open so you can pair this computer with With Little.' -ForegroundColor Cyan
Write-Host ''

& $python $bridgePath --pair
if ($LASTEXITCODE -ne 0) {
    throw 'Pairing was not completed. Run this installer again while signed in to With Little.'
}

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3

Write-Host ''
Write-Host 'WITH LITTLE BRIDGE INSTALLED' -ForegroundColor Green
Write-Host "Rainmeter data folder: $resources" -ForegroundColor Gray
Write-Host "Bridge log: $(Join-Path $installDir 'bridge.log')" -ForegroundColor Gray
Write-Host 'The bridge now updates Habit Momentum every 60 seconds and starts with Windows.' -ForegroundColor Gray
