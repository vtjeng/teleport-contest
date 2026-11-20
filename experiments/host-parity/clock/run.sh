#!/usr/bin/env bash
# usage: run.sh <grid> <outdir>   (builds clockdrv from the script's directory)
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
grid=$1; out=$2
mkdir -p "$out"
cc -O1 -Wall -o "$out/clockdrv" "$here/clockdrv.c"
{
  date -u
  uname -a
  (sw_vers 2>/dev/null || true)
  (cc --version | head -n 1)
  (cat /usr/share/zoneinfo/+VERSION 2>/dev/null && echo " (+VERSION)" || true)
  (head -n 1 /usr/share/zoneinfo/tzdata.zi 2>/dev/null || true)
  (ldd --version 2>/dev/null | head -n 1 || true)
  ls -l /etc/localtime || true
  (ls -l /usr/share/zoneinfo/America/New_York; shasum -a 256 /usr/share/zoneinfo/America/New_York 2>/dev/null || sha256sum /usr/share/zoneinfo/America/New_York) || true
  (shasum -a 256 "$grid" 2>/dev/null || sha256sum "$grid"); wc -l < "$grid"
} > "$out/host.txt" 2>&1
for base in now summer; do
  for isdst in 0 1; do
    TZ=America/New_York NETHACK_FIXED_ISDST=$isdst "$out/clockdrv" $base < "$grid" > "$out/c-$base-$isdst.txt" 2>> "$out/host.txt"
  done
done
wc -l "$out"/c-*.txt >> "$out/host.txt"
