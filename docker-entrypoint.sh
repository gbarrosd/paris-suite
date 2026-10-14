#!/bin/sh
set -e
# Aplica migrações e cria o administrador inicial (só na primeira vez) antes de subir o servidor.
python manage.py migrate --noinput
python manage.py bootstrap
exec "$@"
