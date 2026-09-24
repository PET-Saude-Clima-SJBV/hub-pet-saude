/**
 * Plano de sincronização: traduz as permissões cadastradas no painel no que precisa
 * existir no GitHub, no servidor e nos bancos. Nesta versão o plano é só CALCULADO
 * e exibido; a aplicação automática vem num próximo incremento.
 */

export const TIMES_GITHUB: Record<string, string> = {
  leitura: 'hub-leitura',
  escrita: 'hub-desenvolvimento',
  admin: 'hub-administradores',
};
const PORTA_BANCO: Record<string, number> = { dev: 5433, hml: 5434, prod: 5432 };

export interface ItemPlano {
  sistema: 'GitHub' | 'Servidor' | 'Banco';
  ambiente?: string;
  acao: string;
  situacao: 'pendente' | 'alerta';
}

export function planoDeSincronizacao(usuarios: any[]) {
  return usuarios
    .filter((u) => u.papel !== 'externo' || u.github_permissao !== 'nenhum')
    .map((u) => {
      const itens: ItemPlano[] = [];
      const add = (i: ItemPlano) => itens.push(i);

      if (!u.ativo) {
        if (u.github_usuario) add({ sistema: 'GitHub', acao: `Remover @${u.github_usuario} da organização`, situacao: 'pendente' });
        if (u.usuario_servidor) add({ sistema: 'Servidor', acao: `Revogar túnel e usuários de banco de "${u.usuario_servidor}"`, situacao: 'pendente' });
        return { usuario: resumido(u), itens };
      }

      // GitHub
      if (u.github_permissao !== 'nenhum') {
        if (!u.github_usuario) add({ sistema: 'GitHub', acao: 'Falta o usuário GitHub', situacao: 'alerta' });
        else add({
          sistema: 'GitHub',
          acao: `Convidar @${u.github_usuario} e colocar no time "${TIMES_GITHUB[u.github_permissao]}" (${u.github_permissao})`,
          situacao: 'pendente',
        });
      }

      // Servidor e banco, por ambiente
      for (const p of u.permissoes ?? []) {
        const precisaConta = p.servidor || p.banco !== 'nenhum';
        if (!precisaConta) continue;
        if (!u.usuario_servidor) {
          add({ sistema: 'Servidor', ambiente: p.ambiente, acao: 'Falta o usuário do servidor', situacao: 'alerta' });
          continue;
        }
        if (p.servidor) {
          if (!u.chave_ssh) add({ sistema: 'Servidor', ambiente: p.ambiente, acao: 'Falta a chave SSH pública', situacao: 'alerta' });
          else add({
            sistema: 'Servidor', ambiente: p.ambiente,
            acao: `Liberar túnel de "${u.usuario_servidor}" até a porta ${PORTA_BANCO[p.ambiente]}`,
            situacao: 'pendente',
          });
        }
        if (p.banco !== 'nenhum') add({
          sistema: 'Banco', ambiente: p.ambiente,
          acao: `Usuário "${u.usuario_servidor}" com ${p.banco === 'escrita' ? 'leitura e escrita' : 'somente leitura'} em hub_${p.ambiente}`,
          situacao: 'pendente',
        });
        if (p.banco !== 'nenhum' && !p.servidor) add({
          sistema: 'Servidor', ambiente: p.ambiente,
          acao: 'Tem banco mas não tem acesso ao servidor: de fora da rede não conseguirá conectar',
          situacao: 'alerta',
        });
      }
      return { usuario: resumido(u), itens };
    });
}

function resumido(u: any) {
  return { id: u.id, nome: u.nome, papel: u.papel, ativo: u.ativo };
}
