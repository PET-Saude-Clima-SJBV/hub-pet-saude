# Arquitetura do HUB: decisões

Registro das decisões técnicas e do porquê. Quando uma decisão mudar, atualize aqui (com a data).

---

## 1. Frontend: Vue 3 + Vite (sem Nuxt, por enquanto)

**Decisão (set/2026):** manter **Vue 3 + Vite** como aplicação SPA, falando com a API NestJS.

O Nuxt é excelente, mas o que ele acrescenta não é o que o HUB precisa agora:

| O Nuxt traz | Para o HUB |
|---|---|
| Renderização no servidor (SSR) e SEO | Quase todo o HUB é área logada: SEO não se aplica. A página pública é uma só. |
| Servidor próprio (Nitro, rotas de API) | Já temos a API NestJS. Seria um segundo backend, duplicando regras e segurança. |
| Rotas por pasta, auto-imports | Conveniente, mas é "mágica" a mais para quem está aprendendo. |
| - | SSR adiciona uma classe de bugs (hidratação, código rodando em servidor e navegador). |

**Quando reconsiderar:** se o **portal público** crescer (muitas páginas, notícias, boletins, SEO importante),
ele vira uma **aplicação separada** em Nuxt (ou Astro), consumindo a mesma API. O HUB interno continua SPA.

## 2. Componentização

Objetivo: **reaproveitar e manter**. Regras:

1. **Kit de interface próprio** em `frontend/src/components/ui/` (botão, cartão, campo, selo, tabela, abas, modal,
   avatar...) usando os tokens de cor de `estilo.css`. Uma página **não** estiliza botão ou cartão por conta própria:
   usa o componente. Hoje parte disso ainda está em classes CSS globais; migramos aos poucos.
2. **Componentes de domínio** por assunto: `components/publico/CardClima.vue`, `components/publico/MapaCalor.vue`,
   `components/Avatar.vue`, `components/Dialogo.vue` (já seguem o padrão: recebem dados por `props`).
3. **Organização por módulo** quando crescer: `src/modulos/<modulo>/{views,components,api.ts}` (atividades, metas,
   admin, publico).
4. **Componentes complexos prontos**: para tabela com filtros/paginação, calendário, autocompletar, usar
   **PrimeVue em modo sem estilo** (aplicando os nossos tokens) em vez de reescrever. Adotar quando a primeira tela precisar.
5. **Estado compartilhado** com **Pinia** quando os módulos atuais (`sessao.ts`, `painel.ts`) ficarem grandes.
6. **Contrato entre API e site**: a API publica um **OpenAPI** (NestJS Swagger) e o site gera os tipos TypeScript a
   partir dele. Um só contrato, usado também por quem integrar com o HUB.

## 3. Serviços e integrações

O HUB é um **monólito modular** (NestJS, um módulo por assunto) com **serviços satélites** quando houver motivo
real (ritmo próprio, falha isolada, permissões diferentes). O primeiro satélite já existe: o **sincronizador**.
Candidatos: motor de alertas climáticos, importadores de dados (e-SUS, SINAN, planilhas), gerador de relatórios.

### 3.1 Toda chamada para fora passa pela camada de integrações

`backend/src/integracoes/integracoes.ts`. Cada integração ganha, sem código extra:

- **tempo limite** (a API nunca trava esperando um serviço lento)
- **novas tentativas** com espera crescente em falhas temporárias
- **cache** com validade e **último dado bom** se o serviço cair
- **painel de saúde** em Administração → Integrações

Exemplo pronto: `integracoes/clima/` (Open-Meteo). Para uma nova: criar `integracoes/<nome>/`, registrar com
`integracoes.cliente('<nome>', { tipo: 'externa' | 'interna', ... })` e colocar a funcionalidade atrás de uma
**chave** (Administração → Funcionalidades), para desligar se o serviço externo der problema.

### 3.2 Como os serviços conversam

| Situação | Como |
|---|---|
| Pergunta e resposta imediata (consultar, validar) | **HTTP/JSON** documentado em OpenAPI, versionado (`/api/v1`) |
| Tarefa demorada ou que pode esperar (importar, gerar relatório, disparar alerta) | **Fila no próprio PostgreSQL** (pg-boss): sem servidor extra, com novas tentativas |
| Avisar que algo aconteceu (atividade validada, alerta emitido) | **Eventos** gravados numa tabela de saída (*outbox*) e entregues pela fila |
| Serviço nosso chamando a API | Rede interna do Docker (não exposta) + **chave de serviço** com escopos |
| Serviço externo chamando o HUB | Mesma API pública, com chave de cliente, escopos e limite de requisições |

### 3.3 Próximos passos (em ordem)

1. OpenAPI na API (`/api/docs`) e tipos gerados no site.
2. Tabela de **clientes de API** (chaves com escopo) para serviços internos e externos.
3. Fila no PostgreSQL + primeiro trabalho assíncrono (motor de alertas a partir do clima).
4. Logs estruturados (JSON) e saúde de cada serviço num só lugar.
