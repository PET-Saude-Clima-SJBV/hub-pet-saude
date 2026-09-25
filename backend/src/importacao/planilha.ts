import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

/**
 * Leitura e geração de planilhas para importação (CSV, TXT e XLSX).
 * Reaproveitável por qualquer cadastro: quem usa define as colunas; aqui só se lê e escreve.
 */

export type Formato = 'csv' | 'txt' | 'xlsx';
export interface Coluna {
  nome: string; obrigatoria?: boolean; descricao: string;
  apelidos?: string[];   // outros nomes aceitos no cabeçalho (ex.: o da planilha da coordenação)
}
export interface Tabela { cabecalho: string[]; ignoradas: string[]; linhas: { numero: number; valores: Record<string, string> }[] }

export const MAX_LINHAS = 2000;
export const MAX_BYTES = 2 * 1024 * 1024;

/** Nome de coluna comparável: "Código" == "codigo" == " CODIGO ". */
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

function formatoDoArquivo(nome: string): Formato {
  const ext = nome.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt' || ext === 'xlsx') return ext;
  throw new BadRequestException('Formato não aceito. Use CSV, TXT ou XLSX (baixe o modelo).');
}

/** Separa uma linha de texto respeitando aspas ("a;b" fica inteiro). */
function separar(linha: string, sep: string) {
  const campos: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas;
    } else if (c === sep && !aspas) {
      campos.push(atual); atual = '';
    } else atual += c;
  }
  campos.push(atual);
  return campos.map((x) => x.trim());
}

function lerTexto(buffer: Buffer): string[][] {
  let texto = buffer.toString('utf8');
  if (texto.includes('�')) texto = buffer.toString('latin1'); // arquivo salvo pelo Excel em ANSI
  texto = texto.replace(/^﻿/, '');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!linhas.length) return [];
  // separador mais frequente na 1ª linha: ; , tab ou |
  const sep = [';', ',', '\t', '|'].map((s) => [s, linhas[0].split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  return linhas.map((l) => separar(l, sep));
}

/** Todas as abas do arquivo, cada uma como lista de linhas. */
async function lerXlsx(buffer: Buffer): Promise<string[][][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as any);
  } catch {
    throw new BadRequestException('Não foi possível abrir o arquivo XLSX');
  }
  return wb.worksheets.map((aba) => {
  const linhas: string[][] = [];
  aba.eachRow({ includeEmpty: false }, (row) => {
    const valores = (row.values as unknown[]).slice(1).map((v: any) => {
      if (v == null) return '';
      if (typeof v === 'object' && 'text' in v) return String(v.text);          // hyperlink
      if (typeof v === 'object' && 'richText' in v) return v.richText.map((t: any) => t.text).join('');
      if (typeof v === 'object' && 'result' in v) return String(v.result ?? ''); // fórmula
      return String(v);
    });
    linhas.push(valores.map((x) => x.trim()));
  });
  return linhas;
  });
}

/** Lê o arquivo enviado e devolve cabeçalho normalizado + linhas (com o número da linha no arquivo). */
export async function lerTabela(buffer: Buffer, nomeArquivo: string, colunas: Coluna[]): Promise<Tabela> {
  if (buffer.length > MAX_BYTES) throw new BadRequestException('Arquivo maior que 2 MB');
  const formato = formatoDoArquivo(nomeArquivo);
  // nome aceito no cabeçalho -> coluna
  const mapa = new Map<string, string>();
  for (const c of colunas) for (const n of [c.nome, ...(c.apelidos ?? [])]) mapa.set(normalizar(n), c.nome);
  const obrigatorias = colunas.filter((c) => c.obrigatoria).map((c) => c.nome);
  /** Nota de uma linha como cabeçalho: -1 se faltar coluna obrigatória; senão, quantas colunas reconhece. */
  const nota = (l: string[]) => {
    const achadas = new Set(l.map((v) => mapa.get(normalizar(v))).filter(Boolean));
    return obrigatorias.every((o) => achadas.has(o)) ? achadas.size : -1;
  };
  /** Melhor linha de cabeçalho nas 6 primeiras (pode haver linhas de título antes). */
  const melhorLinha = (linhas: string[][]) => linhas.slice(0, 6).reduce(
    (m, l, i) => (nota(l) > m.nota ? { i, nota: nota(l) } : m), { i: 0, nota: -1 });

  // XLSX com várias abas (como a planilha da coordenação): usa a aba com o melhor cabeçalho
  let bruto: string[][];
  if (formato === 'xlsx') {
    const abas = await lerXlsx(buffer);
    bruto = abas.map((a) => ({ a, nota: melhorLinha(a).nota })).sort((x, y) => y.nota - x.nota)[0]?.a ?? [];
  } else bruto = lerTexto(buffer);
  if (bruto.length < 2) throw new BadRequestException('O arquivo precisa ter o cabeçalho e ao menos uma linha');
  if (bruto.length - 1 > MAX_LINHAS) throw new BadRequestException(`Máximo de ${MAX_LINHAS} linhas por arquivo`);

  const linhaCab = melhorLinha(bruto).i;
  const cabecalho = bruto[linhaCab].map((v) => mapa.get(normalizar(v)) ?? normalizar(v));
  bruto.splice(0, linhaCab);
  const conhecidas = new Set(colunas.map((c) => c.nome));
  const faltando = colunas.filter((c) => c.obrigatoria && !cabecalho.includes(c.nome)).map((c) => c.nome);
  if (faltando.length) throw new BadRequestException(`Coluna obrigatória ausente: ${faltando.join(', ')}. Use o modelo.`);
  // colunas fora do modelo (ex.: "Status" da planilha da coordenação) são ignoradas e avisadas no relatório
  const ignoradas = [...new Set(bruto[0].filter((v, i) => v && cabecalho[i] && !conhecidas.has(cabecalho[i])))];

  const linhas = bruto.slice(1).map((valores, i) => ({
    numero: i + 2,
    valores: Object.fromEntries(cabecalho.map((c, j) => [c, valores[j] ?? ''])),
  })).filter((l) => Object.values(l.valores).some((v) => v !== ''));
  return { cabecalho, ignoradas, linhas };
}

/** Arquivo modelo com o cabeçalho e linhas de exemplo. */
export async function gerarModelo(colunas: Coluna[], exemplos: string[][], formato: Formato, titulo: string) {
  if (formato === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const aba = wb.addWorksheet('Dados');
    aba.addRow(colunas.map((c) => c.nome));
    for (const e of exemplos) aba.addRow(e);
    aba.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    aba.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F6B64' } };
    aba.columns.forEach((c, i) => { c.width = Math.max(14, colunas[i].nome.length + 4, ...exemplos.map((e) => (e[i] ?? '').length + 2)); });
    const ajuda = wb.addWorksheet('Como preencher');
    ajuda.addRow([titulo]).font = { bold: true, size: 13 };
    ajuda.addRow([]);
    ajuda.addRow(['Coluna', 'Obrigatória', 'O que colocar']).font = { bold: true };
    for (const c of colunas) ajuda.addRow([c.nome, c.obrigatoria ? 'sim' : 'não', c.descricao]);
    ajuda.addRow([]);
    ajuda.addRow(['Preencha a aba "Dados" a partir da linha 2. Não mude os nomes das colunas.']);
    ajuda.columns = [{ width: 18 }, { width: 13 }, { width: 80 }];
    return { conteudo: Buffer.from(await wb.xlsx.writeBuffer()), tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
  const sep = formato === 'csv' ? ';' : '\t';
  const esc = (v: string) => (/[;\t"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const texto = [colunas.map((c) => c.nome), ...exemplos].map((l) => l.map(esc).join(sep)).join('\r\n');
  // BOM: o Excel abre o CSV com os acentos corretos
  return { conteudo: Buffer.from('﻿' + texto + '\r\n', 'utf8'), tipo: formato === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8' };
}
