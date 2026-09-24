#!/usr/bin/env bash
# Chamado pelo pipeline no servidor. Uso: deploy.sh <dev|hml|prod>
# Copia o código para /opt/hub-saude/<amb>/app e sobe os containers da aplicação.
# O banco de cada ambiente já roda à parte (/opt/hub-saude/<amb>/docker-compose.yml)
# e NÃO é recriado aqui.
set -euo pipefail

AMB="${1:?informe dev, hml ou prod}"
BASE="/opt/hub-saude/$AMB"
[ -d "$BASE" ] || { echo "Ambiente $AMB não existe em $BASE"; exit 1; }

export VERSAO="$(git rev-parse --short HEAD)"
echo ">> Publicando em $AMB ($VERSAO)"
mkdir -p "$BASE/app"
rsync -a --delete --exclude .git --exclude node_modules --exclude .env ./ "$BASE/app/"
echo "$VERSAO" > "$BASE/app/VERSAO"

if [ ! -f "$BASE/app/deploy/docker-compose.app.yml" ]; then
  echo ">> Ainda não há aplicação (deploy/docker-compose.app.yml). Código copiado apenas."
  exit 0
fi

cd "$BASE"
docker compose -p "hub-$AMB" --env-file .env \
  -f docker-compose.yml -f app/deploy/docker-compose.app.yml \
  up -d --build --remove-orphans

echo ">> Aguardando a API ficar saudável..."
for _ in $(seq 1 30); do
  estado="$(docker inspect -f '{{.State.Health.Status}}' "hub-$AMB-api" 2>/dev/null || echo ausente)"
  if [ "$estado" = "healthy" ]; then
    docker image prune -f >/dev/null
    echo ">> OK: $AMB atualizado para $VERSAO"
    exit 0
  fi
  sleep 3
done

echo ">> ERRO: a API de $AMB não ficou saudável. Últimas linhas do log:"
docker logs --tail 40 "hub-$AMB-api" || true
exit 1
