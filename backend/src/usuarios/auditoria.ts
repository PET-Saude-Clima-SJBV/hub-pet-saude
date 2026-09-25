import { DbService } from '../db/db.service';

export async function registrarAuditoria(
  db: DbService,
  ator: { id: string; nome: string; por?: { id: string; nome: string } },
  acao: string,
  alvo: { id: string; nome: string } | null,
  detalhes?: unknown,
) {
  // no "ver como", fica claro quem de fato estava operando
  const nome = ator.por ? `${ator.nome} (visto por ${ator.por.nome})` : ator.nome;
  await db.query(
    `INSERT INTO hub.auditoria (ator_id, ator_nome, acao, alvo_id, alvo_nome, detalhes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ator.id, nome, acao, alvo?.id ?? null, alvo?.nome ?? null, detalhes ? JSON.stringify(detalhes) : null],
  );
}
