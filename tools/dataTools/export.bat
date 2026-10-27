@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

REM 改完 config/luban/Datas/*.xlsx 后执行：
REM   tools\dataTools\export.bat
REM 使用官方 Luban.dll（dotnet）导出 typescript-json + json。

set "DATA_TOOLS=%~dp0"
set "DATA_TOOLS=%DATA_TOOLS:~0,-1%"

for %%I in ("%DATA_TOOLS%\..\..") do set "PROJECT_ROOT=%%~fI"

if exist "%DATA_TOOLS%\config.local.bat" call "%DATA_TOOLS%\config.local.bat"

if not defined LUBAN_ROOT set "LUBAN_ROOT=%PROJECT_ROOT%\config\luban"
if not defined LUBAN_DIR set "LUBAN_DIR=D:\Custom\XPHero\Lib"
if not defined CODE_OUT set "CODE_OUT=%PROJECT_ROOT%\assets\scripts\config\luban\code"
if not defined DATA_OUT set "DATA_OUT=%PROJECT_ROOT%\assets\resources\config\luban"
set "DATA_TOOLS_SCRIPTS=%PROJECT_ROOT%\tools\dataTools\scripts"

set "PATH=%USERPROFILE%\.dotnet;%PATH%"

if not exist "%LUBAN_ROOT%\Datas\" (
  echo Error: missing %LUBAN_ROOT%\Datas
  exit /b 1
)

where dotnet >nul 2>&1
if errorlevel 1 (
  echo Error: .NET 8 SDK/runtime required ^(dotnet not found^)
  exit /b 1
)

if not exist "%LUBAN_DIR%\Luban\Luban.dll" (
  echo Error: missing %LUBAN_DIR%\Luban\Luban.dll
  exit /b 1
)

echo [1/2] Luban export ^(typescript-json + json^)
echo   conf: %LUBAN_ROOT%\luban.conf
echo   code: %CODE_OUT%
echo   data: %DATA_OUT%

if not exist "%CODE_OUT%" mkdir "%CODE_OUT%"
if not exist "%DATA_OUT%" mkdir "%DATA_OUT%"

REM 只清生成物，保留 Cocos .meta（避免 Creator 报 meta is not exist）
for %%F in ("%CODE_OUT%\*.ts") do del /q "%%F" >nul 2>&1
for %%F in ("%DATA_OUT%\*.json") do del /q "%%F" >nul 2>&1

pushd "%LUBAN_DIR%"
dotnet .\Luban\Luban.dll -t client -c typescript-json -d json --conf "%LUBAN_ROOT%\luban.conf" -x "outputDataDir=%DATA_OUT%" -x "outputCodeDir=%CODE_OUT%"
set "DOTNET_EXIT=!ERRORLEVEL!"
popd
if not "!DOTNET_EXIT!"=="0" exit /b !DOTNET_EXIT!

set "PYTHON="
if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set "PYTHON=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
if not defined PYTHON if exist "%USERPROFILE%\scoop\apps\python310\current\python.exe" set "PYTHON=%USERPROFILE%\scoop\apps\python310\current\python.exe"
if not defined PYTHON where python >nul 2>&1 && set "PYTHON=python"
if not defined PYTHON where py >nul 2>&1 && set "PYTHON=py -3"
if not defined PYTHON where python3 >nul 2>&1 && set "PYTHON=python3"
if not defined PYTHON (
  echo Error: Python 3 not found. Install Python 3 and add it to PATH.
  exit /b 1
)

%PYTHON% "%DATA_TOOLS_SCRIPTS%\ensure-ts-metas.py" "%CODE_OUT%"
if errorlevel 1 exit /b 1
%PYTHON% "%DATA_TOOLS_SCRIPTS%\ensure-ts-metas.py" "%PROJECT_ROOT%\assets\scripts\config\luban"
if errorlevel 1 exit /b 1
%PYTHON% "%DATA_TOOLS_SCRIPTS%\ensure-json-metas.py" "%DATA_OUT%"
if errorlevel 1 exit /b 1

echo [2/2] Done.
echo   Runtime code: %CODE_OUT%
echo   Runtime data: %DATA_OUT%
exit /b 0
