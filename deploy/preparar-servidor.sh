#!/usr/bin/env bash
# Rodar UMA vez no servidor, como administrador:  bash deploy/preparar-servidor.sh
# (idempotente: pode rodar de novo sem estragar nada)
# Proxy de entrada (Caddy) na porta 8080: separa os ambientes pelo nome do endereço.
#   dev.<ip>.sslip.io:8080  -> hub-dev-web
#   hml.<ip>.sslip.io:8080  -> hub-hml-web
#   qualquer outro (IP puro) -> hub-prod-web
set -e
docker network inspect hub-proxy >/dev/null 2>&1 || docker network create hub-proxy >/dev/null

P=/opt/hub-saude/proxy
mkdir -p $P
cat > $P/Caddyfile <<'EOF'
{
	auto_https off
	admin off
}

:8080 {
	@dev header_regexp Host ^dev\.
	@hml header_regexp Host ^hml\.

	handle @dev {
		reverse_proxy hub-dev-web:80
	}
	handle @hml {
		reverse_proxy hub-hml-web:80
	}
	handle {
		reverse_proxy hub-prod-web:80
	}

	handle_errors {
		respond "HUB PET-Saude: este ambiente ainda nao foi publicado ({err.status_code})" 503
	}

	log {
		output stdout
		format console
	}
}
EOF

cat > $P/docker-compose.yml <<'EOF'
name: hub-proxy
services:
  caddy:
    image: caddy:2-alpine
    container_name: hub-proxy
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    networks: [hub-proxy]
networks:
  hub-proxy:
    external: true
volumes:
  caddy_data:
EOF
(cd $P && docker compose up -d --quiet-pull 2>&1 | tail -n 1)

# Variáveis da aplicação em cada ambiente (só acrescenta o que faltar)
gera() { openssl rand -base64 48 | tr -d '/+=' | cut -c1-$1; }
for amb in dev hml prod; do
  f=/opt/hub-saude/$amb/.env
  grep -q '^JWT_SEGREDO=' $f || echo "JWT_SEGREDO=$(gera 48)" >> $f
  grep -q '^ADMIN_EMAIL=' $f || echo "ADMIN_EMAIL=matheusoromano@gmail.com" >> $f
  grep -q '^ADMIN_NOME=' $f || echo "ADMIN_NOME=Matheus Otero Romano" >> $f
  grep -q '^ADMIN_SENHA_INICIAL=' $f || echo "ADMIN_SENHA_INICIAL=$(gera 16)" >> $f
done
sleep 2
docker ps --filter name=hub-proxy --format '{{.Names}} {{.Status}} {{.Ports}}'
curl -s -H 'Host: dev.teste' http://127.0.0.1:8080/ ; echo
