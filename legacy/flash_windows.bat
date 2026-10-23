@echo off
setlocal
cd /d "%~dp0"
echo GreenBandana - ESP32-S3, 4MB flash
echo Disconnect external +5V from ESP before connecting its USB.
set /p MASK_PORT=ESP serial port (for example COM5): 
if "%MASK_PORT%"=="" exit /b 1
python -m pip install esptool==4.8.1
if errorlevel 1 goto failed
python -m esptool --chip esp32s3 --port "%MASK_PORT%" --baud 460800 write_flash --flash_mode dio --flash_freq 80m --flash_size 4MB 0x0 "%~dp0greenbandana_merged.bin"
if errorlevel 1 goto failed
echo Done. Press RESET on ESP.
pause
exit /b 0
:failed
echo Flash failed. Check port, USB cable and BOOT/RESET sequence.
pause
exit /b 1
