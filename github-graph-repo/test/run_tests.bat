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
echo Running GitHub Graph Repo Nostr Publishing Tests...
python test\test_nostr_publishing.py
if %ERRORLEVEL% NEQ 0 (
    echo GitHub Graph Repo Tests Failed!
    exit /b %ERRORLEVEL%
)
echo GitHub Graph Repo Tests Passed Successfully!
