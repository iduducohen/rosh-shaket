#!/usr/bin/env bash
# Runs every server test in the .NET SDK container.
# Use it when the host blocks freshly built test DLLs (e.g. Windows Smart App Control).
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$(pwd -W 2>/dev/null || pwd)"
MSYS_NO_PATHCONV=1 docker run --rm -v "$SRC:/src:ro" mcr.microsoft.com/dotnet/sdk:8.0 bash -c "
  mkdir /work && cd /src &&
  tar --exclude=./.vs --exclude='*/bin' --exclude='*/obj' -cf - . | tar -xf - -C /work &&
  cd /work && dotnet test RoshShaket.sln -nologo"
