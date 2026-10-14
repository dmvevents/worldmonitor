#!/usr/bin/env bash
# Refresh the published EBC constituency-boundary artifact used by the tt
# variant's "EBC Constituencies" map layer.
#
# Source of truth is Anton's tt-geopolitical-intelligence platform (FastAPI +
# PostGIS), which ingests the Elections and Boundaries Commission's public
# boundary publications. This script only READS its public GeoJSON endpoint
# and stores an aggregate, boundary-only artifact (names, codes, island,
# election year, validation status, provenance, source document). No results
# or individual-level data are included.
#
# Usage:  scripts/tt-ebc-export.sh [API_BASE] [SIMPLIFY]
#   API_BASE  default http://localhost:8000   (make api in tt-geopolitical-intelligence)
#   SIMPLIFY  default 0.001 (degrees, ST_SimplifyPreserveTopology tolerance)
set -euo pipefail
API_BASE="${1:-http://localhost:8000}"
SIMPLIFY="${2:-0.001}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/data/tt-ebc-constituencies.geojson"
TMP="$(mktemp)"
curl -sS -f -m 120 "${API_BASE}/api/boundaries?simplify=${SIMPLIFY}" -o "$TMP"
node -e '
  const fs = require("node:fs");
  const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (d.type !== "FeatureCollection" || !Array.isArray(d.features) || d.features.length < 30) {
    console.error(`unexpected payload: type=${d.type} features=${d.features?.length}`); process.exit(1);
  }
  for (const f of d.features) for (const k of ["code", "name", "island", "election_year", "validation_status", "provenance"]) {
    if (!(k in (f.properties || {}))) { console.error(`feature missing property ${k}`); process.exit(1); }
  }
  console.log(`[tt-ebc-export] ${d.features.length} constituencies, ${fs.statSync(process.argv[1]).size} bytes`);
' "$TMP"
mv "$TMP" "$OUT"
echo "[tt-ebc-export] wrote $OUT"
