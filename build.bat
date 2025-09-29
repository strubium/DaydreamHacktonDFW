@echo off
REM -------------------------------
REM NW.js Windows Build Script
REM -------------------------------

REM Set variables
set APP_NAME=SurfaceAndRepair
set APP_VERSION=1.0.0
set NW_JS_VERSION=0.82.0
set BUILD_DIR=build
set DIST_DIR=dist
set NWJS_DIR=nwjs-sdk-v%NW_JS_VERSION%-win-x64
set NWJS_ZIP=nwjs-sdk-v%NW_JS_VERSION%-win-x64.zip
set BUILD_SCRIPT=build.bat

REM Clean previous build
echo Cleaning previous build...
rmdir /s /q %BUILD_DIR%
rmdir /s /q %DIST_DIR%
mkdir %BUILD_DIR%
mkdir %DIST_DIR%

REM Copy project files to build folder (exclude build/dist folders and the build script)
echo Copying project files...
robocopy . %BUILD_DIR% /E /XD %BUILD_DIR% %DIST_DIR% /XF %BUILD_SCRIPT%

REM Download NW.js if missing
if exist %NWJS_DIR% (
    echo NW.js SDK folder exists, skipping download...
) else (
    echo Downloading NW.js SDK...
    powershell -Command "Invoke-WebRequest https://dl.nwjs.io/v%NW_JS_VERSION%/nwjs-sdk-v%NW_JS_VERSION%-win-x64.zip -OutFile %NWJS_ZIP%"
    echo Extracting NW.js SDK...
    powershell -Command "Expand-Archive -Force %NWJS_ZIP% -DestinationPath ."
    del /f /q %NWJS_ZIP%
)

REM Copy NW.js files to dist
echo Copying NW.js runtime to dist...
robocopy %NWJS_DIR% %DIST_DIR% /E

REM Rename NW.js executable
if exist "%DIST_DIR%\nw.exe" (
    ren "%DIST_DIR%\nw.exe" "%APP_NAME%.exe"
)

REM Copy app files to dist (exclude the build script)
echo Copying app files to dist...
robocopy %BUILD_DIR% %DIST_DIR% /E /XF %BUILD_SCRIPT%

echo Build complete! Your app is in %DIST_DIR%\
pause
