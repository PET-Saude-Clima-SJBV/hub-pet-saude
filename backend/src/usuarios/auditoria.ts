import { DbService } from '../db/db.service';

export async function registrarAuditoria(
  db: DbService,
  ator: { id: string; nome: string },
  acao: string,
  alvo: { id: string; nome: string } | null,
  detalhes?: unknown,
) {
  await db.query(
    `INSERT INTO hub.auditoria (ator_id, ator_nome, acao, alvo_id, alvo_nome, detalhes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ator.id, ator.nome, acao, alvo?.id ?? null, alvo?.nome ?? null, detalhes ? JSON.stringify(detalhes) : null],
  );
}
