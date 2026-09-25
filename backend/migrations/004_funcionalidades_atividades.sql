-- Chaves de funcionalidade (liga/desliga por ambiente) e registro de atividade (Bloco E).

-- ------------------------------------------------------------------ funcionalidades
--   desligada: ninguém usa (tela some, API recusa)
--   teste:     só administradores do sistema e desenvolvedores
--   ligada:    todos que têm permissão pelo papel
CREATE TABLE hub.funcionalidades (
  chave          text PRIMARY KEY,
  nome           text NOT NULL,
  descricao      text,
  estado         text NOT NULL DEFAULT 'desligada' CHECK (estado IN ('desligada', 'teste', 'ligada')),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por text
);

INSERT INTO hub.funcionalidades (chave, nome, descricao, estado) VALUES
  ('metas', 'Metas, indicadores e ações', 'Consulta e edição das metas, fichas de indicador e ações', 'ligada'),
  ('atividades', 'Registro de atividade', 'Registro de atividades com evidência, validação em lote e resumo por pessoa', 'teste'),
  ('pagina_publica', 'Página pública', 'Página externa com dados agregados, sem login', 'ligada');

-- ------------------------------------------------------------------ atividades
CREATE TABLE hub.atividades (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       uuid NOT NULL REFERENCES hub.usuarios(id) ON DELETE RESTRICT,
  grupo            smallint,                          -- grupo da pessoa no momento do registro (define quem valida)
  data             date NOT NULL,
  hora_inicio      time NOT NULL,
  hora_fim         time NOT NULL,
  minutos          int GENERATED ALWAYS AS ((EXTRACT(EPOCH FROM (hora_fim - hora_inicio)) / 60)::int) STORED,
  tipo             text NOT NULL CHECK (tipo IN
                     ('acao_tecnica', 'reuniao', 'orientacao', 'estudo', 'producao', 'evento', 'gestao')),
  modalidade       text NOT NULL CHECK (modalidade IN ('presencial', 'remoto')),
  territorio       text,
  acao_id          int REFERENCES hub.acoes(id) ON DELETE SET NULL,
  descricao        text NOT NULL,
  status           text NOT NULL DEFAULT 'concluido'
                     CHECK (status IN ('nao_iniciado', 'em_andamento', 'em_atraso', 'concluido')),
  validacao        text NOT NULL DEFAULT 'pendente' CHECK (validacao IN ('pendente', 'validada', 'devolvida')),
  validador_id     uuid REFERENCES hub.usuarios(id) ON DELETE SET NULL,
  validado_em      timestamptz,
  motivo_devolucao text,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fim > hora_inicio)
);
CREATE INDEX ON hub.atividades (usuario_id, data);
CREATE INDEX ON hub.atividades (grupo, validacao);
CREATE INDEX ON hub.atividades (acao_id);

-- Evidência é obrigatória em toda atividade: arquivo (foto, PDF...) ou link
CREATE TABLE hub.evidencias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id  uuid NOT NULL REFERENCES hub.atividades(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('arquivo', 'link')),
  nome          text NOT NULL,                 -- nome original do arquivo ou título do link
  url           text,                          -- quando é link
  arquivo       text,                          -- nome no armazenamento, quando é arquivo
  mime          text,
  tamanho       int,
  sha256        text,
  enviado_em    timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'link' AND url IS NOT NULL) OR (tipo = 'arquivo' AND arquivo IS NOT NULL))
);
CREATE INDEX ON hub.evidencias (atividade_id);
