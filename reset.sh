#!/usr/bin/env bash
# ==============================================================================
# HoneyChain Complete Environment Reset & Fresh Start Script
# Usage:
#   ./reset.sh           -> Full reset (cleans blockchain, JSON datasets & browser cache)
#   ./reset.sh --start   -> Full reset AND automatically start all services (Chain + Backend + UI)
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║           🍯 HoneyChain Complete Fresh Reset Utility             ║${NC}"
echo -e "${YELLOW}║     (KVIC Smart Beekeeping & Blockchain Traceability Hub)        ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Kill any active processes holding the ports (8546, 5002, 3000, 3001)
echo -e "${CYAN}▶ Step 1: Releasing ports (8546, 5002, 3000, 3001)...${NC}"
PIDS=$(lsof -ti:8546 -ti:5002 -ti:3000 -ti:3001 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  kill -9 $PIDS 2>/dev/null || true
  sleep 1
  echo -e "${GREEN}✓ All previous server processes stopped.${NC}"
else
  echo -e "${GREEN}✓ Ports are clear.${NC}"
fi

# 2. Run the core reset engine (Ganache block-0 wipe + Truffle migration + JSON dataset reset + ResetEpoch stamp)
echo ""
echo -e "${CYAN}▶ Step 2: Wiping blockchain, deploying fresh contract, & clearing databases...${NC}"
node scripts/full-reset.js

echo ""
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}🎉 SUCCESS: HoneyChain has been completely reset to pristine state!${NC}"
echo -e "${GREEN}${BOLD}════════════════════════════════════════════════════════════════════${NC}"
echo -e "  • ${BOLD}Blockchain:${NC} Block #0 clean state with new contract"
echo -e "  • ${BOLD}Hives & Batches:${NC} 0 registered (100% empty ledger)"
echo -e "  • ${BOLD}Browser Cache:${NC} Stamped with fresh resetEpoch (auto-purges on refresh)"
echo ""

# 3. Check if user passed --start or prompt
AUTO_START=false
if [ "$1" == "--start" ] || [ "$1" == "-s" ]; then
  AUTO_START=true
fi

if [ "$AUTO_START" = false ]; then
  read -t 6 -p "▶ Do you want to start HoneyChain now? [Y/n] (Auto-starting in 5s): " USER_INPUT || USER_INPUT="y"
  echo ""
  if [[ "$USER_INPUT" =~ ^[Nn] ]]; then
    echo -e "👉 Whenever you are ready, run: ${CYAN}npm start${NC}"
    echo -e "👉 Then open browser at: ${CYAN}http://localhost:3000${NC} and press ${BOLD}Cmd+Shift+R${NC}."
    exit 0
  fi
fi

echo -e "${CYAN}▶ Starting HoneyChain Stack (Chain + AI-IOT Backend + React UI)...${NC}"
echo -e "${YELLOW}Press Ctrl+C at any time to stop all services.${NC}"
echo ""
npm start
