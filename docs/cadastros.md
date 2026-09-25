# Mapa dos cadastros do HUB

Tudo o que a coordenação pode precisar manter sem mexer no banco. Regra do projeto: **todo campo agrupável é um
cadastro administrável** (Administração > Cadastros) e **importável por arquivo com modelo** (XLSX, CSV ou TXT).

Cada item tem um **código fixo** (gravado nos registros) e um **nome editável**. Item em uso não é apagado: é inativado
e some dos formulários, sem afetar os registros antigos.

## Cadastros administráveis

| Cadastro | Onde é usado | Origem dos itens iniciais |
|---|---|---|
| Grupos PET | pessoas, metas, permissões por grupo | aba "Listas" (PET I a PET V) |
| Territórios | atividades, ações; mapas e relatórios | aba "Listas": 8 PSF, 5 UBS, 1 USF (códigos PSF I..VIII, UBS I..V, USF I) |
| Tipos de atividade | registro de atividade | modelo do HUB (7 tipos) |
| Modalidades | registro de atividade | Presencial, Remoto, Híbrido |
| Vínculos | pessoas | Aluno, Professor, Profissional de saúde, ACS, Gestor, Técnico, Externo |
| Instituições | pessoas | UNIFAE, IFSP, UNESP, Prefeitura (SMS), Outra |
| Cursos e formações | pessoas (ligado à instituição) | 12 cursos citados nas 45 metas oficiais |
| Problemas climáticos | mapeamento, mapa público | aba "Listas" |
| Doenças e agravos | mapeamento, mapa público | aba "Listas" + aba "Mapeamento" |
| Periodicidades | ficha do indicador, mapeamento | aba "Listas" + semanal, semestral, anual |
| Desagregações | ficha do indicador | aba "Listas" |
| Tipos de indicador | ficha do indicador | Processo, Resultado, Impacto |
| Formatos do dado | mapeamento | aba "Listas" |
| Situação do levantamento | mapeamento | aba "Listas" |
| Situação do formulário | mapeamento | aba "Listas" |

## Outras telas de manutenção

| O quê | Onde | Importação |
|---|---|---|
| Pessoas e acessos | Administração > Pessoas | a fazer |
| Permissões por papel | Administração > Permissões | - |
| Funcionalidades (ligar/desligar) | Administração > Funcionalidades | - |
| Metas (situação, prazos, responsáveis; texto, eixo e grupo pela coordenação geral) | Projeto > Metas | - |
| Fichas de indicador | Projeto > Indicadores e dentro de cada meta | **sim**: modelo ou a própria aba "Indicadores" da planilha |
| Ações | dentro de cada meta | a fazer |
| Camadas do mapa público | (a fazer tela) | a fazer |

## O que NÃO é cadastro, de propósito

São regras do sistema: o comportamento depende delas, e editá-las quebraria o fluxo.

| Lista | Por quê |
|---|---|
| Situação (não iniciado, em andamento, em atraso, concluído) | cálculos de atraso e painéis dependem dos 4 valores |
| Validação (pendente, validada, devolvida) | travar, devolver e reabrir dependem deles |
| Papéis (aluno, preceptor, tutor, coordenador, coordenação geral) | a hierarquia de visão e a matriz de permissões usam os papéis |
| Eixos (I, II, III) | vêm do edital |
| Sim/Não (dado pessoal, precisa de P&P) | não há o que manter |

## Pendências

- Tela de manutenção das **camadas do mapa público** (hoje criadas por migração).
- Módulo de **Mapeamento** (a aba "Mapeamento" da planilha dentro do HUB), que vai usar problemas, doenças,
  formatos, levantamento e situação do formulário.
- **Importação de pessoas** e de **ações**, reaproveitando o importador genérico.
