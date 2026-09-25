-- Cadastros administráveis (listas usadas nos formulários) e vínculo institucional das pessoas.
-- Cada item tem um CÓDIGO fixo (é o que fica gravado nos registros) e um NOME editável.
-- Usar código em vez de id numérico mantém os dados iguais entre dev, hml e prod.

CREATE TABLE hub.catalogos (
  chave       text PRIMARY KEY,
  nome        text NOT NULL,
  descricao   text NOT NULL,
  pai         text REFERENCES hub.catalogos(chave),   -- itens deste catálogo pertencem a um item de outro (curso -> instituição)
  ordem       int NOT NULL DEFAULT 0
);

CREATE TABLE hub.catalogo_itens (
  catalogo      text NOT NULL REFERENCES hub.catalogos(chave) ON DELETE CASCADE,
  codigo        text NOT NULL CHECK (codigo ~ '^[a-z0-9][a-z0-9_-]{0,59}$'),
  nome          text NOT NULL,
  sigla         text,
  descricao     text,
  pai_codigo    text,                 -- código do item "pai" (ex.: instituição do curso)
  ativo         boolean NOT NULL DEFAULT true,
  ordem         int NOT NULL DEFAULT 0,
  sistema       boolean NOT NULL DEFAULT false,   -- item padrão do sistema: pode ser renomeado/inativado, não apagado
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalogo, codigo)
);

INSERT INTO hub.catalogos (chave, nome, descricao, pai, ordem) VALUES
  ('tipos_atividade', 'Tipos de atividade', 'Classificação das atividades registradas', NULL, 1),
  ('modalidades',     'Modalidades',        'Como a atividade foi realizada', NULL, 2),
  ('territorios',     'Territórios',        'Áreas de atuação do projeto no município (definição do Grupo I)', NULL, 3),
  ('vinculos',        'Vínculos',           'Relação da pessoa com a instituição (aluno, professor, profissional de saúde...)', NULL, 4),
  ('instituicoes',    'Instituições',       'Instituições de ensino, órgãos públicos e parceiros', NULL, 5),
  ('cursos',          'Cursos e formações', 'Curso do aluno ou formação/área do profissional', 'instituicoes', 6);

INSERT INTO hub.catalogo_itens (catalogo, codigo, nome, ordem, sistema) VALUES
  ('tipos_atividade', 'acao_tecnica', 'Ação técnica', 1, true),
  ('tipos_atividade', 'reuniao',      'Reunião',      2, true),
  ('tipos_atividade', 'orientacao',   'Orientação',   3, true),
  ('tipos_atividade', 'estudo',       'Estudo',       4, true),
  ('tipos_atividade', 'producao',     'Produção',     5, true),
  ('tipos_atividade', 'evento',       'Evento',       6, true),
  ('tipos_atividade', 'gestao',       'Gestão',       7, true),
  ('modalidades', 'presencial', 'Presencial', 1, true),
  ('modalidades', 'remoto',     'Remoto',     2, true),
  ('modalidades', 'hibrido',    'Híbrido',    3, false),
  ('vinculos', 'aluno',        'Aluno(a)',                    1, true),
  ('vinculos', 'professor',    'Professor(a)',                2, true),
  ('vinculos', 'profissional', 'Profissional de saúde',       3, true),
  ('vinculos', 'acs',          'Agente comunitário de saúde', 4, false),
  ('vinculos', 'gestor',       'Gestor(a) público(a)',        5, false),
  ('vinculos', 'tecnico',      'Técnico(a) administrativo(a)', 6, false),
  ('vinculos', 'externo',      'Externo / outro',             7, true);

INSERT INTO hub.catalogo_itens (catalogo, codigo, nome, sigla, ordem, sistema) VALUES
  ('instituicoes', 'unifae',     'Centro Universitário das Faculdades Associadas de Ensino', 'UNIFAE', 1, true),
  ('instituicoes', 'ifsp',       'Instituto Federal de São Paulo, câmpus São João da Boa Vista', 'IFSP', 2, true),
  ('instituicoes', 'unesp',      'Universidade Estadual Paulista, câmpus de São João da Boa Vista', 'UNESP', 3, true),
  ('instituicoes', 'prefeitura', 'Prefeitura de São João da Boa Vista (Secretaria Municipal de Saúde)', 'SMS', 4, true),
  ('instituicoes', 'outra',      'Outra instituição', 'Outra', 9, true);

-- cursos citados nas 45 metas oficiais (coluna "Responsáveis"), ligados à instituição
INSERT INTO hub.catalogo_itens (catalogo, codigo, nome, pai_codigo, ordem) VALUES
  ('cursos', 'unifae-medicina',       'Medicina',                    'unifae', 1),
  ('cursos', 'unifae-enfermagem',     'Enfermagem',                  'unifae', 2),
  ('cursos', 'unifae-psicologia',     'Psicologia',                  'unifae', 3),
  ('cursos', 'unifae-fisioterapia',   'Fisioterapia',                'unifae', 4),
  ('cursos', 'unifae-farmacia',       'Farmácia',                    'unifae', 5),
  ('cursos', 'unifae-odontologia',    'Odontologia',                 'unifae', 6),
  ('cursos', 'unifae-eng-software',   'Engenharia de Software',      'unifae', 7),
  ('cursos', 'unifae-publicidade',    'Publicidade e Propaganda',    'unifae', 8),
  ('cursos', 'ifsp-computacao',       'Ciência da Computação',       'ifsp', 1),
  ('cursos', 'ifsp-ciencias-naturais','Ciências Naturais',           'ifsp', 2),
  ('cursos', 'unesp-eletronica-telecom', 'Engenharia Eletrônica e de Telecomunicações', 'unesp', 1),
  ('cursos', 'unesp-aeronautica',     'Engenharia Aeronáutica',      'unesp', 2);

-- territórios: provisórios até o Grupo I definir os 5 territórios reais
INSERT INTO hub.catalogo_itens (catalogo, codigo, nome, descricao, ordem) VALUES
  ('territorios', 'municipio',    'Município (todo)', 'Ação que vale para a cidade inteira', 0),
  ('territorios', 'centro',       'Centro',       'Provisório: substituir pela definição do Grupo I', 1),
  ('territorios', 'regiao-norte', 'Região Norte', 'Provisório: substituir pela definição do Grupo I', 2),
  ('territorios', 'regiao-sul',   'Região Sul',   'Provisório: substituir pela definição do Grupo I', 3),
  ('territorios', 'regiao-leste', 'Região Leste', 'Provisório: substituir pela definição do Grupo I', 4),
  ('territorios', 'regiao-oeste', 'Região Oeste', 'Provisório: substituir pela definição do Grupo I', 5);

-- atividades e ações passam a usar os cadastros (a validação sai do banco e vai para a API)
ALTER TABLE hub.atividades DROP CONSTRAINT IF EXISTS atividades_tipo_check;
ALTER TABLE hub.atividades DROP CONSTRAINT IF EXISTS atividades_modalidade_check;
ALTER TABLE hub.atividades ADD COLUMN territorio_codigo text;   -- território do cadastro; "territorio" segue como local livre
ALTER TABLE hub.acoes ADD COLUMN territorio_codigo text;

-- vínculo institucional da pessoa (códigos dos cadastros)
ALTER TABLE hub.usuarios
  ADD COLUMN vinculo text,
  ADD COLUMN instituicao text,
  ADD COLUMN curso text;
