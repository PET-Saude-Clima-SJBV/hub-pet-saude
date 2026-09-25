-- DADOS FICTÍCIOS para validar fluxos e visões (dev e hml). NUNCA rodar em produção.
-- Pessoas, ações e atividades inventadas; e-mails @ficticio.pet. Idempotente: apaga e recria.
-- As senhas são aleatórias e desconhecidas: para ver o sistema como cada pessoa, use
-- Administração > Pessoas > "Ver como" (existe só fora do prod).
-- Sem usuário de servidor/GitHub: o sincronizador não cria nenhuma conta real para elas.

DO $$
DECLARE
  pessoas text[][] := ARRAY[
    -- nome, papel, grupo (0 = sem grupo), perfil
    ['Helena Duarte Figueira',   'coordenacao_geral', '0', 'usuario'],
    -- PET I
    ['Renata Campos Aguiar',     'coordenador', '1', 'usuario'],
    ['Marcelo Tavares Brandão',  'tutor',       '1', 'usuario'],
    ['Juliana Prado Nogueira',   'preceptor',   '1', 'usuario'],
    ['Otávio Lemos Carvalho',    'preceptor',   '1', 'usuario'],
    ['Beatriz Santana Moura',    'aluno',       '1', 'usuario'],
    ['Lucas Ferreira Antunes',   'aluno',       '1', 'usuario'],
    ['Camila Rezende Toledo',    'aluno',       '1', 'usuario'],
    -- PET II (núcleo técnico: alunos desenvolvedores)
    ['Patrícia Vilela Monteiro', 'coordenador', '2', 'usuario'],
    ['Diego Martins Furtado',    'aluno',       '2', 'desenvolvedor'],
    ['Larissa Queiroz Pimentel', 'aluno',       '2', 'desenvolvedor'],
    ['Thiago Barros Esteves',    'aluno',       '2', 'desenvolvedor'],
    ['Amanda Correia Siqueira',  'aluno',       '2', 'desenvolvedor'],
    ['Felipe Andrade Lacerda',   'aluno',       '2', 'desenvolvedor'],
    ['Gabriela Novaes Rocha',    'aluno',       '2', 'desenvolvedor'],
    ['Igor Cardoso Peixoto',     'aluno',       '2', 'desenvolvedor'],
    -- PET III
    ['Sílvia Mendes Arantes',    'coordenador', '3', 'usuario'],
    ['Roberto Farias Guedes',    'tutor',       '3', 'usuario'],
    ['Cláudia Ribeiro Batista',  'preceptor',   '3', 'usuario'],
    ['Eduardo Pires Magalhães',  'preceptor',   '3', 'usuario'],
    ['Isabela Coutinho Franco',  'aluno',       '3', 'usuario'],
    ['Rafael Dantas Moreira',    'aluno',       '3', 'usuario'],
    ['Letícia Amaral Bastos',    'aluno',       '3', 'usuario'],
    -- PET IV
    ['Fernanda Lopes Quintela',  'coordenador', '4', 'usuario'],
    ['André Sampaio Rangel',     'tutor',       '4', 'usuario'],
    ['Mônica Teixeira Vidal',    'preceptor',   '4', 'usuario'],
    ['Paulo Henrique Sá',        'preceptor',   '4', 'usuario'],
    ['Natália Freitas Borges',   'aluno',       '4', 'usuario'],
    ['Vinícius Gomes Paiva',     'aluno',       '4', 'usuario'],
    ['Carolina Mattos Leal',     'aluno',       '4', 'usuario'],
    -- PET V
    ['Luciana Barreto Assis',    'coordenador', '5', 'usuario'],
    ['Ricardo Neves Portela',    'tutor',       '5', 'usuario'],
    ['Adriana Cunha Mesquita',   'preceptor',   '5', 'usuario'],
    ['Marcos Vieira Salgado',    'preceptor',   '5', 'usuario'],
    ['Mariana Costa Albuquerque','aluno',       '5', 'usuario'],
    ['Bruno Oliveira Tenório',   'aluno',       '5', 'usuario'],
    ['Júlia Fontes Carneiro',    'aluno',       '5', 'usuario']
  ];
  p text[];
  uid uuid;
  v_email text;
  g int;
  meta record;
  acao_id int;
  aluno record;
  validador uuid;
  d date;
  i int;
  tipos text[] := ARRAY['acao_tecnica', 'reuniao', 'orientacao', 'estudo', 'producao', 'evento', 'gestao'];
  descricoes text[] := ARRAY[
    'Visita ao território com a equipe da UBS para levantamento de áreas de risco',
    'Reunião do grupo para planejamento das ações do mês',
    'Orientação com o tutor sobre a ficha do indicador',
    'Estudo dirigido sobre clima e agravos respiratórios',
    'Produção de material educativo para a sala de espera',
    'Participação em roda de conversa na comunidade',
    'Organização da planilha de mapeamento e registro das evidências'];
BEGIN
  -- limpa a carga anterior (atividades -> ações criadas por eles -> pessoas)
  DELETE FROM hub.atividades WHERE usuario_id IN (SELECT id FROM hub.usuarios WHERE email LIKE '%@ficticio.pet');
  DELETE FROM hub.acoes WHERE titulo LIKE '[fictícia] %';
  DELETE FROM hub.usuarios WHERE email LIKE '%@ficticio.pet';

  FOREACH p SLICE 1 IN ARRAY pessoas LOOP
    v_email := lower(translate(split_part(p[1], ' ', 1) || '.' || split_part(p[1], ' ', array_length(string_to_array(p[1], ' '), 1)),
                   'áàâãéêíóôõúçÁÉÍÓÚÇ', 'aaaaeeiooouucAEIOUC')) || '@ficticio.pet';
    INSERT INTO hub.usuarios (nome, email, senha_hash, papel, perfil, grupo)
    VALUES (p[1], v_email, crypt(gen_random_uuid()::text, gen_salt('bf')), p[2], p[4], NULLIF(p[3]::int, 0))
    RETURNING id INTO uid;
    -- todos entram no HUB do dev e do hml (para validar as visões); nada técnico, nada no prod
    INSERT INTO hub.permissoes_ambiente (usuario_id, ambiente, hub, banco, servidor)
    VALUES (uid, 'dev', true, 'nenhum', false), (uid, 'hml', true, 'nenhum', false), (uid, 'prod', false, 'nenhum', false);
  END LOOP;

  -- duas ações por grupo, na primeira meta de cada eixo que o grupo tem
  FOR g IN 1..5 LOOP
    i := 0;
    FOR meta IN SELECT DISTINCT ON (eixo) id, codigo FROM hub.metas WHERE grupo = g ORDER BY eixo, ordem LOOP
      i := i + 1;
      EXIT WHEN i > 2;
      INSERT INTO hub.acoes (meta_id, titulo, descricao, territorio, responsavel_id, prazo, status, criado_por)
      SELECT meta.id,
             '[fictícia] ' || (ARRAY['Mapear áreas críticas no território', 'Rodas de conversa na UBS'])[i],
             'Ação inventada para validar o fluxo meta → ação → atividade.',
             (ARRAY['Território Norte', 'Território Centro'])[i],
             u.id, current_date + (30 * i), (ARRAY['em_andamento', 'nao_iniciado'])[i], u.id
      FROM hub.usuarios u WHERE u.email LIKE '%@ficticio.pet' AND u.grupo = g AND u.papel IN ('tutor', 'coordenador')
      ORDER BY u.papel DESC LIMIT 1;
    END LOOP;
    UPDATE hub.metas SET status = 'em_andamento' WHERE id = (SELECT id FROM hub.metas WHERE grupo = g ORDER BY ordem LIMIT 1);
  END LOOP;

  -- atividades dos alunos e preceptores nas últimas 3 semanas
  FOR aluno IN
    SELECT u.id, u.grupo, row_number() OVER () AS n FROM hub.usuarios u
    WHERE u.email LIKE '%@ficticio.pet' AND u.papel IN ('aluno', 'preceptor')
  LOOP
    SELECT id INTO validador FROM hub.usuarios
     WHERE email LIKE '%@ficticio.pet' AND grupo = aluno.grupo AND papel IN ('tutor', 'coordenador')
     ORDER BY papel DESC LIMIT 1;
    SELECT a.id INTO acao_id FROM hub.acoes a JOIN hub.metas m ON m.id = a.meta_id
     WHERE m.grupo = aluno.grupo AND a.titulo LIKE '[fictícia] %' ORDER BY a.id LIMIT 1;

    FOR i IN 0..5 LOOP
      d := current_date - (i * 3 + (aluno.n % 3))::int;
      CONTINUE WHEN extract(isodow FROM d) > 5;   -- só dias úteis
      INSERT INTO hub.atividades (usuario_id, grupo, data, hora_inicio, hora_fim, tipo, modalidade, territorio, acao_id,
                                  descricao, validacao, validador_id, validado_em, motivo_devolucao)
      VALUES (aluno.id, aluno.grupo, d,
              make_time(8 + (i % 3) * 2, 0, 0), make_time(10 + (i % 3) * 2, (i % 2) * 30, 0),
              tipos[1 + ((aluno.n + i) % 7)::int], (ARRAY['presencial', 'remoto'])[1 + (i % 2)],
              CASE WHEN i % 2 = 0 THEN 'Território Norte' END,
              CASE WHEN i % 3 = 0 THEN acao_id END,
              descricoes[1 + ((aluno.n + i) % 7)::int],
              -- mais antigas validadas; a do meio de alguns devolvida; recentes aguardando
              CASE WHEN i >= 4 THEN 'validada' WHEN i = 3 AND aluno.n % 4 = 0 THEN 'devolvida' ELSE 'pendente' END,
              CASE WHEN i >= 4 OR (i = 3 AND aluno.n % 4 = 0) THEN validador END,
              CASE WHEN i >= 4 OR (i = 3 AND aluno.n % 4 = 0) THEN now() - interval '1 day' END,
              CASE WHEN i = 3 AND aluno.n % 4 = 0 THEN 'Faltou dizer qual ação/meta esta atividade atende.' END)
      RETURNING id INTO uid;
      INSERT INTO hub.evidencias (atividade_id, tipo, nome, url)
      VALUES (uid, 'link', 'Evidência fictícia', 'https://exemplo.org/evidencia-ficticia');
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Carga fictícia: % pessoas, % ações, % atividades',
    (SELECT count(*) FROM hub.usuarios WHERE email LIKE '%@ficticio.pet'),
    (SELECT count(*) FROM hub.acoes WHERE titulo LIKE '[fictícia] %'),
    (SELECT count(*) FROM hub.atividades a JOIN hub.usuarios u ON u.id = a.usuario_id WHERE u.email LIKE '%@ficticio.pet');
END $$;
