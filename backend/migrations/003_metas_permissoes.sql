-- Metas, indicadores e ações (Meta -> Indicador -> Ação; atividades e evidências virão depois)
-- e matriz de permissões por papel (o que cada nível pode fazer e em que escopo).

CREATE TABLE hub.metas (
  id              serial PRIMARY KEY,
  codigo          text NOT NULL UNIQUE,                 -- G1-01 ... G5-09
  grupo           smallint NOT NULL CHECK (grupo BETWEEN 1 AND 5),
  eixo            text NOT NULL CHECK (eixo IN ('I', 'II', 'III')),
  titulo          text NOT NULL,
  acoes_sugeridas text,                                 -- texto oficial do edital
  prazo_inicio    smallint,                             -- mês do projeto (0 a 24)
  prazo_fim       smallint,
  responsaveis    text,
  parceiros       text,
  status          text NOT NULL DEFAULT 'nao_iniciado'
                    CHECK (status IN ('nao_iniciado', 'em_andamento', 'em_atraso', 'concluido')),
  ordem           int NOT NULL DEFAULT 0,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hub.indicadores (
  id                  serial PRIMARY KEY,
  meta_id             int NOT NULL REFERENCES hub.metas(id) ON DELETE CASCADE,
  nome                text NOT NULL,
  oficial             boolean NOT NULL DEFAULT false,   -- veio do documento oficial
  formula_numerador   text,
  formula_denominador text,
  unidade             text,
  linha_base          numeric,
  valor_alvo          numeric,
  fonte               text,
  periodicidade       text CHECK (periodicidade IN ('semanal', 'mensal', 'trimestral', 'semestral', 'anual', 'unica')),
  responsavel         text,
  observacoes         text,
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON hub.indicadores (meta_id);

CREATE TABLE hub.acoes (
  id             serial PRIMARY KEY,
  meta_id        int NOT NULL REFERENCES hub.metas(id) ON DELETE CASCADE,
  titulo         text NOT NULL,
  descricao      text,
  territorio     text,
  responsavel_id uuid REFERENCES hub.usuarios(id) ON DELETE SET NULL,
  prazo          date,
  status         text NOT NULL DEFAULT 'nao_iniciado'
                   CHECK (status IN ('nao_iniciado', 'em_andamento', 'em_atraso', 'concluido')),
  criado_por     uuid REFERENCES hub.usuarios(id) ON DELETE SET NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON hub.acoes (meta_id);

-- Matriz de permissões: papel x capacidade -> escopo
--   nenhum | proprio (só o que é da pessoa) | grupo (do grupo PET da pessoa) | todos
CREATE TABLE hub.papel_permissoes (
  papel      text NOT NULL,
  capacidade text NOT NULL,
  escopo     text NOT NULL CHECK (escopo IN ('nenhum', 'proprio', 'grupo', 'todos')),
  PRIMARY KEY (papel, capacidade)
);

INSERT INTO hub.papel_permissoes (papel, capacidade, escopo)
SELECT p.papel, c.capacidade, p.escopos[c.n]
FROM (VALUES
  --                        metas.ver metas.editar indic.editar acoes.ver acoes.editar pessoas.ver ativ.registrar ativ.validar ativ.auditar
  ('coordenacao_geral', ARRAY['todos', 'todos',     'todos',     'todos',  'todos',     'todos',    'proprio',     'nenhum',    'todos']),
  ('coordenador',       ARRAY['grupo', 'grupo',     'grupo',     'grupo',  'grupo',     'grupo',    'proprio',     'grupo',     'grupo']),
  ('tutor',             ARRAY['grupo', 'nenhum',    'grupo',     'grupo',  'grupo',     'grupo',    'proprio',     'grupo',     'nenhum']),
  ('preceptor',         ARRAY['grupo', 'nenhum',    'nenhum',    'grupo',  'nenhum',    'proprio',  'proprio',     'nenhum',    'nenhum']),
  ('aluno',             ARRAY['grupo', 'nenhum',    'nenhum',    'grupo',  'nenhum',    'proprio',  'proprio',     'nenhum',    'nenhum']),
  ('externo',           ARRAY['nenhum','nenhum',    'nenhum',    'nenhum', 'nenhum',    'nenhum',   'nenhum',      'nenhum',    'nenhum'])
) AS p(papel, escopos)
CROSS JOIN (VALUES
  (1, 'metas.ver'), (2, 'metas.editar'), (3, 'indicadores.editar'), (4, 'acoes.ver'), (5, 'acoes.editar'),
  (6, 'pessoas.ver'), (7, 'atividades.registrar'), (8, 'atividades.validar'), (9, 'atividades.auditar')
) AS c(n, capacidade);

-- Desenvolvedor do Grupo II também é usuário do HUB em produção (registra as próprias atividades)
UPDATE hub.permissoes_ambiente p SET hub = true
  FROM hub.usuarios u WHERE u.id = p.usuario_id AND u.perfil = 'desenvolvedor' AND p.ambiente = 'prod';

-- Carga das 45 metas oficiais (planilha 45_Metas_PET_por_Grupo_e_Eixo.xlsx da Coordenação Geral).
-- Ordem e texto como no documento oficial (anterior à troca de metas II <-> IV, ainda a pactuar).
INSERT INTO hub.metas (codigo, grupo, eixo, titulo, acoes_sugeridas, prazo_inicio, prazo_fim, responsaveis, parceiros, ordem) VALUES
  ('G1-01', 1, 'I', 'Monitorar ≥ 70% dos agravos prioritários relacionados ao clima', 'Vigilância integrada, análise epidemiológica e monitoramento territorial contínuo', 0, 24, 'UNIFAE: Medicina, Enfermagem', 'APS Vigilância Epidemiológica – Integrado ao Departamento Municipal de Saúde', 1),
  ('G1-02', 1, 'I', 'Reduzir agravos respiratórios relacionados às queimadas em territórios prioritários', 'Monitoramento territorial; educação em saúde; campanhas preventivas; apoio à APS', 12, 24, 'UNIFAE: Medicina, Fisioterapia', 'Vigilância Epidemiológica – Integrado ao Departamento Municipal de Saúde; Departamento Municipal de Meio Ambiente, Agricultura e Abastecimento; Departamento Municipal de Saúde', 2),
  ('G1-03', 1, 'II', 'Integrar ≥ 50% dos serviços especializados à APS', 'Articulação entre ambulatórios, CAPS, reabilitação e APS; reuniões de rede; regulação territorial', 12, 24, 'UNIFAE: Medicina, Enfermagem, Fisioterapia, Psicologia', 'Ambulatório Médico Municipal; Rede Especializada; Vigilância Epidemiológica – Integrado ao Departamento Municipal de Saúde', 3),
  ('G1-04', 1, 'II', 'Monitorar ≥ 100 usuários em condições sensíveis ao clima', 'Telemonitoramento; estratificação de risco; acompanhamento clínico territorial', 0, 24, 'UNIFAE: Enfermagem, Medicina, Engenharia de Software', 'APS; Departamento Municipal de Saúde', 4),
  ('G1-05', 1, 'II', 'Implantar ≥ 4 protocolos de resposta rápida para agravos respiratórios', 'Protocolos clínicos; fluxos assistenciais; monitoramento de pacientes crônicos', 6, 12, 'UNIFAE: Enfermagem, Fisioterapia, Medicina', 'APS; Vigilância Epidemiológica – Integrado ao Departamento Municipal de Saúde', 5),
  ('G1-06', 1, 'II', 'Implantar ≥ 4 linhas de cuidado em reabilitação climática', 'Avaliação funcional; reabilitação respiratória; fisioterapia comunitária', 6, 18, 'UNIFAE: Fisioterapia, Medicina', 'APS; Departamento Municipal de Saúde', 6),
  ('G1-07', 1, 'II', 'Realizar ≥ 300 atendimentos de reabilitação vinculados ao projeto', 'Atendimentos individuais e coletivos; grupos terapêuticos', 6, 24, 'UNIFAE: Fisioterapia', 'APS; Departamento Municipal de Saúde', 7),
  ('G1-08', 1, 'III', 'Monitorar digitalmente ≥ 300 usuários vulneráveis', 'Telemonitoramento clínico e territorial', 6, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia', 'APS; Departamento Municipal de Tecnologia da Informação; Departamento Municipal de Saúde; Centro de Atenção Psicossocial (CAPS)', 8),
  ('G1-09', 1, 'III', 'Realizar ≥ 10 fóruns comunitários digitais e presenciais', 'Fóruns territoriais sobre saúde e clima', 6, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia', 'Conselhos Municipais; Associações Comunitárias', 9),
  ('G2-01', 2, 'I', 'Mapear ≥ 60% das áreas de risco socioambiental do município relacionadas a arboviroses, enchentes e eventos climáticos', 'Geoprocessamento; uso de drones; análise espacial; sensores ambientais; visitas territoriais; georreferenciamento de enchentes, queimadas e agravos climáticos', 0, 12, 'UNIFAE: Engenharia de Software; IFSP: Ciências da Natureza', 'Departamento Municipal de Gestão e Planejamento Urbano; Departamento Municipal de Engenharia; Defesa Civil - Integrado ao Departamento de Trânsito e Segurança - Departamento de Trânsito e Segurança Municipal; Vigilância Epidemiológica – Integrado ao Departamento Municipal de Saúde', 10),
  ('G2-02', 2, 'I', 'Monitorar ≥ 70% das áreas críticas para escorpiões e animais peçonhentos', 'Inspeções territoriais; controle ambiental; manejo de resíduos; ações educativas', 6, 24, 'UNIFAE: Enfermagem, Medicina, Odontologia; IFSP: Ciências Naturais', 'Centro de Controle de Zoonoses - CCZ “Enfa. Carmen L. Paione” - Integrado ao Departamento Municipal de Saúde Vigilância Sanitária – Integrado ao Departamento Municipal de Saúde; Departamento Municipal de Obras e Serviços Públicos Departamento Municipal de Meio Ambiente, Agricultura e Abastecimento', 11),
  ('G2-03', 2, 'II', 'Implantar protocolos de cuidado territorializado para agravos climáticos', 'Protocolos para doenças respiratórias, arboviroses, leptospirose, sofrimento psíquico e agravos dermatológicos', 6, 18, 'UNIFAE: Medicina, Farmácia, Odontologia', 'Departamento Municipal de Saúde; Vigilância Sanitária', 12),
  ('G2-04', 2, 'II', 'Reduzir em ≥ 10% o tempo médio de espera para atendimento especializado', 'Gestão territorial do acesso; reorganização dos fluxos; regulação integrada', 12, 24, 'UNIFAE: Medicina, Engenharia de Software', 'Ambulatório Médico Municipal; Departamento Municipal de Saúde Departamento Municipal de Tecnologia da Informação', 13),
  ('G2-05', 2, 'II', 'Implantar acompanhamento digital para ≥ 150 usuários prioritários', 'Plataforma digital de cuidado; telessaúde; monitoramento remoto', 6, 18, 'UNIFAE: Engenharia de Software; UNESP: Engenharia Eletrônica e de Telecomunicações IFSP: Ciência da Computação', 'Departamento Municipal de Tecnologia da Informação; Centro de Atenção Psicossocial (CAPS) – Integrado ao Departamento Municipal de Saúde', 14),
  ('G2-06', 2, 'III', 'Implantar ≥ 1 plataforma integrada de vigilância climática e saúde', 'Desenvolvimento de plataforma digital integrada com dados epidemiológicos, ambientais e territoriais', 6, 18, 'UNIFAE: Engenharia de Software; UNESP: Engenharia Eletrônica e de Telecomunicações; IFSP: Ciências Naturais, Ciência da Computação', 'Departamento Municipal de Tecnologia da Informação; Departamento Municipal de Saúde', 15),
  ('G2-07', 2, 'III', 'Integrar ≥ 3 sistemas de informação em saúde e ambiente', 'Integração e-SUS, vigilância epidemiológica, dados ambientais e Defesa Civil', 6, 18, 'UNIFAE: Engenharia de Software; UNESP: Engenharia Eletrônica e de Telecomunicações; IFSP: Ciências Naturais, Ciência da Computação', 'Defesa Civil - Integrado ao Departamento Municipal de Trânsito e Segurança Vigilância Epidemiológica – Integrado ao Departamento Municipal de Saúde', 16),
  ('G2-08', 2, 'III', 'Implantar ≥ 1 dashboard validado para gestão territorial', 'Desenvolvimento de painéis analíticos com indicadores climáticos e epidemiológicos', 6, 12, 'UNIFAE: Engenharia de Software; UNESP: Engenharia Eletrônica e de Telecomunicações; IFSP: Ciências Naturais, Ciência da Computação', 'Departamento Municipal de Gestão e Planejamento Urbano; Departamento Municipal de Engenharia; Departamento Municipal de Saúde', 17),
  ('G2-09', 2, 'III', 'Implantar ≥ 1 sistema de georreferenciamento de áreas críticas', 'Georreferenciamento de enchentes, queimadas e vetores', 6, 18, 'UNIFAE: Engenharia de Software; UNESP: Engenharia Eletrônica e de Telecomunicações, Engenharia Aeronáutica; IFSP: Ciências Naturais, Ciência da Computação', 'Defesa Civil - Integrado ao Departamento de Trânsito e Segurança; Departamento Municipal de Gestão e Planejamento Urbano', 18),
  ('G3-01', 3, 'I', 'Realizar ≥ 10 ações de saúde mental relacionadas à exposição ambiental', 'Grupos terapêuticos; acolhimento psicossocial; educação em saúde mental', 6, 24, 'UNIFAE: Enfermagem, Medicina, Psicologia, Publicidade e Propaganda', 'Departamento Municipal de Saúde; CAPS; Departamento Municipal de Assistência Social', 19),
  ('G3-02', 3, 'II', 'Reduzir em ≥ 12% o abandono de tratamento em saúde mental', 'Busca ativa; grupos terapêuticos; cuidado compartilhado APS–CAPS', 12, 24, 'UNIFAE: Psicologia, Enfermagem', 'Centro de Atenção Psicossocial (CAPS) – Integrado ao Departamento Municipal de Saúde Departamento Municipal de Assistência Social', 20),
  ('G3-03', 3, 'II', 'Implantar ≥ 6 grupos terapêuticos territoriais', 'Grupos de apoio psicossocial; rodas de conversa; oficinas comunitárias', 0, 24, 'UNIFAE: Psicologia, Publicidade e Propaganda', 'Centro de Referência de Assistência Social (CRAS) – Integrado ao Departamento Municipal de Assistência Social; Centro de Referência Especializado da Assistência Social (CREAS) - Integrado ao Departamento Municipal de Assistência Social;', 21),
  ('G3-04', 3, 'II', 'Realizar ≥ 15 ações comunitárias de saúde mental pós-desastres', 'Acolhimento psicossocial; intervenções comunitárias; educação emocional', 6, 24, 'UNIFAE: Psicologia', 'Defesa Civil - Integrado ao Departamento de Trânsito e Segurança Conselho Municipal dos direitos da Pessoa com deficiência (CMDPcD) Conselho Municipal dos direitos da Criança e do Adolescente (CMDCA)', 22),
  ('G3-05', 3, 'III', 'Implantar ≥ 5 estratégias comunitárias de comunicação territorial', 'Comunicação comunitária em UBS, CRAS, escolas e territórios vulneráveis', 6, 18, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia, Publicidade e Propaganda', 'Centro de Referência de Assistência Social (CRAS) – Integrado ao Departamento Municipal de Assistência Social; Centro de Referência Especializado da Assistência Social (CREAS) - Integrado ao Departamento Municipal de Assistência Social; Conselho Municipal de Saúde (CMS)', 23),
  ('G3-06', 3, 'III', 'Implantar ≥ 3 estratégias de telessaúde vinculadas ao projeto', 'Teleconsultorias; teleorientações; acompanhamento remoto', 6, 18, 'Medicina; Ciência da Computação', 'APS; Departamento Municipal de Saúde', 24),
  ('G3-07', 3, 'III', 'Realizar ≥ 10 fóruns comunitários digitais e presenciais', 'Fóruns territoriais sobre saúde e clima', 6, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia', 'Conselhos Municipais; Associações Comunitárias', 25),
  ('G3-08', 3, 'III', 'Realizar ≥ 1 Conferência Municipal PET-Saúde: Clima', 'Conferência municipal integrada à gestão e comunidade', 12, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia', 'Conselho Municipal de Meio Ambiente (CONDEMA) Departamento Municipal de Meio Ambiente, Agricultura e Abastecimento Conselho Municipal de Saúde (CMS) Departamento Municipal de Saúde', 26),
  ('G3-09', 3, 'III', 'Capacitar ≥ 300 estudantes e lideranças comunitárias em comunicação em saúde', 'Oficinas de comunicação popular e educação climática', 6, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia, Publicidade e Propaganda', 'Conselho Municipal dos direitos da Criança e do Adolescente (CMDCA) Departamento Municipal de Educação Departamento Municipal de Comunicação Social Associações Comunitárias Departamento Municipal de Meio Ambiente, Agricultura e Abastecimento', 27),
  ('G4-01', 4, 'I', 'Reduzir em ≥ 15% o tempo médio de notificação de agravos relacionados às emergências climáticas', 'Integração APS–Vigilância–Defesa Civil - Integrado ao Departamento de Trânsito e Segurança - Departamento de Trânsito e Segurança; protocolos territoriais de resposta rápida; capacitação das equipes', 6, 18, 'UNIFAE: Enfermagem, Medicina, Farmácia', 'Departamento Municipal de Saúde APS Vigilância Epidemiológica – Integrado ao Departamento Municipal de Saúde; Defesa Civil - Integrado ao Departamento de Trânsito e Segurança - Departamento de Trânsito e Segurança', 28),
  ('G4-02', 4, 'I', 'Reduzir em ≥ 10% os casos de dengue, zika e chikungunya em áreas prioritárias', 'Campanhas educativas; eliminação de criadouros; visitas domiciliares; monitoramento vetorial; mutirões comunitários', 12, 24, 'UNIFAE:  Enfermagem; Medicina; Publicidade e Propaganda', 'Departamento Municipal de Saúde Centro de Controle de Zoonoses - CCZ “Enfa. Carmen L. Paione” - Integrado ao Departamento Municipal de Saúde Vigilância Epidemiológica – Integrado ao Departamento Municipal de Saúde; Departamento Municipal de Educação', 29),
  ('G4-03', 4, 'I', 'Reduzir em ≥ 8% a incidência de leptospirose em territórios prioritários', 'Educação em saúde; limpeza pós-enchente; controle de roedores; orientação sobre manejo seguro da água e lama', 12, 24, 'UNIFAE: Medicina, Enfermagem,  Farmácia', 'Centro de Controle de Zoonoses - CCZ “Enfa. Carmen L. Paione” - Integrado ao Departamento Municipal de Saúde Vigilância Sanitária – Integrado ao Departamento Municipal de Saúde; Defesa Civil - Integrado ao Departamento de Trânsito e Segurança', 30),
  ('G4-04', 4, 'II', 'Implantar ≥ 3 fluxos assistenciais integrados APS–CAPS–Rede Especializada', 'Construção de protocolos clínicos; organização da linha de cuidado climática; pactuação intersetorial; matriciamento da APS', 6, 18, 'UNIFAE: Medicina, Enfermagem, Psicologia', 'Departamento Municipal de Saúde; Centro de Atenção Psicossocial (CAPS); Conselho Municipal de Saúde (CMS)', 31),
  ('G4-05', 4, 'II', 'Reduzir complicações relacionadas às doenças hídricas em territórios prioritários', 'Monitoramento clínico; educação em saúde; visitas domiciliares', 12, 24, 'UNIFAE: Enfermagem, Medicina', 'APS; Departamento Municipal de Saúde; Defesa Civil - Integrado ao Departamento de Trânsito e Segurança', 32),
  ('G4-06', 4, 'II', 'Realizar ≥ 2 seminários científicos municipais PET-Saúde: Clima', 'Eventos científicos; integração ensino-serviço-comunidade', 12, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Odontologia, Medicina, Psicologia', 'Conselho Municipal de Saúde (CMS); Conselho Municipal de Meio Ambiente (CONDEMA) Departamento Municipal de Saúde Departamento Municipal de Meio Ambiente, Agricultura e Abastecimento Departamento Municipal de Educação', 33),
  ('G4-07', 4, 'III', 'Implantar sistema de alerta territorial com ≥ 70% de cobertura', 'Desenvolvimento de protocolos digitais; integração com Defesa Civil e Vigilância', 6, 18, 'UNIFAE: Engenharia de Software; UNESP: Engenharia Eletrônica e de Telecomunicações; IFSP: Ciências Naturais, Ciência da Computação', 'Defesa Civil - Integrado ao Departamento Municipal de Trânsito e Segurança Vigilância Epidemiológica – Integrado ao Departamento Municipal de Saúde', 34),
  ('G4-08', 4, 'III', 'Desenvolver ≥ 1 aplicativo de orientação à população em eventos extremos', 'Aplicativo com alertas, orientações sanitárias, mapas e comunicação emergencial', 12, 18, 'UNIFAE: Engenharia de Software; UNESP: Engenharia Eletrônica e de Telecomunicações; IFSP: Ciências Naturais, Ciência da Computação', 'Departamento Municipal de Comunicação Social; Defesa Civil - Integrado ao Departamento Municipal de Trânsito e Segurança', 35),
  ('G4-09', 4, 'III', 'Implantar ≥ 1 sistema de georreferenciamento de áreas críticas', 'Georreferenciamento de enchentes, queimadas e vetores', 6, 18, 'UNIFAE: Engenharia de Software; UNESP: Engenharia Eletrônica e de Telecomunicações, Engenharia Aeronáutica; IFSP: Ciências Naturais, Ciência da Computação', 'Defesa Civil - Integrado ao Departamento de Trânsito e Segurança; Departamento Municipal de Gestão e Planejamento Urbano', 36),
  ('G5-01', 5, 'I', 'Monitorar ≥ 70% das áreas críticas para proliferação vetorial', 'Georreferenciamento de focos; inspeções ambientais; monitoramento digital de arboviroses', 6, 24, 'UNIFAE:  Engenharia de Software; IFSP: Ciências Naturais', 'Departamento Municipal de Meio Ambiente, Agricultura e Abastecimento; Departamento Municipal de Saúde; Vigilância Sanitária – Integrado ao Departamento Municipal de Saúde', 37),
  ('G5-02', 5, 'I', 'Ampliar em ≥ 30% as ações preventivas relacionadas à hepatite A e doenças de veiculação hídrica', 'Campanhas educativas; distribuição de materiais; educação sanitária; visitas domiciliares', 6, 24, 'UNIFAE: Enfermagem,  Medcina, Odontologia, Publicidade e Propaganda', 'Departamento Municipal de Saúde; Vigilância Sanitária – Integrado ao Departamento Municipal de Saúde; Departamento Municipal de Educação; Departamento Municipal de Assistência Social', 38),
  ('G5-03', 5, 'II', 'Produzir documentário, e-book e materiais científicos vinculados ao eixo', 'Sistematização científica; produção audiovisual; divulgação científica', 12, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia, Publicidade e Propaganda, Editora UNIFAE UNESP: Engenharia Eletrônica e de Telecomunicações, Engenharia Aeronáutica IFSP: Ciências Naturais, Ciência da Computação', 'Departamento Municipal de Saúde Departamento Municipal de Tecnologia da Informação', 39),
  ('G5-04', 5, 'III', 'Produzir ≥ 80 conteúdos digitais educativos', 'Produção de vídeos, podcasts, cartilhas, reels, infográficos e campanhas', 0, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia, Publicidade e Propaganda', 'Departamento Municipal de Comunicação Social; Departamento Municipal de Educação; Departamento Municipal de Meio Ambiente, Agricultura e Abastecimento; Departamento Municipal de Saúde', 40),
  ('G5-05', 5, 'III', 'Realizar ≥ 20 campanhas educativas territoriais', 'Campanhas presenciais e digitais sobre enchentes, queimadas, dengue, leptospirose e resíduos', 0, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia, Publicidade e Propaganda', 'Vigilância Sanitária; Departamento Municipal de Meio Ambiente, Agricultura e Abastecimento', 41),
  ('G5-06', 5, 'III', 'Produzir ≥ 8 episódios de podcast “Saúde e Clima”', 'Podcasts educativos com especialistas e comunidade', 6, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia, Publicidade e Propaganda', 'TVs e Rádios locais; Departamento Municipal de Comunicação Social Departamento Municipal de Saúde Departamento Municipal de Meio Ambiente, Agricultura e Abastecimento', 42),
  ('G5-07', 5, 'III', 'Desenvolver ≥ 15 ações educativas contra fake news em saúde', 'Educação midiática; oficinas; campanhas digitais', 6, 24, 'UNIFAE: Enfermagem, Farmácia, Fisioterapia, Medicina, Odontologia, Psicologia, Publicidade e Propaganda', 'Departamento Municipal de Comunicação Social Departamento Municipal de Saúde Departamento Municipal de Educação', 43),
  ('G5-08', 5, 'III', 'Realizar ≥ 15 capacitações interprofissionais em comunicação e tecnologia', 'Formação integrada ensino-serviço', 6, 24, 'UNIFAE: Engenharia de Software, Publicidade e Propaganda UNESP: Engenharia Eletrônica e de Telecomunicações, Engenharia Aeronáutica; IFSP: Ciência da Computação', 'Departamento Municipal de Tecnologia da Informação Departamento Municipal de Saúde', 44),
  ('G5-09', 5, 'III', 'Produzir documentário institucional PET-Saúde: Clima', 'Produção audiovisual territorial', 12, 24, 'UNIFAE: Engenharia de Software, Publicidade e Propaganda UNESP: Engenharia Eletrônica e de Telecomunicações, Engenharia Aeronáutica; IFSP: Ciência da Computação', 'Departamento Municipal de Saúde; Departamento Municipal de Tecnologia da Informação; Departamento Municipal de Comunicação Social', 45);

-- Indicador oficial de cada meta (ficha ainda incompleta: fórmula, linha de base etc. a preencher)
INSERT INTO hub.indicadores (meta_id, nome, oficial)
SELECT m.id, v.nome, true FROM (VALUES
  ('G1-01', 'Nº relatórios epidemiológicos produzidos'),
  ('G1-02', 'Nº de atendimentos relacionados'),
  ('G1-03', '% serviços integrados'),
  ('G1-04', 'Nº usuários acompanhados'),
  ('G1-05', 'Nº protocolos implantados'),
  ('G1-06', 'Nº linhas implantadas'),
  ('G1-07', 'Nº atendimentos realizados'),
  ('G1-08', 'Nº usuários monitorados'),
  ('G1-09', 'Nº fóruns realizados'),
  ('G2-01', '% do território mapeado'),
  ('G2-02', '% áreas monitoradas'),
  ('G2-03', 'Nº protocolos implantados'),
  ('G2-04', 'Tempo médio de espera'),
  ('G2-05', 'Nº usuários acompanhados'),
  ('G2-06', 'Plataforma implantada'),
  ('G2-07', 'Nº sistemas integrados'),
  ('G2-08', 'Dashboard implantado'),
  ('G2-09', 'Sistema implantado'),
  ('G3-01', 'Nº de ações realizadas'),
  ('G3-02', 'Taxa de abandono'),
  ('G3-03', 'Nº grupos ativos'),
  ('G3-04', 'Nº ações realizadas'),
  ('G3-05', 'Nº estratégias implantadas'),
  ('G3-06', 'Nº estratégias implantadas'),
  ('G3-07', 'Nº fóruns realizados'),
  ('G3-08', 'Conferência realizada'),
  ('G3-09', 'Nº participantes capacitados'),
  ('G4-01', 'Tempo médio de notificação'),
  ('G4-02', 'Taxa de incidência'),
  ('G4-03', 'Taxa de incidência'),
  ('G4-04', 'Nº fluxos implantados'),
  ('G4-05', 'Taxa de complicações'),
  ('G4-06', 'Nº seminários realizados'),
  ('G4-07', '% cobertura territorial'),
  ('G4-08', 'Aplicativo desenvolvido'),
  ('G4-09', 'Sistema implantado'),
  ('G5-01', '% áreas monitoradas'),
  ('G5-02', 'Nº de ações realizadas'),
  ('G5-03', 'Nº materiais produzidos'),
  ('G5-04', 'Nº conteúdos produzidos'),
  ('G5-05', 'Nº campanhas realizadas'),
  ('G5-06', 'Nº episódios produzidos'),
  ('G5-07', 'Nº ações realizadas'),
  ('G5-08', 'Nº capacitações'),
  ('G5-09', 'Documentário produzido')
) AS v(codigo, nome) JOIN hub.metas m ON m.codigo = v.codigo;

