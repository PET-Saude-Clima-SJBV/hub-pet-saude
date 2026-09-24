-- Estrutura inicial: pessoas, permissões por ambiente, auditoria e dados públicos.
-- Tudo no schema "hub" (os papéis de banco dos alunos só enxergam o schema public).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS hub;

CREATE TABLE hub.usuarios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL,
  email            text NOT NULL UNIQUE,
  senha_hash       text NOT NULL,
  papel            text NOT NULL CHECK (papel IN
                     ('aluno','preceptor','tutor','coordenador','coordenacao_geral','externo')),
  admin_sistema    boolean NOT NULL DEFAULT false,
  ativo            boolean NOT NULL DEFAULT true,
  github_usuario   text,
  github_permissao text NOT NULL DEFAULT 'nenhum'
                     CHECK (github_permissao IN ('nenhum','leitura','escrita','admin')),
  usuario_servidor text UNIQUE,              -- login linux / banco (ex.: sofia)
  chave_ssh        text,                     -- chave pública, para o túnel
  ultimo_login     timestamptz,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);

-- Uma linha por pessoa x ambiente.
CREATE TABLE hub.permissoes_ambiente (
  usuario_id uuid NOT NULL REFERENCES hub.usuarios(id) ON DELETE CASCADE,
  ambiente   text NOT NULL CHECK (ambiente IN ('dev','hml','prod')),
  banco      text NOT NULL DEFAULT 'nenhum' CHECK (banco IN ('nenhum','leitura','escrita')),
  servidor   boolean NOT NULL DEFAULT false,   -- acesso ao servidor (túnel SSH) deste ambiente
  PRIMARY KEY (usuario_id, ambiente)
);

CREATE TABLE hub.auditoria (
  id        bigserial PRIMARY KEY,
  quando    timestamptz NOT NULL DEFAULT now(),
  ator_id   uuid REFERENCES hub.usuarios(id) ON DELETE SET NULL,
  ator_nome text,
  acao      text NOT NULL,
  alvo_id   uuid,
  alvo_nome text,
  detalhes  jsonb
);
CREATE INDEX ON hub.auditoria (quando DESC);

CREATE TABLE hub.indicadores_publicos (
  id        serial PRIMARY KEY,
  titulo    text NOT NULL,
  valor     numeric NOT NULL,
  unidade   text,
  descricao text,
  ficticio  boolean NOT NULL DEFAULT true,
  ordem     int NOT NULL DEFAULT 0
);

INSERT INTO hub.indicadores_publicos (titulo, valor, unidade, descricao, ordem) VALUES
  ('Territórios acompanhados', 5, NULL, 'Áreas de atuação do projeto no município', 1),
  ('Ações em andamento', 24, NULL, 'Ações do plano de trabalho em execução', 2),
  ('Metas do projeto', 45, NULL, 'Metas pactuadas no edital, nos 3 eixos', 3),
  ('Alertas climáticos no mês', 3, NULL, 'Avisos de calor extremo ou chuva forte emitidos', 4);
