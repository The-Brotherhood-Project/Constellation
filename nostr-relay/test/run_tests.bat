::
:: Copyright (C) 2026 The Brotherhood Project Developers
::
:: This program is free software: you can redistribute it and/or modify
:: it under the terms of the GNU Affero General Public License as
:: published by the Free Software Foundation, either version 3 of the
:: License, or (at your option) any later version.
::
:: SPDX-License-Identifier: AGPL-3.0-or-later
::
@echo off
echo Running Nostr Relay Service Tests...
python test\test_relay.py
if %ERRORLEVEL% NEQ 0 (
    echo Nostr Relay Tests Failed!
    exit /b %ERRORLEVEL%
)
echo Nostr Relay Tests Passed Successfully!
