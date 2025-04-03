@echo off
cd /d %~dp0
node app.js > app.log 2>&1
timeout /t 10 > nul