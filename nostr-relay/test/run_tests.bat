@echo off
echo Running Nostr Relay Service Tests...
python test\test_relay.py
if %ERRORLEVEL% NEQ 0 (
    echo Nostr Relay Tests Failed!
    exit /b %ERRORLEVEL%
)
echo Nostr Relay Tests Passed Successfully!
