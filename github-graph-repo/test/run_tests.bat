@echo off
echo Running GitHub Graph Repo Nostr Publishing Tests...
python test\test_nostr_publishing.py
if %ERRORLEVEL% NEQ 0 (
    echo GitHub Graph Repo Tests Failed!
    exit /b %ERRORLEVEL%
)
echo GitHub Graph Repo Tests Passed Successfully!
