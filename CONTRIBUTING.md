# Como contribuir: fluxo de branches

## Resumo em uma imagem

```
main ──┬──> feature/sofia-importador ──PR──> dev    (tutor aprova)            → servidor DEV
       │                            └──PR──> hml    (tutor aprova)            → servidor HML  (coordenação valida)
       │                            └──PR──> main   (tutor aprova após HML)   → PRODUÇÃO
       └──> feature/rafael-pwa ...
```

**A mesma branch sua sobe de degrau em degrau.** `dev` e `hml` são só "vitrines" para testar;
elas **nunca** são mescladas para frente (nunca `dev → hml`, nunca `hml → main`).
Assim, o trabalho de um colega que ainda não foi aprovado não vai junto com o seu.

---

## Passo a passo

### 1. Criar sua branch, sempre a partir da `main`

```bash
git checkout main
git pull
git checkout -b feature/seunome-descricao-curta
```

Prefixos aceitos:

| Prefixo | Quando usar | Exemplo |
|---|---|---|
| `feature/` | funcionalidade nova | `feature/clarisse-mapa-calor` |
| `fix/` | correção de erro | `fix/cristiano-kanban-arrastar` |
| `docs/` | só documentação | `docs/rone-catalogo-fontes` |

### 2. Trabalhar e testar no local

```bash
git add .
git commit -m "Adiciona filtro por território no mapa"
git push -u origin feature/seunome-descricao-curta
```

Faça commits pequenos, com mensagem dizendo **o que** mudou.

### 3. Subir para DEV

No GitHub: **New pull request** → base: `dev` ← compare: `feature/sua-branch`.
Preencha o modelo do PR. O tutor revisa; ao aprovar e mesclar, o servidor DEV atualiza sozinho.

### 4. Subir para HML (quando o tutor pedir)

Novo PR da **mesma branch**: base: `hml` ← compare: `feature/sua-branch`.
Depois do merge, a coordenação acessa o HML e valida.

### 5. Subir para PRODUÇÃO (após validação da coordenação)

Novo PR da **mesma branch**: base: `main` ← compare: `feature/sua-branch`.
O tutor mescla e a produção atualiza.

---

## Regras (o GitHub bloqueia se não seguir)

- Ninguém faz `push` direto em `dev`, `hml` ou `main`: só por Pull Request.
- Todo PR precisa da aprovação do tutor.
- PR para `hml` ou `main` **não pode** vir de `dev` nem de `hml`.
- **Nunca** faça `git merge dev` ou `git merge hml` na sua branch. Isso puxaria código não aprovado de colegas.
  Se precisar atualizar sua branch, use a `main`: `git merge main`.

## E se o PR para `dev` der conflito?

Não clique em "Resolve conflicts" no GitHub (ele mistura o `dev` na sua branch).
Em vez disso, crie uma branch só para esse merge:

```bash
git checkout feature/sua-branch
git checkout -b merge/sua-branch-dev
git merge origin/dev        # resolva os conflitos aqui
git push -u origin merge/sua-branch-dev
```

Abra o PR de `merge/sua-branch-dev` → `dev`. Sua branch `feature/` continua limpa para ir a `hml` e `main`.
(Branches `merge/` só podem ir para `dev`.)

---

## Toda funcionalidade nova nasce atrás de uma chave

Cada contexto do sistema tem uma **chave de funcionalidade** (Administração → Funcionalidades), que o tutor
liga, desliga ou deixa **em teste** (só administradores e desenvolvedores) a qualquer momento, por ambiente.
Se algo der errado em produção, desligar a chave tira a funcionalidade do ar sem novo deploy.

Ao criar uma funcionalidade nova:

1. **Migração**: cadastre a chave, começando em `teste`:
   ```sql
   INSERT INTO hub.funcionalidades (chave, nome, descricao, estado)
   VALUES ('minha_func', 'Nome que o tutor vê', 'O que ela faz', 'teste');
   ```
2. **Backend**: proteja o controller:
   ```ts
   @UseGuards(LogadoGuard, FuncionalidadeGuard)
   @Funcionalidade('minha_func')
   export class MinhaFuncController { ... }
   ```
3. **Frontend**: na rota, `meta: { func: 'minha_func' }`; no menu, `v-if="sessao.func.minha_func"`.

A chave não substitui a permissão por papel: as duas valem ao mesmo tempo.

## Padrão de texto

- Não use travessão (—). Se precisar separar, use hífen (-), dois-pontos ou uma frase nova.
- Texto objetivo e direto. Mensagem de alerta diz o que está acontecendo e o que fazer.
- Não afirme o que o dado não mostra: dado ilustrativo é sempre rotulado como ilustrativo.
- Aviso oficial (INMET, Defesa Civil) tem prioridade sobre qualquer regra nossa.

---

## Boas práticas

- **Dados:** só dados fictícios no local e no dev. Nunca coloque dado real de paciente no Git.
- **Segredos:** nunca faça commit de senha, token ou `.env`. Use o `.env.example` como modelo.
- **IA:** pode usar, desde que você saiba explicar cada linha do código que enviou.
- **Branch parada:** se sua funcionalidade foi para produção, apague a branch no GitHub.
