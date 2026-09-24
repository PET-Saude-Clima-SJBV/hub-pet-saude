<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, AMBIENTES, NOME_AMBIENTE, PAPEIS, Permissao, Pessoa } from '../../api';
import { sessao } from '../../sessao';

const rota = useRoute();
const router = useRouter();
const id = computed(() => rota.params.id as string | undefined);
const novo = computed(() => !id.value);

const form = reactive({
  nome: '', email: '', papel: 'aluno', admin_sistema: false, ativo: true,
  github_usuario: '', github_permissao: 'nenhum', usuario_servidor: '', chave_ssh: '',
  permissoes: AMBIENTES.map((ambiente) => ({ ambiente, banco: 'nenhum', servidor: false })) as Permissao[],
});
const erro = ref('');
const salvo = ref('');
const senhaTemporaria = ref('');
const salvando = ref(false);
const souEu = computed(() => id.value === sessao.eu?.id);

type Nivel = Permissao['banco'];
const PERFIS: { nome: string; dica: string; p: Record<string, [Nivel, boolean]>; github: string }[] = [
  { nome: 'Aluno iniciante', dica: 'lê o dev', github: 'escrita', p: { dev: ['leitura', true], hml: ['nenhum', false], prod: ['nenhum', false] } },
  { nome: 'Aluno', dica: 'escreve no dev, lê o hml', github: 'escrita', p: { dev: ['escrita', true], hml: ['leitura', true], prod: ['nenhum', false] } },
  { nome: 'Aluno avançado', dica: 'escreve no dev e no hml', github: 'escrita', p: { dev: ['escrita', true], hml: ['escrita', true], prod: ['nenhum', false] } },
  { nome: 'Coordenação', dica: 'só usa o HUB', github: 'nenhum', p: { dev: ['nenhum', false], hml: ['nenhum', false], prod: ['nenhum', false] } },
];
function aplicarPerfil(perfil: (typeof PERFIS)[number]) {
  form.github_permissao = perfil.github;
  for (const p of form.permissoes) [p.banco, p.servidor] = perfil.p[p.ambiente];
}

onMounted(async () => {
  if (novo.value) return;
  try {
    const p = await api<Pessoa>(`/admin/usuarios/${id.value}`);
    Object.assign(form, {
      ...p,
      github_usuario: p.github_usuario ?? '', usuario_servidor: p.usuario_servidor ?? '', chave_ssh: p.chave_ssh ?? '',
      permissoes: AMBIENTES.map((a) => p.permissoes.find((x) => x.ambiente === a) ?? { ambiente: a, banco: 'nenhum', servidor: false }),
    });
  } catch (e) {
    erro.value = (e as Error).message;
  }
});

function sugerirUsuarioServidor() {
  if (form.usuario_servidor || !form.nome) return;
  form.usuario_servidor = form.nome.split(' ')[0].normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase();
}

async function salvar() {
  erro.value = salvo.value = '';
  salvando.value = true;
  try {
    if (novo.value) {
      const r = await api<{ usuario: Pessoa; senha_temporaria: string }>('/admin/usuarios', { corpo: form });
      senhaTemporaria.value = r.senha_temporaria;
      router.replace(`/admin/pessoas/${r.usuario.id}`);
    } else {
      await api(`/admin/usuarios/${id.value}`, { metodo: 'PUT', corpo: form });
    }
    salvo.value = 'Alterações salvas.';
  } catch (e) {
    erro.value = (e as Error).message;
  } finally {
    salvando.value = false;
  }
}

async function redefinirSenha() {
  if (!confirm(`Gerar uma nova senha temporária para ${form.nome}? A senha atual deixa de funcionar.`)) return;
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
    <template v-else>{{ novo ? 'Cadastre a pessoa e defina o que ela pode acessar.' : 'Dados e acessos' }}</template>
  </p>

  <div v-if="senhaTemporaria" class="aviso senha">
    <strong>Senha temporária de {{ form.nome }}:</strong> <code>{{ senhaTemporaria }}</code>
    <div>Entregue à pessoa por um canal privado. Ela aparece <strong>só agora</strong>; peça que troque no primeiro acesso.</div>
  </div>

  <form class="grade" @submit.prevent="salvar">
    <section class="cartao grade duas">
      <h2 class="inteiro">Identificação</h2>
      <label class="campo">Nome completo <input v-model="form.nome" required @blur="sugerirUsuarioServidor" /></label>
      <label class="campo">E-mail (login) <input v-model="form.email" type="email" required /></label>
      <label class="campo">Papel no projeto
        <select v-model="form.papel">
          <option v-for="(rotulo, valor) in PAPEIS" :key="valor" :value="valor">{{ rotulo }}</option>
        </select>
      </label>
      <label class="check">
        <input v-model="form.admin_sistema" type="checkbox" :disabled="souEu" />
        <span><strong>Administrador do sistema</strong><br /><small>Acessa esta área de administração. Fora da hierarquia de papéis.</small></span>
      </label>
    </section>

    <section class="cartao">
      <h2>Acessos por ambiente</h2>
      <div class="perfis">
        <span>Atalhos:</span>
        <button v-for="p in PERFIS" :key="p.nome" type="button" class="botao secundario pequeno" :title="p.dica" @click="aplicarPerfil(p)">
          {{ p.nome }}
        </button>
      </div>
      <div class="rolagem">
        <table class="tabela matriz">
          <thead><tr><th>Ambiente</th><th>Banco de dados</th><th>Servidor (túnel)</th></tr></thead>
          <tbody>
            <tr v-for="p in form.permissoes" :key="p.ambiente">
              <td><strong>{{ NOME_AMBIENTE[p.ambiente] }}</strong><br /><small>hub_{{ p.ambiente }}</small></td>
              <td>
                <div class="opcoes">
                  <label v-for="n in ['nenhum', 'leitura', 'escrita']" :key="n" :class="{ marcado: p.banco === n, [n]: true }">
                    <input v-model="p.banco" type="radio" :value="n" :name="`banco-${p.ambiente}`" /> {{ n }}
                  </label>
                </div>
              </td>
              <td><label class="check"><input v-model="p.servidor" type="checkbox" /> liberar</label></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="form.permissoes.find((p) => p.ambiente === 'prod' && p.banco === 'escrita')" class="aviso">
        Escrita no banco de <strong>produção</strong>: use só para quem administra o sistema.
      </p>
    </section>

    <section class="cartao grade duas">
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

    <p v-if="erro" class="erro">{{ erro }}</p>
    <p v-if="salvo" class="selo verde">{{ salvo }}</p>

    <div class="acoes">
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
.inteiro { grid-column: 1 / -1; }
.check { display: flex; gap: .6rem; align-items: flex-start; font-size: .9rem; cursor: pointer; }
.check input { width: auto; margin-top: .2rem; }
.check small { color: var(--texto-2); }
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
