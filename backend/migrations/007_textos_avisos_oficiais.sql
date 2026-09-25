-- Padrão de texto do projeto: sem travessão (— ou –). Troca por hífen nos dados já carregados.
UPDATE hub.metas SET
  titulo          = replace(replace(titulo, '—', '-'), '–', '-'),
  acoes_sugeridas = replace(replace(acoes_sugeridas, '—', '-'), '–', '-'),
  responsaveis    = replace(replace(responsaveis, '—', '-'), '–', '-'),
  parceiros       = replace(replace(parceiros, '—', '-'), '–', '-')
WHERE titulo ~ '[—–]' OR acoes_sugeridas ~ '[—–]' OR responsaveis ~ '[—–]' OR parceiros ~ '[—–]';

UPDATE hub.indicadores SET nome = replace(replace(nome, '—', '-'), '–', '-') WHERE nome ~ '[—–]';

UPDATE hub.funcionalidades
   SET descricao = 'Card do clima com avisos oficiais do INMET, medições, previsão por hora e dos próximos dias'
 WHERE chave = 'clima_publico';
UPDATE hub.funcionalidades
   SET descricao = 'Mapa de São João da Boa Vista com intensidade por região (dados ilustrativos)'
 WHERE chave = 'mapa_publico';
