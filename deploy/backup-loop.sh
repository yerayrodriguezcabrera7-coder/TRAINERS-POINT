#!/bin/sh
set -eu
umask 077
mkdir -p /backups
interval=${BACKUP_INTERVAL_SECONDS:-86400}
case "$interval" in ''|*[!0-9]*|0) echo 'Intervalo de copias inválido.' >&2; exit 1;; esac
temporary_file=''
trap 'test -z "$temporary_file" || rm -f "$temporary_file"; exit 0' TERM INT
while true; do
  filename="/backups/trainers-point-$(date -u +%Y%m%dT%H%M%SZ).dump"
  temporary_file="$filename.tmp"
  if pg_dump --format=custom --no-owner --no-acl --file="$temporary_file"; then
    mv "$temporary_file" "$filename"
    temporary_file=''
    echo 'Copia de seguridad completada.'
  else
    rm -f "$temporary_file"
    temporary_file=''
    echo 'Fallo en la copia de seguridad. Revisar conexión y espacio disponible.' >&2
  fi
  sleep "$interval" &
  wait $!
done
