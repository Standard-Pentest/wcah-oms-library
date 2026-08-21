#!/usr/bin/env bash
# ==============================================================================
# WCAH OMS Documentation Portal Runner
# Builds all tenants (wcah, devlog, oms-v0, oms-v1, oms-v2), generates the root hub,
# and starts the local Pagenary preview server.
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "================================================================="
echo "  🏛️  West Coast Animal Hospital — OMS Documentation Library"
echo "================================================================="
echo ""
echo "📦 Building all tenants (wcah, devlog, oms-v0, oms-v1, oms-v2)..."
npx pagenary build --all

echo ""
echo "🌐 Updating root portal hub at dist/library/index.html..."
node scripts/build-portal.js

echo ""
echo "📡 Injecting Sentry loader into generated HTML..."
node scripts/inject-sentry.js

echo ""
echo "🚀 Starting Pagenary server at http://localhost:5173 ..."
echo "-----------------------------------------------------------------"
echo "  • Portal Hub:   http://localhost:5173/"
echo "  • WCAH Anchor:  http://localhost:5173/wcah/"
echo "  • Devlog:       http://localhost:5173/devlog/"
echo "  • OMS v0:       http://localhost:5173/oms-v0/"
echo "  • OMS v1:       http://localhost:5173/oms-v1/"
echo "  • OMS v2:       http://localhost:5173/oms-v2/"
echo "-----------------------------------------------------------------"
echo "Press Ctrl+C to stop the server."
echo ""

npx pagenary serve
