#!/usr/bin/env bash
# Chamado pelo pipeline no servidor. Uso: deploy.sh <dev|hml|prod>
# Copia o código para /opt/hub-saude/<amb>/app e sobe os containers da aplicação.
# O banco de cada ambiente já roda à parte (/opt/hub-saude/<amb>/docker-compose.yml)
# e NÃO é recriado aqui.
set -euo pipefail

AMB="${1:?informe dev, hml ou prod}"
BASE="/opt/hub-saude/$AMB"
[ -d "$BASE" ] || { echo "Ambiente $AMB não existe em $BASE"; exit 1; }

echo ">> Publicando em $AMB ($(git rev-parse --short HEAD))"
mkdir -p "$BASE/app"
rsync -a --delete --exclude .git --exclude node_modules --exclude .env ./ "$BASE/app/"

if [ -f "$BASE/app/deploy/docker-compose.app.yml" ]; then
  cd "$BASE"
  docker compose -p "hub-$AMB" --env-file .env \
    -f docker-compose.yml -f app/deploy/docker-compose.app.yml \
    up -d --build --remove-orphans
  docker image prune -f >/dev/null
else
  echo ">> Ainda não há aplicação (deploy/docker-compose.app.yml). Código copiado apenas."
fi

git rev-parse HEAD > "$BASE/app/VERSAO"
echo ">> OK: $AMB atualizado"
