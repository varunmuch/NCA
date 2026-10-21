#!/usr/bin/env bash
# Install and start the CareerIntel services (needs sudo).
# Rebuild the frontend first after code changes: (cd frontend && npm run build)
set -euo pipefail
cd "$(dirname "$0")"
sudo cp cie-backend.service cie-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cie-backend.service cie-frontend.service
systemctl --no-pager --lines=0 status cie-backend.service cie-frontend.service
