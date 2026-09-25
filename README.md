# HUB PET-Saúde

Plataforma única do projeto **PET-Saúde: Clima** (UNIFAE + Secretaria Municipal de Saúde de São João da Boa Vista).
Mantida pelo Grupo PET II — Cuidado Digital na APS.

Stack: Node.js (NestJS) + TypeScript · Vue 3 · PostgreSQL 17 + PostGIS 3.5 · Metabase · Docker.

---

## Ambientes

| Ambiente | Branch | Para quê | Quem aprova a entrada |
|---|---|---|---|
| **local** | a sua (`feature/...`) | Você programa e testa na sua máquina | — |
| **dev** | `dev` | Integração: o código de todos junto, no servidor | Tutor |
| **hml** | `hml` | Homologação: a coordenação valida | Tutor |
| **prod** | `main` | Produção: o que a população e a Secretaria usam | Tutor (após validação da coordenação) |

**Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes do primeiro commit.** Ele explica o fluxo de branches.

---

## Rodando na sua máquina (ambiente local)

Pré-requisitos: [Git](https://git-scm.com/), [Docker Desktop](https://www.docker.com/products/docker-desktop/) e [Node.js 22 LTS](https://nodejs.org/).

```bash
git clone <URL-DO-REPOSITORIO>
cd hub-pet-saude
cp .env.example .env          # no Windows: copy .env.example .env
docker compose up -d          # sobe o banco PostGIS local na porta 5432
```

Pronto: você tem um PostgreSQL + PostGIS só seu, em `localhost:5432`
(usuário, senha e banco estão no `.env`). Pode apagar e recriar à vontade:

```bash
docker compose down -v        # apaga o banco local (volta do zero)
docker compose up -d
```

Os scripts em `db/init/` rodam automaticamente na primeira vez que o banco local sobe.

### Backend e frontend

Em dois terminais:

```bash
# terminal 1 - API em http://localhost:3000
cd backend
npm install
npm run build
node --env-file=../.env dist/main.js
```

```bash
# terminal 2 - site em http://localhost:5173
cd frontend
npm install
npm run dev
```

Abra http://localhost:5173 e entre com o `ADMIN_EMAIL` / `ADMIN_SENHA_INICIAL` do seu `.env`.
As tabelas são criadas sozinhas quando a API sobe (arquivos em `backend/migrations/`).

| Página | Endereço | Quem acessa |
|---|---|---|
| Página externa | `/` | qualquer pessoa, sem login |
| Login | `/login` | equipe |
| Minha área | `/inicio` | qualquer pessoa logada |
| Administração | `/admin/pessoas`, `/admin/sincronizacao`, `/admin/auditoria` | só "Administrador do sistema" |

> Use **somente dados fictícios** no ambiente local e no dev. Dado real de saúde só em produção.

---

### Dados fictícios (dev, hml e local)

`db/ficticios/dados-ficticios.sql` cria 37 pessoas com a estrutura dos grupos (coordenação geral; em cada PET:
coordenador, tutor, preceptores e alunos; PET II com alunos desenvolvedores), ações e ~120 atividades em
situações variadas. E-mails `@ficticio.pet`, senhas aleatórias. Para navegar como cada uma, o administrador usa
**Pessoas → Ver como** (não existe em produção). Rodar de novo recria tudo; `remover-ficticios.sql` apaga.

```bash
docker exec -i hub-local-db psql -U hub -d hub_local < db/ficticios/dados-ficticios.sql
```

---

## Endereços no servidor

| Ambiente | Endereço |
|---|---|
| dev | http://dev.189-44-109-186.sslip.io:8080 |
| hml | http://hml.189-44-109-186.sslip.io:8080 |
| prod | http://189.44.109.186:8080 |

Na rede interna da UNIFAE, troque `189-44-109-186` por `192-168-3-103` (e o IP do prod por `192.168.3.103`).

---

## Acessando os bancos do servidor (dev e hml)

Você recebe do tutor um usuário e senha. Abra o túnel (deixe o terminal aberto enquanto usa):

```bash
ssh -N -p 9222 -L 5433:localhost:5433 -L 5434:localhost:5434 SEU_USUARIO@189.44.109.186
```

Depois conecte pelo DBeaver/pgAdmin/psql:

| Banco | Host | Porta | Database | Permissão |
|---|---|---|---|---|
| dev | `localhost` | `5433` | `hub_dev` | leitura e escrita |
| hml | `localhost` | `5434` | `hub_hml` | somente leitura |

A conta SSH serve **apenas** para o túnel: não abre terminal no servidor.

---

## Estrutura do repositório

```
backend/        API (NestJS + TypeScript) - src/ código, migrations/ SQL do banco
frontend/       Interface (Vue 3 + Vite) - src/views/ páginas
db/init/        SQL executado ao criar o banco local
deploy/         Scripts usados pelo servidor para publicar dev/hml/prod
docs/           Documentação do projeto
.github/        Regras de PR, dono do código e pipelines
```
