#!/bin/sh
# Backup diário do banco em ./backups (no servidor). Guarda os últimos BACKUP_KEEP_DAYS dias.
# Faz um backup por dia, a partir da hora BACKUP_HOUR (horário de Brasília).
set -eu

backup() {
	f="/backups/motel-$(date +%Y-%m-%d_%H%M).sql.gz"
	if pg_dump --no-owner | gzip > "$f.tmp"; then
		mv "$f.tmp" "$f"
		echo "Backup criado: $f"
	else
		rm -f "$f.tmp"
		echo "ERRO ao criar backup" >&2
	fi
	find /backups -name 'motel-*.sql.gz' -mtime +"$BACKUP_KEEP_DAYS" -delete
	last=$(date +%F)
}

last=""
while true; do
	sleep 600
	if [ "$(date +%F)" != "$last" ] && [ "$(date +%H)" -ge "$BACKUP_HOUR" ]; then
		backup
	fi
done
