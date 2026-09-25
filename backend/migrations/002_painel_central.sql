-- Painel central: perfil (desenvolvedor x usuário do sistema), grupo PET, acesso ao HUB
-- por ambiente e o status do que o sincronizador já aplicou.

ALTER TABLE hub.usuarios
  ADD COLUMN perfil text NOT NULL DEFAULT 'usuario' CHECK (perfil IN ('desenvolvedor', 'usuario')),
  ADD COLUMN grupo smallint CHECK (grupo BETWEEN 1 AND 5),
  ADD COLUMN senha_atualizada_em timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN senha_banco text;              -- gerada pelo sincronizador; o schema hub não é visível aos papéis de banco dos alunos

ALTER TABLE hub.permissoes_ambiente
  ADD COLUMN hub boolean NOT NULL DEFAULT false;   -- consegue entrar no HUB deste ambiente

-- Quem já existia: administradores viram desenvolvedores e continuam entrando em tudo;
-- os demais com acesso técnico também são desenvolvedores.
UPDATE hub.usuarios SET perfil = 'desenvolvedor', grupo = 2 WHERE admin_sistema;
UPDATE hub.usuarios u SET perfil = 'desenvolvedor'
 WHERE github_permissao <> 'nenhum'
    OR EXISTS (SELECT 1 FROM hub.permissoes_ambiente p WHERE p.usuario_id = u.id AND (p.banco <> 'nenhum' OR p.servidor));
UPDATE hub.permissoes_ambiente SET hub = true;

-- Usuário do sistema nunca tem acesso técnico (depois de ajustar quem já existia)
ALTER TABLE hub.usuarios ADD CONSTRAINT usuario_sem_acesso_tecnico
  CHECK (perfil = 'desenvolvedor' OR (github_permissao = 'nenhum'));

-- O que o sincronizador aplicou, item a item
CREATE TABLE hub.sincronizacao_status (
  usuario_id    uuid NOT NULL REFERENCES hub.usuarios(id) ON DELETE CASCADE,
  sistema       text NOT NULL CHECK (sistema IN ('HUB', 'Banco', 'Servidor', 'GitHub')),
  ambiente      text NOT NULL DEFAULT '-',
  estado        text NOT NULL CHECK (estado IN ('aplicado', 'erro', 'ignorado')),
  mensagem      text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, sistema, ambiente)
);

-- Execuções do sincronizador e pedidos de "aplicar agora"
CREATE TABLE hub.sincronizacao_execucoes (
  id           bigserial PRIMARY KEY,
  pedida_em    timestamptz NOT NULL DEFAULT now(),
  pedida_por   text,
  iniciada_em  timestamptz,
  concluida_em timestamptz,
  resultado    text,            -- ok | erro
  resumo       jsonb
);
