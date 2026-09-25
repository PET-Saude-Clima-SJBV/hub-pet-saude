-- Cadastros da aba "Listas" da planilha de mapeamento, territórios reais (unidades de saúde),
-- grupos PET como cadastro e ficha do indicador completa (aba "Indicadores").
-- Também: de qual dispositivo veio cada registro (auditoria).

-- ------------------------------------------------------------------ novos cadastros
INSERT INTO hub.catalogos (chave, nome, descricao, ordem) VALUES
  ('grupos',              'Grupos PET',              'Grupos do projeto (PET I, PET II...)', 0),
  ('problemas',           'Problemas climáticos',    'Eventos climáticos mapeados pelos grupos', 7),
  ('doencas',             'Doenças e agravos',       'Doenças e agravos relacionados ao clima', 8),
  ('periodicidades',      'Periodicidades',          'Com que frequência o dado é coletado', 9),
  ('desagregacoes',       'Desagregações',           'Como o dado do indicador é separado (por região, por UBS...)', 10),
  ('tipos_indicador',     'Tipos de indicador',      'Processo, resultado ou impacto', 11),
  ('formatos_dado',       'Formatos do dado',        'Formato em que o dado é coletado', 12),
  ('levantamentos',       'Situação do levantamento', 'Se o dado necessário já existe', 13),
  ('situacoes_formulario','Situação do formulário',  'Se o formulário de coleta já existe', 14);

INSERT INTO hub.catalogo_itens (catalogo, codigo, nome, sigla, descricao, ordem, sistema) VALUES
  ('grupos', '1', 'PET I',   'PET I',   NULL, 1, true),
  ('grupos', '2', 'PET II',  'PET II',  'Cuidado Digital na APS', 2, true),
  ('grupos', '3', 'PET III', 'PET III', NULL, 3, true),
  ('grupos', '4', 'PET IV',  'PET IV',  NULL, 4, true),
  ('grupos', '5', 'PET V',   'PET V',   NULL, 5, true);

INSERT INTO hub.catalogo_itens (catalogo, codigo, nome, ordem, sistema) VALUES
  ('problemas', 'chuva-enchente', 'Chuva / Enchente', 1, true),
  ('problemas', 'alagamento', 'Alagamento', 2, true),
  ('problemas', 'seca-estiagem', 'Seca / Estiagem', 3, true),
  ('problemas', 'onda-calor', 'Onda de calor', 4, true),
  ('problemas', 'queimada-fumaca', 'Queimada / Fumaça', 5, true),
  ('problemas', 'frio-extremo', 'Frio extremo', 6, true),
  ('problemas', 'vendaval-tempestade', 'Vendaval / Tempestade', 7, true),
  ('problemas', 'deslizamento', 'Deslizamento', 8, true),
  ('problemas', 'outro', 'Outro', 99, true),
  ('doencas', 'leptospirose', 'Leptospirose', 1, true),
  ('doencas', 'arbovirose', 'Arbovirose (dengue, zika, chikungunya)', 2, true),
  ('doencas', 'dengue', 'Dengue', 3, true),
  ('doencas', 'hepatite', 'Hepatite', 4, true),
  ('doencas', 'escorpionismo', 'Escorpionismo e animais peçonhentos', 5, false),
  ('doencas', 'doencas-hidricas', 'Doenças hídricas', 6, false),
  ('periodicidades', 'unica', 'Única', 1, true),
  ('periodicidades', 'semanal', 'Semanal', 2, false),
  ('periodicidades', 'mensal', 'Mensal', 3, true),
  ('periodicidades', 'trimestral', 'Trimestral', 4, true),
  ('periodicidades', 'semestral', 'Semestral', 5, false),
  ('periodicidades', 'anual', 'Anual', 6, false),
  ('periodicidades', 'continua', 'Contínua', 7, true),
  ('desagregacoes', 'municipio', 'Município', 1, true),
  ('desagregacoes', 'regiao', 'Por região', 2, true),
  ('desagregacoes', 'ubs', 'Por UBS', 3, true),
  ('desagregacoes', 'faixa-etaria', 'Por faixa etária', 4, true),
  ('desagregacoes', 'sexo', 'Por sexo', 5, true),
  ('tipos_indicador', 'processo', 'Processo', 1, true),
  ('tipos_indicador', 'resultado', 'Resultado', 2, true),
  ('tipos_indicador', 'impacto', 'Impacto', 3, true),
  ('formatos_dado', 'numero', 'Número', 1, true),
  ('formatos_dado', 'texto', 'Texto', 2, true),
  ('formatos_dado', 'data', 'Data', 3, true),
  ('formatos_dado', 'foto', 'Foto', 4, true),
  ('formatos_dado', 'coordenada', 'Coordenada (GPS)', 5, true),
  ('formatos_dado', 'arquivo', 'Arquivo', 6, true),
  ('formatos_dado', 'sim-nao', 'Sim/Não', 7, true),
  ('levantamentos', 'ja-temos', 'Já temos', 1, true),
  ('levantamentos', 'parcial', 'Parcial', 2, true),
  ('levantamentos', 'a-realizar', 'A realizar', 3, true),
  ('situacoes_formulario', 'nao-precisa', 'Não precisa', 1, true),
  ('situacoes_formulario', 'ja-existe', 'Já existe', 2, true),
  ('situacoes_formulario', 'criar', 'Criar', 3, true);

-- ------------------------------------------------------------------ territórios reais: unidades de saúde
-- Código e sigla em ordem: PSF I..VIII, UBS I..V, USF I (ordem alfabética da lista da planilha)
DELETE FROM hub.catalogo_itens
 WHERE catalogo = 'territorios' AND codigo IN ('centro', 'regiao-norte', 'regiao-sul', 'regiao-leste', 'regiao-oeste')
   AND NOT EXISTS (SELECT 1 FROM hub.atividades a WHERE a.territorio_codigo = catalogo_itens.codigo)
   AND NOT EXISTS (SELECT 1 FROM hub.acoes a WHERE a.territorio_codigo = catalogo_itens.codigo);
UPDATE hub.catalogo_itens SET ativo = false
 WHERE catalogo = 'territorios' AND codigo IN ('centro', 'regiao-norte', 'regiao-sul', 'regiao-leste', 'regiao-oeste');

INSERT INTO hub.catalogo_itens (catalogo, codigo, nome, sigla, ordem, sistema) VALUES
  ('territorios', 'psf-i',    'PSF Dr. Alexis Hakim',                    'PSF I',    1, true),
  ('territorios', 'psf-ii',   'PSF Dr. Antenor José Bernardes',          'PSF II',   2, true),
  ('territorios', 'psf-iii',  'PSF Dr. Benedito Carlos Rocha Westin',    'PSF III',  3, true),
  ('territorios', 'psf-iv',   'PSF Dr. Ermelindo Adolpho Arriguci',      'PSF IV',   4, true),
  ('territorios', 'psf-v',    'PSF Dr. Geraldo Pradela',                 'PSF V',    5, true),
  ('territorios', 'psf-vi',   'PSF Dr. Raul de Oliveira Andrade',        'PSF VI',   6, true),
  ('territorios', 'psf-vii',  'PSF Dr. Sebastião José Rodrigues',        'PSF VII',  7, true),
  ('territorios', 'psf-viii', 'PSF Maria Gabriela Junqueira Valim',      'PSF VIII', 8, true),
  ('territorios', 'ubs-i',    'UBS Dr. Acidino de Andrade',              'UBS I',    9, true),
  ('territorios', 'ubs-ii',   'UBS Dr. Amado Gonçalves dos Santos',      'UBS II',   10, true),
  ('territorios', 'ubs-iii',  'UBS Dr. Delvo de Oliveira Westin',        'UBS III',  11, true),
  ('territorios', 'ubs-iv',   'UBS Dr. Paulo Emílio de Oliveira Azevedo', 'UBS IV',  12, true),
  ('territorios', 'ubs-v',    'UBS Dr. Paulo Roberto Sorci',             'UBS V',    13, true),
  ('territorios', 'usf-i',    'USF Dr. João Batista Nogueira Bueno',     'USF I',    14, true);
UPDATE hub.catalogo_itens SET ordem = 99 WHERE catalogo = 'territorios' AND codigo = 'municipio';

-- ------------------------------------------------------------------ grupo passa a vir do cadastro
ALTER TABLE hub.usuarios DROP CONSTRAINT IF EXISTS usuarios_grupo_check;
ALTER TABLE hub.usuarios ADD CONSTRAINT usuarios_grupo_check CHECK (grupo >= 1);
ALTER TABLE hub.metas DROP CONSTRAINT IF EXISTS metas_grupo_check;
ALTER TABLE hub.metas ADD CONSTRAINT metas_grupo_check CHECK (grupo >= 1);

-- ------------------------------------------------------------------ ficha do indicador completa (aba "Indicadores")
ALTER TABLE hub.indicadores DROP CONSTRAINT IF EXISTS indicadores_periodicidade_check;
ALTER TABLE hub.indicadores
  ALTER COLUMN linha_base TYPE text USING linha_base::text,     -- a planilha usa textos como "12,3" e "<= 11,3"
  ALTER COLUMN valor_alvo TYPE text USING valor_alvo::text,
  ADD COLUMN o_que_mede text,
  ADD COLUMN fonte_denominador text,
  ADD COLUMN desagregacao text,           -- código do cadastro "desagregacoes"
  ADD COLUMN linha_base_data text,
  ADD COLUMN linha_base_fonte text,
  ADD COLUMN prazo_alvo text,
  ADD COLUMN tipo text,                   -- código do cadastro "tipos_indicador"
  ADD COLUMN responsavel_validacao text;
COMMENT ON COLUMN hub.indicadores.fonte IS 'Fonte do numerador';
COMMENT ON COLUMN hub.indicadores.responsavel IS 'Responsável pela coleta';

-- ------------------------------------------------------------------ dispositivo de origem (auditoria)
ALTER TABLE hub.atividades
  ADD COLUMN dispositivo text CHECK (dispositivo IN ('celular', 'tablet', 'computador', 'desconhecido')),
  ADD COLUMN dispositivo_detalhe text,   -- sistema e navegador, ex.: "Android · Chrome"
  ADD COLUMN user_agent text;
ALTER TABLE hub.auditoria
  ADD COLUMN dispositivo text,
  ADD COLUMN dispositivo_detalhe text;
