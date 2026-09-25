/**
 * Plano de sincronização: o que cada pessoa DEVE ter (a partir do cadastro) cruzado com
 * o que o sincronizador do servidor JÁ aplicou (tabela hub.sincronizacao_status).
 * A mesma regra de "o que deve existir" está em sincronizador/estado-desejado.js.
 */

export const TIMES_GITHUB: Record<string, string> = {
  leitura: 'hub-leitura',
  escrita: 'hub-desenvolvimento',
  admin: 'hub-administradores',
};
export const PORTA_BANCO: Record<string, number> = { dev: 5433, hml: 5434, prod: 5432 };

export type Situacao = 'aplicado' | 'pendente' | 'erro' | 'alerta';
export interface ItemPlano {
  sistema: 'HUB' | 'Banco' | 'Servidor' | 'GitHub';
  ambiente: string;       // '-' quando não se aplica
  acao: string;
  situacao: Situacao;
  mensagem?: string | null;
}

export function planoDeSincronizacao(usuarios: any[], status: any[] = []) {
  return usuarios.map((u) => {
    const meus = status.filter((s) => s.usuario_id === u.id);
    const itens: ItemPlano[] = [];
    const desejados = new Set<string>();

    const add = (sistema: ItemPlano['sistema'], ambiente: string, acao: string, alerta?: string) => {
      if (alerta) return itens.push({ sistema, ambiente, acao: alerta, situacao: 'alerta' });
      desejados.add(`${sistema}|${ambiente}`);
      const s = meus.find((x) => x.sistema === sistema && x.ambiente === ambiente);
      let situacao: Situacao = 'pendente';
      if (s && new Date(s.atualizado_em) >= new Date(u.atualizado_em)) situacao = s.estado === 'erro' ? 'erro' : 'aplicado';
      itens.push({ sistema, ambiente, acao, situacao, mensagem: s?.mensagem });
    };

    if (u.ativo) {
      const perms = u.permissoes ?? [];
      for (const p of perms) {
        if (p.hub) add('HUB', p.ambiente, `Conta no HUB de ${p.ambiente}`);
        if (p.banco !== 'nenhum') {
          const texto = `Usuário "${u.usuario_servidor}" com ${p.banco === 'escrita' ? 'leitura e escrita' : 'somente leitura'} em hub_${p.ambiente}`;
          add('Banco', p.ambiente, texto, u.usuario_servidor ? undefined : 'Falta o usuário do servidor');
          if (!p.servidor) itens.push({
            sistema: 'Servidor', ambiente: p.ambiente, situacao: 'alerta',
            acao: 'Tem banco mas não tem servidor: de fora da rede não conseguirá conectar',
          });
        }
      }
      const tunel = perms.filter((p: any) => p.servidor).map((p: any) => p.ambiente);
      if (tunel.length) {
        const falta = !u.usuario_servidor ? 'Falta o usuário do servidor'
          : !u.chave_ssh ? 'Falta a chave SSH pública' : undefined;
        add('Servidor', '-', `Túnel SSH de "${u.usuario_servidor}" até ${tunel.map((a: string) => `${a} (${PORTA_BANCO[a]})`).join(', ')}`, falta);
      }
      if (u.github_permissao !== 'nenhum') {
        add('GitHub', '-', `@${u.github_usuario} no time "${TIMES_GITHUB[u.github_permissao]}"`,
          u.github_usuario ? undefined : 'Falta o usuário GitHub');
      }
    }

    // o que foi aplicado antes e não é mais desejado: o sincronizador vai remover
    for (const s of meus) {
      if (desejados.has(`${s.sistema}|${s.ambiente}`) || s.estado !== 'aplicado') continue;
      itens.push({
        sistema: s.sistema, ambiente: s.ambiente, situacao: 'pendente',
        acao: `Remover acesso (${s.sistema}${s.ambiente !== '-' ? ' ' + s.ambiente : ''})`,
      });
    }

    return { usuario: { id: u.id, nome: u.nome, papel: u.papel, perfil: u.perfil, grupo: u.grupo, ativo: u.ativo }, itens };
  });
}
