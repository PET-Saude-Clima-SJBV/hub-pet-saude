-- Mapa de problemas e doenças: camadas (as listas da planilha de mapeamento) e registros georreferenciados.
-- Hoje os registros são FICTÍCIOS. Depois virão do registro em campo dos alunos (origem 'campo')
-- e de importações de dados oficiais (origem 'importacao').
-- Privacidade: camadas de doença mostram FOCOS AMBIENTAIS ou CONCENTRAÇÃO POR REGIÃO, nunca o endereço de um caso.

CREATE TABLE hub.mapa_camadas (
  chave      text PRIMARY KEY,
  grupo      text NOT NULL CHECK (grupo IN ('clima', 'saude')),
  nome       text NOT NULL,
  descricao  text NOT NULL,          -- o que o mapa mostra, em uma frase
  exibicao   text NOT NULL CHECK (exibicao IN ('calor', 'pontos')),
  cor        text NOT NULL,
  publica    boolean NOT NULL DEFAULT true,
  ordem      int NOT NULL DEFAULT 0
);

CREATE TABLE hub.mapa_registros (
  id            bigserial PRIMARY KEY,
  camada        text NOT NULL REFERENCES hub.mapa_camadas(chave) ON DELETE CASCADE,
  lat           double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng           double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  intensidade   numeric NOT NULL DEFAULT 1 CHECK (intensidade BETWEEN 0 AND 1),
  descricao     text,
  territorio    text,
  registrado_em date NOT NULL DEFAULT current_date,
  origem        text NOT NULL CHECK (origem IN ('ficticio', 'campo', 'importacao')),
  atividade_id  uuid REFERENCES hub.atividades(id) ON DELETE SET NULL,   -- registro em campo que gerou o ponto
  criado_por    uuid REFERENCES hub.usuarios(id) ON DELETE SET NULL
);
CREATE INDEX ON hub.mapa_registros (camada);

INSERT INTO hub.mapa_camadas (chave, grupo, nome, descricao, exibicao, cor, ordem) VALUES
  ('chuva_enchente',   'clima', 'Chuva e enchente',       'Áreas mais afetadas por chuva forte e enchente.',                         'calor',  '#378ADD', 1),
  ('alagamento',       'clima', 'Pontos de alagamento',   'Ruas e locais que alagam com frequência.',                                'pontos', '#1F5FA3', 2),
  ('onda_calor',       'clima', 'Ilhas de calor',         'Regiões mais quentes da cidade nos dias de calor.',                       'calor',  '#E24B4A', 3),
  ('queimada',         'clima', 'Queimadas e fumaça',     'Locais com registro de queimada.',                                        'pontos', '#8A5A10', 4),
  ('seca',             'clima', 'Seca e estiagem',        'Áreas com mais falta de água e poeira no período seco.',                  'calor',  '#E0A040', 5),
  ('deslizamento',     'clima', 'Risco de deslizamento',  'Encostas e terrenos com risco de deslizamento na chuva.',                 'pontos', '#6B4FA3', 6),
  ('dengue',           'saude', 'Focos de dengue',        'Criadouros do mosquito encontrados nas vistorias.',                       'pontos', '#B3302F', 7),
  ('arboviroses',      'saude', 'Dengue, zika e chikungunya', 'Concentração de casos por região (sem endereço de pacientes).',       'calor',  '#E24B4A', 8),
  ('leptospirose',     'saude', 'Leptospirose',           'Áreas de risco: alagamento, lixo acumulado e presença de roedores.',     'calor',  '#0F6B64', 9),
  ('escorpioes',       'saude', 'Escorpiões e peçonhentos', 'Locais com registro de escorpião, cobra ou aranha.',                   'pontos', '#3B2A6B', 10),
  ('doencas_hidricas', 'saude', 'Doenças hídricas',       'Concentração de hepatite A e diarreias por região (sem endereço de pacientes).', 'calor', '#1D9E75', 11);

-- Registros fictícios: aglomerados em volta de "focos" inventados, diferentes por camada.
-- Coordenadas ao redor do centro de São João da Boa Vista. NÃO representam a realidade.
DO $$
DECLARE
  c record;
  foco record;
  i int;
  semente double precision := 0.42;
BEGIN
  PERFORM setseed(semente);
  FOR c IN SELECT chave, exibicao FROM hub.mapa_camadas LOOP
    FOR foco IN
      SELECT -21.9692 + (random() - 0.5) * 0.05 AS lat, -46.7983 + (random() - 0.5) * 0.06 AS lng,
             0.5 + random() * 0.5 AS peso
      FROM generate_series(1, CASE WHEN c.exibicao = 'calor' THEN 4 ELSE 5 END)
    LOOP
      FOR i IN 1..(CASE WHEN c.exibicao = 'calor' THEN 35 ELSE 4 + floor(random() * 5)::int END) LOOP
        INSERT INTO hub.mapa_registros (camada, lat, lng, intensidade, descricao, territorio, registrado_em, origem)
        VALUES (c.chave,
                foco.lat + (random() - 0.5) * (CASE WHEN c.exibicao = 'calor' THEN 0.010 ELSE 0.006 END),
                foco.lng + (random() - 0.5) * (CASE WHEN c.exibicao = 'calor' THEN 0.012 ELSE 0.007 END),
                round((foco.peso * (0.6 + random() * 0.4))::numeric, 2),
                CASE WHEN c.exibicao = 'pontos' THEN 'Registro fictício para demonstração' END,
                (ARRAY['Região Norte', 'Região Sul', 'Região Leste', 'Região Oeste', 'Centro'])[1 + floor(random() * 5)::int],
                current_date - floor(random() * 60)::int,
                'ficticio');
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Cards da página externa: texto explicando cada número
ALTER TABLE hub.indicadores_publicos ADD COLUMN detalhe text, ADD COLUMN fonte text;
UPDATE hub.indicadores_publicos SET
  detalhe = 'Territórios são as áreas da cidade onde o projeto atua de forma contínua. Em cada um, as equipes acompanham os problemas ligados ao clima e as unidades de saúde da região.',
  fonte = 'Definição dos territórios pelo Grupo I do PET-Saúde'
 WHERE titulo = 'Territórios acompanhados';
UPDATE hub.indicadores_publicos SET
  detalhe = 'Ações são atividades planejadas para cumprir as metas do projeto, como vistorias, rodas de conversa e campanhas. Aqui entram as que já começaram e ainda não terminaram.',
  fonte = 'Registro de ações no HUB PET-Saúde'
 WHERE titulo = 'Ações em andamento';
UPDATE hub.indicadores_publicos SET
  detalhe = 'São os compromissos do projeto com o Ministério da Saúde, divididos em 3 eixos de atuação e distribuídos entre os 5 grupos do PET-Saúde.',
  fonte = 'Edital do Ministério da Saúde nº 23/2026'
 WHERE titulo = 'Metas do projeto';
UPDATE hub.indicadores_publicos SET
  detalhe = 'Avisos de calor extremo, baixa umidade ou chuva forte publicados para a cidade no mês. Os avisos oficiais vêm do INMET e da Defesa Civil.',
  fonte = 'INMET e Defesa Civil'
 WHERE titulo = 'Alertas climáticos no mês';

INSERT INTO hub.funcionalidades (chave, nome, descricao, estado) VALUES
  ('mapa_problemas', 'Mapa de problemas e doenças', 'Mapa com camadas de problemas climáticos e doenças (hoje com registros fictícios)', 'teste')
ON CONFLICT (chave) DO NOTHING;
