<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, AMBIENTES, GRUPOS, NOME_AMBIENTE, PAPEIS, PERFIS, Permissao, Pessoa } from '../../api';
import { sessao } from '../../sessao';
import { carregarPainel, painel } from '../../painel';
import AvisoGerenciado from '../../components/AvisoGerenciado.vue';
import { confirmar } from '../../dialogo';
import { carregarCatalogos, itens } from '../../catalogos';

const rota = useRoute();
const router = useRouter();
const id = computed(() => rota.params.id as string | undefined);
const novo = computed(() => !id.value);
const somenteLeitura = computed(() => painel.modo === 'gerenciado');

const form = reactive({
  nome: '', email: '', papel: 'aluno', perfil: 'usuario' as 'desenvolvedor' | 'usuario', grupo: null as number | null,
  admin_sistema: false, ativo: true,
  github_usuario: '', github_permissao: 'nenhum', usuario_servidor: '', chave_ssh: '',
  vinculo: '', instituicao: '', curso: '',
  permissoes: AMBIENTES.map((ambiente) => ({ ambiente, hub: false, banco: 'nenhum', servidor: false })) as Permissao[],
});
const erro = ref('');
const salvo = ref('');
const senhaTemporaria = ref('');
const salvando = ref(false);
const souEu = computed(() => id.value === sessao.eu?.id);
const dev = computed(() => form.perfil === 'desenvolvedor');

function aplicarPadrao() {
  const padrao = painel.padroes[form.perfil];
  if (!padrao) return;
  form.permissoes = AMBIENTES.map((a) => ({ ...(padrao.find((p) => p.ambiente === a) ?? { ambiente: a, hub: false, banco: 'nenhum', servidor: false }) }));
  if (form.perfil === 'desenvolvedor') {
    form.grupo = 2;
    if (form.github_permissao === 'nenhum') form.github_permissao = 'escrita';
  } else {
    form.github_permissao = 'nenhum';
  }
}

// curso só da instituição escolhida
const cursos = computed(() => itens('cursos', form.instituicao || null));
watch(() => form.instituicao, () => { if (form.curso && !cursos.value.some((c) => c.codigo === form.curso)) form.curso = ''; });

// ao trocar o perfil de uma pessoa NOVA, já preenche os acessos padrão
watch(() => form.perfil, () => { if (novo.value) aplicarPadrao(); });

type Nivel = Permissao['banco'];
const ATALHOS: { nome: string; dica: string; p: Record<string, [boolean, Nivel, boolean]> }[] = [
  { nome: 'Iniciante', dica: 'HUB em todos, lê o banco do dev', p: { dev: [true, 'leitura', true], hml: [true, 'nenhum', false], prod: [true, 'nenhum', false] } },
  { nome: 'Padrão', dica: 'HUB em todos, escreve no dev, lê o hml', p: { dev: [true, 'escrita', true], hml: [true, 'leitura', true], prod: [true, 'nenhum', false] } },
  { nome: 'Avançado', dica: 'HUB em todos, escreve no dev e no hml', p: { dev: [true, 'escrita', true], hml: [true, 'escrita', true], prod: [true, 'nenhum', false] } },
];
function aplicarAtalho(a: (typeof ATALHOS)[number]) {
  for (const p of form.permissoes) [p.hub, p.banco, p.servidor] = a.p[p.ambiente];
}

onMounted(async () => {
  try {
    await Promise.all([carregarPainel(), carregarCatalogos()]);
    if (novo.value) return aplicarPadrao();
    const p = await api<Pessoa>(`/admin/usuarios/${id.value}`);
    Object.assign(form, {
      ...p,
      github_usuario: p.github_usuario ?? '', usuario_servidor: p.usuario_servidor ?? '', chave_ssh: p.chave_ssh ?? '',
      vinculo: (p as any).vinculo ?? '', instituicao: (p as any).instituicao ?? '', curso: (p as any).curso ?? '',
      permissoes: AMBIENTES.map((a) => p.permissoes.find((x) => x.ambiente === a) ?? { ambiente: a, hub: false, banco: 'nenhum', servidor: false }),
    });
  } catch (e) {
    erro.value = (e as Error).message;
  }
});

function sugerirUsuarioServidor() {
  if (!dev.value || form.usuario_servidor || !form.nome) return;
  form.usuario_servidor = form.nome.split(' ')[0].normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();
}

async function salvar() {
  erro.value = salvo.value = '';
  salvando.value = true;
  try {
    const corpo = { ...form, grupo: form.grupo ? Number(form.grupo) : null };
    if (novo.value) {
      const r = await api<{ usuario: Pessoa; senha_temporaria: string }>('/admin/usuarios', { corpo });
      senhaTemporaria.value = r.senha_temporaria;
      router.replace(`/admin/pessoas/${r.usuario.id}`);
    } else {
      await api(`/admin/usuarios/${id.value}`, { metodo: 'PUT', corpo });
    }
    salvo.value = 'Alterações salvas. O sincronizador aplica em alguns minutos (ou use "Aplicar agora" em Sincronização).';
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    salvando.value = false;
  }
}

async function redefinirSenha() {
  if (!(await confirmar({
    titulo: 'Gerar nova senha?',
    texto: `A senha atual de ${form.nome} deixa de funcionar. A nova aparece uma única vez para você entregar à pessoa.`,
    confirmar: 'Gerar nova senha',
  }))) return;
  senhaTemporaria.value = (await api<{ senha_temporaria: string }>(`/admin/usuarios/${id.value}/redefinir-senha`, { metodo: 'POST' })).senha_temporaria;
}

async function alternarAtivo() {
  form.ativo = !form.ativo;
  await salvar();
}
</script>

<template>
  <RouterLink to="/admin/pessoas" class="voltar">← Pessoas</RouterLink>
  <h1>{{ novo ? 'Nova pessoa' : form.nome }}</h1>
  <p class="sub">
    <span v-if="!form.ativo" class="selo vermelho">inativo: não consegue entrar</span>
    <template v-else>{{ novo ? 'Cadastre a pessoa e defina o que ela pode acessar em cada ambiente.' : 'Dados e acessos' }}</template>
  </p>

  <AvisoGerenciado />

  <div v-if="senhaTemporaria" class="aviso senha">
    <strong>Senha temporária de {{ form.nome }}:</strong> <code>{{ senhaTemporaria }}</code>
    <div>Entregue à pessoa por um canal privado. Ela aparece <strong>só agora</strong>; peça que troque no primeiro acesso.
      Vale para todos os ambientes em que ela tem HUB.</div>
  </div>

  <form class="grade" @submit.prevent="salvar">
    <fieldset :disabled="somenteLeitura" class="grade">
      <section class="cartao">
        <h2>Tipo de acesso</h2>
        <div class="perfis-escolha">
          <label v-for="(rotulo, valor) in PERFIS" :key="valor" class="perfil" :class="{ marcado: form.perfil === valor }">
            <input v-model="form.perfil" type="radio" :value="valor" />
            <strong>{{ rotulo }}</strong>
            <small v-if="valor === 'desenvolvedor'">Constrói e testa o HUB (dev e hml) e também o usa no prod. Banco, servidor e GitHub conforme liberado.</small>
            <small v-else>Usa o HUB para registrar atividades, metas e ações. Sem acesso técnico.</small>
          </label>
        </div>
      </section>

      <section class="cartao grade duas">
        <h2 class="inteiro">Identificação</h2>
        <label class="campo">Nome completo <input v-model="form.nome" required @blur="sugerirUsuarioServidor" /></label>
        <label class="campo">E-mail (login) <input v-model="form.email" type="email" required /></label>
        <label class="campo">Papel no projeto
          <select v-model="form.papel">
            <option v-for="(rotulo, valor) in PAPEIS" :key="valor" :value="valor">{{ rotulo }}</option>
          </select>
        </label>
        <label class="campo">Grupo PET
          <select v-model="form.grupo">
            <option :value="null">Nenhum (todos os grupos)</option>
            <option v-for="(rotulo, valor) in GRUPOS" :key="valor" :value="Number(valor)">{{ rotulo }}</option>
          </select>
        </label>
        <label class="check inteiro">
          <input v-model="form.admin_sistema" type="checkbox" :disabled="souEu" />
          <span><strong>Administrador do sistema</strong><br /><small>Acessa a administração. Fora da hierarquia de papéis do projeto.</small></span>
        </label>
      </section>

      <section class="cartao grade tres-col">
        <h2 class="inteiro">Vínculo institucional</h2>
        <p class="dica inteiro">Ex.: aluna de Engenharia de Software da UNIFAE; professor de Publicidade e Propaganda da UNIFAE; profissional de saúde da Prefeitura.</p>
        <label class="campo">Vínculo
          <select v-model="form.vinculo">
            <option value="">Não informado</option>
            <option v-for="v in itens('vinculos')" :key="v.codigo" :value="v.codigo">{{ v.nome }}</option>
          </select>
        </label>
        <label class="campo">Instituição
          <select v-model="form.instituicao">
            <option value="">Não informada</option>
            <option v-for="i in itens('instituicoes')" :key="i.codigo" :value="i.codigo">{{ i.sigla ? i.sigla + ' - ' + i.nome : i.nome }}</option>
          </select>
        </label>
        <label class="campo">Curso ou formação
          <select v-model="form.curso">
            <option value="">Não informado</option>
            <option v-for="c in cursos" :key="c.codigo" :value="c.codigo">{{ c.nome }}</option>
          </select>
        </label>
        <p class="dica inteiro">Falta alguma opção? Cadastre em <RouterLink to="/admin/cadastros">Administração, Cadastros</RouterLink>.</p>
      </section>

      <section class="cartao">
        <h2>Acessos por ambiente</h2>
        <div v-if="dev" class="perfis">
          <span>Atalhos:</span>
          <button v-for="a in ATALHOS" :key="a.nome" type="button" class="botao secundario pequeno" :title="a.dica" @click="aplicarAtalho(a)">
            {{ a.nome }}
          </button>
        </div>
        <div class="rolagem">
          <table class="tabela matriz">
            <thead>
              <tr>
                <th>Ambiente</th><th>HUB (entrar no sistema)</th>
                <template v-if="dev"><th>Banco de dados</th><th>Servidor (túnel)</th></template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in form.permissoes" :key="p.ambiente">
                <td><strong>{{ NOME_AMBIENTE[p.ambiente] }}</strong><br /><small>{{ p.ambiente }}</small></td>
                <td><label class="check"><input v-model="p.hub" type="checkbox" /> liberar</label></td>
                <template v-if="dev">
                  <td>
                    <div class="opcoes">
                      <label v-for="n in ['nenhum', 'leitura', 'escrita']" :key="n" :class="{ marcado: p.banco === n, [n]: true }">
                        <input v-model="p.banco" type="radio" :value="n" :name="`banco-${p.ambiente}`" /> {{ n }}
                      </label>
                    </div>
                  </td>
                  <td><label class="check"><input v-model="p.servidor" type="checkbox" /> liberar</label></td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="dev && form.permissoes.some((p) => p.ambiente === 'prod' && (p.banco !== 'nenhum' || p.servidor))" class="aviso">
          Acesso técnico à <strong>produção</strong>: combinado para ser só do administrador do sistema.
        </p>
      </section>

      <section v-if="dev" class="cartao grade duas">
        <h2 class="inteiro">GitHub e servidor</h2>
        <label class="campo">Usuário GitHub <input v-model="form.github_usuario" placeholder="ex.: sofia-lopes" /></label>
        <label class="campo">Permissão no repositório
          <select v-model="form.github_permissao">
            <option value="nenhum">Nenhuma</option>
            <option value="leitura">Leitura (só vê o código)</option>
            <option value="escrita">Escrita (cria branch e abre PR)</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label class="campo">Usuário do servidor / banco <input v-model="form.usuario_servidor" placeholder="ex.: sofia" /></label>
        <div></div>
        <label class="campo inteiro">Chave SSH pública (para o túnel)
          <textarea v-model="form.chave_ssh" rows="3" placeholder="ssh-ed25519 AAAA… nome"></textarea>
        </label>
      </section>
    </fieldset>

    <p v-if="erro" class="erro">{{ erro }}</p>
    <p v-if="salvo" class="selo verde">{{ salvo }}</p>

    <div v-if="!somenteLeitura" class="acoes">
      <button class="botao" :disabled="salvando">{{ novo ? 'Cadastrar' : 'Salvar alterações' }}</button>
      <template v-if="!novo">
        <button type="button" class="botao secundario" @click="redefinirSenha">Gerar nova senha</button>
        <button v-if="!souEu" type="button" class="botao" :class="form.ativo ? 'perigo' : 'secundario'" @click="alternarAtivo">
          {{ form.ativo ? 'Desativar acesso' : 'Reativar acesso' }}
        </button>
      </template>
    </div>
  </form>
</template>

<style scoped>
.voltar { font-size: .85rem; text-decoration: none; }
h1 { margin-top: .5rem; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.inteiro { grid-column: 1 / -1; }
.tres-col { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.dica { font-size: .84rem; color: var(--texto-2); margin: -.4rem 0 0; }
.check { display: flex; gap: .6rem; align-items: flex-start; font-size: .9rem; cursor: pointer; }
.check input { width: auto; margin-top: .2rem; }
.check small { color: var(--texto-2); }
.perfis-escolha { display: grid; gap: .75rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.perfil { display: flex; flex-direction: column; gap: .25rem; border: 1px solid var(--borda); border-radius: 10px; padding: .9rem 1rem; cursor: pointer; }
.perfil input { display: none; }
.perfil small { color: var(--texto-2); }
.perfil.marcado { border-color: var(--teal-700); background: var(--teal-50); box-shadow: 0 0 0 1px var(--teal-700); }
.perfis { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin-bottom: 1rem; font-size: .85rem; color: var(--texto-2); }
.pequeno { padding: .3rem .7rem; font-size: .8rem; font-weight: 500; }
.matriz small { color: var(--texto-2); }
.opcoes { display: inline-flex; border: 1px solid var(--borda); border-radius: 8px; overflow: hidden; }
.opcoes label { padding: .35rem .8rem; font-size: .85rem; cursor: pointer; border-right: 1px solid var(--borda); }
.opcoes label:last-child { border-right: 0; }
.opcoes input { display: none; }
.opcoes .marcado.nenhum { background: #EEF0EC; font-weight: 600; }
.opcoes .marcado.leitura { background: #E3F4EE; color: #13714F; font-weight: 600; }
.opcoes .marcado.escrita { background: #E6F0FB; color: #1F5FA3; font-weight: 600; }
.acoes { display: flex; gap: .6rem; flex-wrap: wrap; }
.senha { margin-bottom: 1rem; }
.senha code { font-size: 1.05rem; background: #fff; padding: .1rem .4rem; border-radius: 4px; user-select: all; }
.senha div { margin-top: .3rem; }
</style>
