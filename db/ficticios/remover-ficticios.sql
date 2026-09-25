-- Remove toda a carga fictícia (pessoas @ficticio.pet, suas atividades e as ações "[fictícia]").
DELETE FROM hub.atividades WHERE usuario_id IN (SELECT id FROM hub.usuarios WHERE email LIKE '%@ficticio.pet');
DELETE FROM hub.acoes WHERE titulo LIKE '[fictícia] %';
DELETE FROM hub.usuarios WHERE email LIKE '%@ficticio.pet';
