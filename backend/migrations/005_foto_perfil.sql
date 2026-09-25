-- Foto de perfil (opcional; sem foto, o sistema mostra as iniciais do nome)
ALTER TABLE hub.usuarios
  ADD COLUMN foto text,                 -- nome do arquivo no armazenamento
  ADD COLUMN foto_versao int NOT NULL DEFAULT 0;   -- muda a cada troca (evita cache antigo no navegador)
