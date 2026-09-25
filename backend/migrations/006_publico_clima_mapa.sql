-- Novos blocos da página externa: clima do momento (integração Open-Meteo) e mapa de calor.
-- Como toda funcionalidade nova, nascem "em teste" (aparecem só para administradores e
-- desenvolvedores logados); o administrador liga para o público quando validar.
INSERT INTO hub.funcionalidades (chave, nome, descricao, estado) VALUES
  ('clima_publico', 'Clima na página externa', 'Card com o clima do momento e orientação à população (fonte: Open-Meteo)', 'teste'),
  ('mapa_publico', 'Mapa de calor na página externa', 'Mapa de São João da Boa Vista com intensidade por região (dados ilustrativos)', 'teste')
ON CONFLICT (chave) DO NOTHING;
