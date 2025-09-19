// lib/uploader.js
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { getBrazilDate } from '../helpers/getBrazilDate.js';

// ESM helpers para ter __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Cria e retorna middleware multer para upload de um único arquivo,
 * processando a imagem para garantir que fique <= maxBytes.
 *
 * @param {string} dir - diretório relativo à raiz do projeto (ex: 'uploads/perfil')
 * @param {string} fieldName - nome do campo do form que contém o arquivo (ex: 'avatar')
 * @param {object} opts - opções (opcional)
 *   - maxBytes: número máximo de bytes desejado para o arquivo final (default: 1 * 1024 * 1024)
 *   - incomingLimit: limite máximo aceitável para upload bruto em bytes (default: 10 * 1024 * 1024)
 *   - maxWidth: largura máxima (px) para redimensionamento (default: 2000)
 */
export const upload = (dir, fieldName, opts = {}) => {
  if (!dir || !fieldName) throw new Error('upload(dir, fieldName) precisa de dois parâmetros.');

  const targetMaxBytes = typeof opts.maxBytes === 'number' ? opts.maxBytes : (1 * 1024 * 1024); // 1 MB
  const incomingLimit = typeof opts.incomingLimit === 'number' ? opts.incomingLimit : (10 * 1024 * 1024); // allow bigger input to compress
  const maxWidth = typeof opts.maxWidth === 'number' ? opts.maxWidth : 2000;

  // caminho absoluto do diretório de upload
  const uploadDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);

  // garante que a pasta exista
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  // usar memoryStorage para processar (compressão) antes de persistir
  const storage = multer.memoryStorage();

  const fileFilter = (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|bmp)$/.test(file.mimetype)) cb(null, true);
    else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Apenas arquivos de imagem são permitidos.'), false);
  };

  // permitir upload bruto maior (vamos comprimir depois)
  const limits = { fileSize: incomingLimit };

  const uploader = multer({ storage, fileFilter, limits });

  // middleware final que primeiro guarda em memória (multer), depois processa com sharp e escreve no disco
  return (req, res, next) => {
    const mw = uploader.single(fieldName);
    mw(req, res, async (err) => {
      if (err) {
        // multer error (limit, etc)
        return next(err);
      }

      // se não houver arquivo (campo vazio), apenas seguir
      if (!req.file || !req.file.buffer) return next();

      try {
        const originalBuffer = req.file.buffer;
        let image = sharp(originalBuffer, { failOnError: true });
        const metadata = await image.metadata().catch(() => ({}));

        // tentar redimensionar se muito grande em dimensão
        if (metadata.width && metadata.width > maxWidth) {
          image = image.resize({ width: maxWidth, withoutEnlargement: true });
        }

        // tentativa de compressão: preferir webp (melhor taxa), cair para jpeg se necessário.
        const tryFormats = ['webp', 'jpeg'];
        let finalBuffer = null;
        let finalFormat = null;

        for (const fmt of tryFormats) {
          // tentativas de quality decrescente
          for (let q of [80, 70, 60, 50, 40, 30]) {
            const pipeline = image.clone();
            if (fmt === 'webp') pipeline.webp({ quality: q });
            else if (fmt === 'jpeg') pipeline.jpeg({ quality: q, mozjpeg: true });

            // gerar buffer
            const buff = await pipeline.toBuffer();
            if (buff.length <= targetMaxBytes) {
              finalBuffer = buff;
              finalFormat = fmt;
              break;
            }
            // se ainda não atingiu, continue reduzindo qualidade
          }
          if (finalBuffer) break;
        }

        // se não conseguimos comprimir abaixo do target, fazer uma última tentativa forcando dimensões menores
        if (!finalBuffer) {
          const reduced = await image.clone().resize({ width: Math.min(1024, maxWidth), withoutEnlargement: true }).webp({ quality: 30 }).toBuffer().catch(() => null);
          if (reduced && reduced.length <= targetMaxBytes) {
            finalBuffer = reduced;
            finalFormat = 'webp';
          }
        }

        if (!finalBuffer) {
          const errMsg = `Não foi possível reduzir a imagem para ${Math.round(targetMaxBytes / 1024)} KB. Escolha uma imagem menor.`;
          const e = new Error(errMsg);
          e.status = 400;
          throw e;
        }

        // gerar nome de arquivo seguro
        const originalName = String(req.file.originalname || 'file');
        const ext = finalFormat === 'webp' ? '.webp' : (finalFormat === 'jpeg' ? '.jpg' : path.extname(originalName) || '.jpg');
        const baseName = path.basename(originalName, path.extname(originalName)).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40);
        const unique = `${getBrazilDate()}-${Math.random().toString(36).slice(2, 8)}-${uuidv4().slice(0, 6)}`;
        const filename = `${unique}__${baseName}${ext}`;
        const filepath = path.join(uploadDir, filename);

        // escreve arquivo otimizado no disco
        await fs.promises.writeFile(filepath, finalBuffer);

        // preencher req.file com os dados do arquivo gravado
        req.file.filename = filename;
        req.file.path = filepath;
        req.file.size = finalBuffer.length;
        req.file.mimetype = finalFormat === 'webp' ? 'image/webp' : (finalFormat === 'jpeg' ? 'image/jpeg' : req.file.mimetype);

        return next();
      } catch (e) {
        // garantir que erros de processamento sejam tratados
        return next(e);
      }
    });
  };
};


// suposição: getBrazilDate() existe no seu código
// import { getBrazilDate } from './utils'

export const uploadMidiaAnuncio = (dir = 'uploads/midias-anuncio', fieldName = 'midia') => {
  if (!dir || !fieldName) throw new Error('upload(dir, fieldName) precisa de dois parâmetros.');

  const targetMaxBytes = 1 * 1024 * 1024; // 1 MB para imagens (validação extra se quiser)
  const incomingLimit = 50 * 1024 * 1024; // 50 MB para permitir vídeos
  const maxWidth = 2000;

  const uploadDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.memoryStorage();

  const fileFilter = (req, file, cb) => {
    if (/^(image\/(jpeg|png|webp|gif|bmp)|video\/(mp4|webm))$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Apenas arquivos de imagem ou vídeo são permitidos.'), false);
    }
  };

  const uploader = multer({ storage, fileFilter, limits: { fileSize: incomingLimit } });

  return (req, res, next) => {
    const mw = uploader.single(fieldName);
    mw(req, res, async (err) => {
      if (err) return next(err);
      if (!req.file || !req.file.buffer) return next();

      try {
        const isVideo = req.file.mimetype.startsWith('video/');
        const originalNameRaw = String(req.file.originalname || 'file');
        const originalExt = path.extname(originalNameRaw) || (isVideo ? '.mp4' : '.webp');
        const baseNameRaw = path.basename(originalNameRaw, originalExt);
        const baseName = baseNameRaw.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40) || 'arquivo';
        const unique = `${getBrazilDate?.() || new Date().toISOString().slice(0,10)}-${Math.random().toString(36).slice(2,8)}-${uuidv4().slice(0,6)}`;

        if (isVideo) {
          // vídeo: salva diretamente
          const ext = originalExt || '.mp4';
          const filename = `${unique}__${baseName}${ext}`;
          const filepath = path.join(uploadDir, filename);

          await fs.promises.writeFile(filepath, req.file.buffer);
          req.file.filename = filename;
          req.file.path = filepath;
          return next();
        } else {
          // imagem: processa, converte para webp (ou jpeg se preferir) e salva
          let image = sharp(req.file.buffer, { failOnError: true });
          const metadata = await image.metadata();

          // resize se necessário
          if (metadata.width && metadata.width > maxWidth) {
            image = image.resize({ width: maxWidth, withoutEnlargement: true });
          }

          // Prefira webp (bom tamanho). Se quiser jpeg, troque para .jpeg
          const finalFormat = 'webp';
          const ext = finalFormat === 'webp' ? '.webp' : '.jpg';

          // ajustar qualidade conforme desejar
          const finalBuffer = await image.toFormat(finalFormat, { quality: 80 }).toBuffer();

          const filename = `${unique}__${baseName}${ext}`;
          const filepath = path.join(uploadDir, filename);

          await fs.promises.writeFile(filepath, finalBuffer);

          // garantir dados úteis para quem vier depois
          req.file.filename = filename;
          req.file.path = filepath;
          req.file.size = finalBuffer.length;
          req.file.mimetype = finalFormat === 'webp' ? 'image/webp' : 'image/jpeg';

          return next();
        }
      } catch (e) {
        return next(e);
      }
    });
  };
}
;
