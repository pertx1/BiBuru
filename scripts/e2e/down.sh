#!/usr/bin/env bash
pkill -f "[p]ostgrest /tmp" || true; pkill -f "[m]ock-supabase" || true; pkill -f "[n]ext-server" || true; pkill -f "[n]ext start" || true
