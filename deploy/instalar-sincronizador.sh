#!/usr/bin/env bash
# Instala (ou atualiza) o sincronizador do HUB no servidor. Rodar com sudo:
#   sudo bash deploy/instalar-sincronizador.sh
# Idempotente. A configuração fica em /etc/hub-sincronizador.env (não é sobrescrita).
set -euo pipefail

ORIGEM="$(cd "$(dirname "$0")/.." && pwd)/sincronizador"
DESTINO=/opt/hub-saude/sincronizador
NODE=/opt/node

[ "$(id -u)" = 0 ] || { echo "Rode com sudo"; exit 1; }

# 1. Node.js 22 LTS oficial (com verificação do hash publicado pelo nodejs.org)
if ! "$NODE/bin/node" -v >/dev/null 2>&1; then
  base=https://nodejs.org/dist/latest-v22.x
  somas="$(curl -fsSL $base/SHASUMS256.txt)"
  arq="$(echo "$somas" | grep -oE 'node-v[0-9.]+-linux-x64\.tar\.xz' | head -1)"
  curl -fsSL -o "/tmp/$arq" "$base/$arq"
  (cd /tmp && echo "$somas" | grep " $arq\$" | sha256sum -c -)
  mkdir -p "$NODE" && tar -xJf "/tmp/$arq" -C "$NODE" --strip-components=1 && rm -f "/tmp/$arq"
fi
echo ">> Node $("$NODE/bin/node" -v)"

# 2. Código
mkdir -p "$DESTINO"
rsync -a --delete --exclude node_modules "$ORIGEM/" "$DESTINO/"
(cd "$DESTINO" && PATH="$NODE/bin:$PATH" npm ci --omit=dev --no-audit --no-fund --loglevel=error)
chown -R root:root "$DESTINO"; chmod -R go-w "$DESTINO"

# 3. Configuração (só na primeira vez)
if [ ! -f /etc/hub-sincronizador.env ]; then
  cat > /etc/hub-sincronizador.env <<'EOF'
# Ambiente onde está o painel central (quem manda nos acessos)
CENTRAL=dev
# Ambientes em que o sincronizador pode mexer (o prod entra quando o painel central for para lá)
AMBIENTES=dev,hml
# Sincronização completa automática a cada N minutos (o botão "Aplicar agora" é atendido em até 1 min)
INTERVALO_MIN=10
# GitHub App (preencher depois de criar o App na organização)
#GITHUB_APP_ID=
#GITHUB_APP_CHAVE=/etc/hub-sincronizador-github.pem
#GITHUB_ORG=PET-Saude-Clima-SJBV
#GITHUB_REPO=hub-pet-saude
EOF
  chmod 600 /etc/hub-sincronizador.env
fi

# 4. Serviço + timer (a cada minuto)
cat > /etc/systemd/system/hub-sincronizador.service <<EOF
[Unit]
Description=Sincronizador de acessos do HUB PET-Saude
After=docker.service network-online.target

[Service]
Type=oneshot
EnvironmentFile=/etc/hub-sincronizador.env
ExecStart=$NODE/bin/node $DESTINO/index.js
TimeoutStartSec=300
EOF

cat > /etc/systemd/system/hub-sincronizador.timer <<'EOF'
[Unit]
Description=Roda o sincronizador do HUB a cada minuto

[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now hub-sincronizador.timer >/dev/null
echo ">> Instalado. Logs: journalctl -u hub-sincronizador -f"
