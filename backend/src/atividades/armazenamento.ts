import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { diskStorage } from 'multer';

/** Onde ficam os arquivos de evidência (volume Docker próprio de cada ambiente). */
export const PASTA_EVIDENCIAS = process.env.EVIDENCIAS_DIR ?? join(process.cwd(), 'evidencias');
mkdirSync(PASTA_EVIDENCIAS, { recursive: true });

export const TIPOS_PERMITIDOS: Record<string, string> = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf',
};
export const MAX_ARQUIVOS = 5;
export const MAX_BYTES = 10 * 1024 * 1024;

export const opcoesUpload = {
  storage: diskStorage({
    destination: PASTA_EVIDENCIAS,
    // nome aleatório: o nome original nunca vira caminho no disco
    filename: (_req: any, f: Express.Multer.File, cb: (e: Error | null, nome: string) => void) =>
      cb(null, randomUUID() + (TIPOS_PERMITIDOS[f.mimetype] ?? extname(f.originalname).toLowerCase())),
  }),
  limits: { fileSize: MAX_BYTES, files: MAX_ARQUIVOS },
  defParamCharset: 'utf8', // sem isto o nome do arquivo com acento chega em latin1 ("reuniÃ£o.pdf")
  fileFilter: (_req: any, f: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) =>
    TIPOS_PERMITIDOS[f.mimetype]
      ? cb(null, true)
      : cb(new BadRequestException(`Tipo de arquivo não aceito: ${f.originalname} (use foto JPG/PNG/WebP ou PDF)`), false),
};

export function sha256(arquivo: string) {
  return createHash('sha256').update(readFileSync(join(PASTA_EVIDENCIAS, arquivo))).digest('hex');
}

export function apagarArquivos(nomes: (string | null | undefined)[]) {
  for (const n of nomes) {
    if (!n) continue;
    try { unlinkSync(join(PASTA_EVIDENCIAS, n)); } catch { /* já não existe */ }
  }
}

export interface LinkIn { nome?: string; url?: string }

export function lerLinks(bruto: unknown): { nome: string; url: string }[] {
  if (!bruto) return [];
  let lista: LinkIn[];
  try {
    lista = typeof bruto === 'string' ? JSON.parse(bruto) : (bruto as LinkIn[]);
  } catch {
    throw new BadRequestException('Links de evidência em formato inválido');
  }
  if (!Array.isArray(lista)) throw new BadRequestException('Links de evidência em formato inválido');
  return lista.filter((l) => l?.url).map((l) => {
    const url = String(l.url).trim();
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 1000) throw new BadRequestException(`Link inválido: ${url}`);
    return { nome: String(l.nome || url).trim().slice(0, 200), url };
  });
}
