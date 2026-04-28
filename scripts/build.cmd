@echo off
setlocal

if exist dist rmdir /s /q dist
mkdir dist
mkdir dist\assets

node scripts\build-css.mjs
if errorlevel 1 exit /b 1

node scripts\build-main.mjs
if errorlevel 1 exit /b 1
if exist dist\assets\meta.json del dist\assets\meta.json

xcopy /E /I /Y public dist >nul
if errorlevel 1 exit /b 1

node scripts\build-html.mjs
if errorlevel 1 exit /b 1

node scripts\build-verify.mjs
if errorlevel 1 exit /b 1
