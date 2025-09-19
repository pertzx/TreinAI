// controllers/profissionalController.js
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Profissional from "../models/Profissional.js";
import User from "../models/User.js";
import { v4 as uuidv4 } from "uuid";
import { getBrazilDate } from "../helpers/getBrazilDate.js";
import mongoose from "mongoose";

// Se estiver em ESM e precisar de __dirname:
const __filename = typeof fileURLToPath === "function" ? fileURLToPath(import.meta.url) : "";
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

// pasta onde o multer deve salvar (ex.: ./uploads/image-profissional)
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "image-profissional");

/**
 * GET /profissionais?userId=...             -> retorna um profissional específico
 * GET /profissionais                        -> lista com filtros/paginação
 *
 * Query params (listar):
 *  - q: string (search por nome/biografia/especialidade)
 *  - country / pais: string
 *  - state / estado: string
 *  - city / cidade: string
 *  - especialidade: string
 *  - page: number (default 1)
 *  - limit: number (default 20)
 */
export const profissionais = async (req, res) => {
  try {
    const {
      userId,
      q,
      country,
      pais,
      state,
      estado,
      city,
      cidade,
      especialidade,
      page = 1,
      limit = 20
    } = req.query;

    // aceita userId -> retorna 1 profissional (detalhado)
    if (userId) {
      const profissional = await Profissional.findOne({
        $or: [
          { profissionalId: userId },
          { userId: userId }
        ]
      });

      if (!profissional) {
        return res.status(404).json({ success: false, msg: "Profissional não encontrado para o userId fornecido." });
      }
      return res.status(200).json({ success: true, msg: "Tudo ok!", profissional });
    }

    // montar filtro com a nova estrutura (country/state/city)
    const filter = {};

    // pesquisa livre (q) em nome/biografia/especialidade (case-insensitive)
    if (q && String(q).trim()) {
      const regex = new RegExp(escapeRegex(String(q).trim()), "i");
      filter.$or = [{ profissionalName: regex }, { biografia: regex }, { especialidade: regex }];
    }

    // country (aceita 'country' ou 'pais' para compatibilidade)
    const countryVal = (country || pais || "").trim();
    if (countryVal) {
      // match exato case-insensitive
      filter.country = new RegExp(`^${escapeRegex(countryVal)}$`, "i");
    }

    // state (aceita 'state' ou 'estado')
    const stateVal = (state || estado || "").trim();
    if (stateVal) {
      filter.state = new RegExp(`^${escapeRegex(stateVal)}$`, "i");
    }

    // city (aceita 'city' ou 'cidade')
    const cityVal = (city || cidade || "").trim();
    if (cityVal) {
      filter.city = new RegExp(`^${escapeRegex(cityVal)}$`, "i");
    }

    if (especialidade && String(especialidade).trim()) {
      filter.especialidade = String(especialidade).trim();
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * perPage;

    const [total, profissionaisList] = await Promise.all([
      Profissional.countDocuments(filter),
      Profissional.find(filter)
        .sort({ criadoEm: -1 })
        .skip(skip)
        .limit(perPage)
        .lean()
    ]);

    return res.status(200).json({
      success: true,
      msg: "Lista de profissionais",
      data: {
        total,
        page: pageNum,
        perPage,
        items: profissionaisList
      }
    });
  } catch (error) {
    console.error("Erro em profissionais:", error);
    return res.status(500).json({ success: false, msg: "Erro ao buscar profissionais." });
  }
};

/**
 * POST /profissional (multipart/form-data)
 * campos esperados: profissionalName, biografia, userId, especialidade, (opcional) country/state/city, lat/lng
 * arquivo opcional: image (campo 'image') — middleware multer.single('image') deve ser aplicado na rota
 *
 * Exemplo de uso do multer no router:
 *  import { upload } from '../utils/upload'; // seu middleware multer configurado
 *  router.post('/publicar-profissional', upload.single('image'), publicarProfissional);
 */
export const publicarProfissional = async (req, res) => {
  try {
    // campos vindos do body (multipart/form-data => text fields em req.body)
    const {
      profissionalName: _profissionalName,
      biografia: _biografia,
      userId: _userId,
      especialidade: _especialidade,
      country: _country,
      pais: _pais,
      countryCode: _countryCode,
      state: _state,
      estado: _estado,
      city: _city,
      cidade: _cidade,
      lat: _lat,
      lng: _lng
    } = req.body || {};

    // validações básicas - retornar 400 quando faltar
    if (!(_profissionalName && _biografia && _userId && _especialidade)) {
      return res.status(400).json({
        success: false,
        msg: "Campos obrigatórios faltando: profissionalName, biografia, userId, especialidade."
      });
    }

    const profissionalName = String(_profissionalName).trim();
    const biografia = String(_biografia).trim();
    const userId = String(_userId).trim();
    const especialidade = String(_especialidade).trim();

    // localização (aceita campos em pt/en)
    const country = (_country || _pais || null);
    const countryCode = _countryCode ? String(_countryCode).trim().toUpperCase() : null;
    const state = (_state || _estado || null);
    const city = (_city || _cidade || null);

    // valida user existe (procura por _id ou userId string)
    const user = await User.findOne({ _id: userId }).lean().catch(() => null) || await User.findOne({ userId }).lean().catch(() => null);
    if (!user) {
      return res.status(404).json({ success: false, msg: "Usuário não encontrado para o userId fornecido." });
    }

    // evita duplicata: se já existir profissional para esse userId -> 409
    const profissionalExists = await Profissional.findOne({ userId });
    if (profissionalExists) {
      return res.status(409).json({ success: false, msg: "Já existe um profissional registrado com esse userId." });
    }

    // lidar com imagem (se multer colocou em req.file)
    let imageUrl = null;
    if (req.file) {
      try {
        const filename = req.file.filename;
        const host = req.get && req.get("host") ? req.get("host") : (req.headers && req.headers.host) || "localhost";
        const protocol = req.protocol || "http";
        imageUrl = `${protocol}://${host}/uploads/image-profissional/${filename}`;
      } catch (err) {
        console.warn("Falha ao montar imageUrl do arquivo enviado:", err);
        imageUrl = null;
      }
    } else {
      // fallback: procurar arquivo existente cujo nome contenha userId
      try {
        if (fs.existsSync(UPLOAD_DIR)) {
          const files = fs.readdirSync(UPLOAD_DIR);
          const found = files.find(f => f.includes(userId));
          if (found) {
            const host = req.get && req.get("host") ? req.get("host") : (req.headers && req.headers.host) || "localhost";
            const protocol = req.protocol || "http";
            imageUrl = `${protocol}://${host}/uploads/image-profissional/${found}`;
          }
        }
      } catch (err) {
        // não crítico
      }
    }

    // parse seguro de lat/lng
    const parseNum = (v) => {
      if (v === undefined || v === null) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const lat = parseNum(_lat);
    const lng = parseNum(_lng);

    // montar payload sem location por padrão
    const payload = {
      profissionalId: uuidv4(),
      profissionalName,
      biografia,
      userId,
      especialidade,
      imageUrl: imageUrl || null,
      country: country ? String(country).trim() : null,
      countryCode: countryCode || null,
      state: state ? String(state).trim() : null,
      city: city ? String(city).trim() : null,
      criadoEm: new Date()
    };

    // somente anexa location se lat e lng forem válidos
    if (lat !== undefined && lng !== undefined) {
      payload.location = { type: 'Point', coordinates: [lng, lat] };
    }

    const newProfissional = await Profissional.create(payload);

    return res.status(201).json({
      success: true,
      msg: "Profissional criado com sucesso!",
      profissional: newProfissional
    });
  } catch (error) {
    console.error("Erro ao publicar profissional:", error);
    return res.status(500).json({ success: false, msg: "Erro ao criar profissional.", error: error.message });
  }
};

export const editarProfissional = async (req, res) => {
  try {
    // identificador tolerante (espera profissionalId | userId | _id)
    const { profissionalId, profissionalName, biografia, especialidade, country, pais, state, estado, city, cidade, lat, lng, removeImage } = req.body || {};

    if (!profissionalId) {
      return res.status(400).json({ success: false, msg: 'Parâmetro profissionalId obrigatório.' });
    }

    // busca tolerante
    const profissional = await Profissional.findOne({
      $or: [
        { profissionalId: profissionalId },
        { userId: profissionalId },
      ]
    });

    if (!profissional) {
      return res.status(404).json({ success: false, msg: 'Profissional não encontrado.' });
    }

    // helper para construir imageUrl a partir do filename
    const buildImageUrl = (filename) => {
      if (!filename) return null;
      const host = req.get && req.get('host') ? req.get('host') : (req.headers && req.headers.host) || 'localhost';
      const protocol = req.protocol || 'http';
      return `${protocol}://${host}/uploads/image-profissional/${filename}`;
    };

    // helper para deletar arquivo antigo se estiver na pasta de uploads
    const tryDeleteOldImage = (imageUrl) => {
      try {
        if (!imageUrl || typeof imageUrl !== 'string') return;
        // extrair nome do arquivo (considera urls com /uploads/image-profissional/<file>)
        const parsed = imageUrl.split('/').pop();
        if (!parsed) return;
        const filename = parsed.split('?')[0].split('#')[0];
        const candidatePath = path.join(UPLOAD_DIR, filename);

        // apenas remove se o arquivo estiver dentro do upload dir e existir
        if (candidatePath.startsWith(UPLOAD_DIR) && fs.existsSync(candidatePath)) {
          try { fs.unlinkSync(candidatePath); } catch (err) { console.warn('Falha ao remover arquivo antigo:', candidatePath, err); }
        }
      } catch (err) {
        console.warn('Erro ao tentar apagar imagem antiga:', err);
      }
    };

    // atualiza campos simples (somente se vierem)
    if (profissionalName !== undefined) profissional.profissionalName = String(profissionalName || '').trim();
    if (biografia !== undefined) profissional.biografia = String(biografia || '');

    // === NOVA LÓGICA: impedir mudança de especialidade se houver alunos ===
    if (especialidade !== undefined) {
      const newEspecialidade = String(especialidade || '').trim();
      const currentEspecialidade = String(profissional.especialidade || '').trim();

      // se estiver tentando alterar para uma especialidade diferente
      if (newEspecialidade && newEspecialidade !== currentEspecialidade) {
        const hasAlunos = Array.isArray(profissional.alunos) && profissional.alunos.length > 0;
        if (hasAlunos) {
          return res.status(400).json({
            success: false,
            msg: 'Não é possível alterar a especialidade enquanto existirem alunos associados a este profissional. Remova todos os alunos antes de mudar de especialidade.'
          });
        }
      }

      // se passou na validação acima, aplica a especialidade (pode ser string vazia)
      profissional.especialidade = newEspecialidade || '';
    }

    // localização (aceitar pt/en)
    const countryVal = country || pais;
    const stateVal = state || estado;
    const cityVal = city || cidade;
    if (countryVal !== undefined) profissional.country = countryVal ? String(countryVal).trim() : null;
    if (stateVal !== undefined) profissional.state = stateVal ? String(stateVal).trim() : null;
    if (cityVal !== undefined) profissional.city = cityVal ? String(cityVal).trim() : null;

    // lat/lng parse
    const parseNum = (v) => {
      if (v === undefined || v === null || v === '') return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const latNum = parseNum(lat);
    const lngNum = parseNum(lng);
    if (latNum !== undefined && lngNum !== undefined) {
      profissional.location = { type: 'Point', coordinates: [lngNum, latNum] };
    } else if ((lat !== undefined && lat === '') || (lng !== undefined && lng === '')) {
      // caso cliente envie string vazia para limpar
      profissional.location = undefined;
    }

    // tratar remoção explícita de imagem
    const wantRemoveImage = (removeImage === '1' || removeImage === 'true' || removeImage === 'yes' || removeImage === true);

    // se veio arquivo novo no multipart -> substituir imagem
    if (req.file && req.file.filename) {
      // apagar a antiga (se houver)
      if (profissional.imageUrl) {
        tryDeleteOldImage(profissional.imageUrl);
      }

      // montar nova imageUrl
      const filename = req.file.filename;
      profissional.imageUrl = buildImageUrl(filename);
    } else if (wantRemoveImage) {
      // apagar antiga e setar null
      if (profissional.imageUrl) {
        tryDeleteOldImage(profissional.imageUrl);
      }
      profissional.imageUrl = null;
    }
    // caso nenhum dos dois: mantém a imagem atual

    // atualiza campo 'atualizadoEm' ou similar se quiser
    profissional.atualizadoEm = new Date();

    // salva
    const saved = await profissional.save();

    return res.status(200).json({
      success: true,
      msg: 'Profissional atualizado com sucesso.',
      profissional: saved
    });
  } catch (error) {
    console.error('Erro em editarProfissional:', error);
    return res.status(500).json({ success: false, msg: 'Erro interno ao editar profissional.', error: error.message });
  }
};

/* --------------------- Helpers --------------------- */

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const queroSerAluno = async (req, res) => {
  const { email, profissionalId, mensagem, force } = req.body;

  if (!email || !profissionalId || !mensagem) {
    return res.status(400).json({ success: false, msg: "!email || !profissionalId || !mensagem" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, msg: 'Não conseguimos encontrar o seu usuário com base no email repassado.' });
    }

    // procura por profissionalId (tolerante: profissionalId, userId ou _id)
    const profissional = await Profissional.findOne({
      $or: [
        { profissionalId: profissionalId },
        { userId: profissionalId },
      ]
    });

    if (!profissional) {
      return res.status(404).json({ success: false, msg: 'Não conseguimos encontrar o profissional com base no profissionalId repassado.' });
    }

    // --- verificação robusta para evitar auto-reivindicação ---
    const uidStr = String(user._id || user.userId || user.id || '').trim();
    const profIdCandidates = [
      String(profissional.userId || '').trim(),
      String(profissional.profissionalId || '').trim()
    ].filter(Boolean);

    // 1) se qualquer id do profissional for igual ao id do usuário -> bloqueia
    if (profIdCandidates.some(pid => pid === uidStr)) {
      return res.status(400).json({ success: false, msg: 'Você não pode pedir para ser aluno do seu próprio perfil.' });
    }

    // 2) se o user já tem esse profissional em coachsId (possível mapeamento no user) -> bloqueia
    if (user.coachsId && typeof user.coachsId === 'object') {
      const values = Object.values(user.coachsId).map(v => String(v).trim()).filter(Boolean);
      if (values.some(v => profIdCandidates.includes(v))) {
        return res.status(409).json({ success: false, msg: 'Você já está associado a este profissional.' });
      }
    }
    // --- fim verificação ---

    // uid para gravar no array de alunos
    const uid = uidStr;

    // verifica se já existe entrada para esse userId nos alunos deste profissional
    const existingIndex = (profissional.alunos || []).findIndex(a => String(a.userId) === uid);

    if (existingIndex !== -1) {
      // atualiza a entrada existente (atualiza mensagem e timestamp)
      profissional.alunos[existingIndex].mensagem = String(mensagem);
      profissional.alunos[existingIndex].ultimoUpdate = getBrazilDate();
      // não sobrescreve flags como .aceito
      await profissional.save();

      return res.status(200).json({
        success: true,
        msg: 'Pedido atualizado — você já havia solicitado antes, atualizei a mensagem/horário.',
        aluno: profissional.alunos[existingIndex],
        profissionalId: profissional.profissionalId
      });
    }

    // --- VERIFICAÇÃO: existe outro profissional associado ao usuário com a mesma especialidade? ---
    try {
      // pega ids conhecidos do user (se houver)
      const userCoachIds = (user.coachsId && typeof user.coachsId === 'object')
        ? Object.values(user.coachsId).map(v => String(v).trim()).filter(Boolean)
        : [];

      // procura por qualquer profissional com a mesma especialidade que:
      //  - já tenha esse user como aluno aceito, OU
      //  - esteja presente nos coach ids do usuário (mapeamentos)
      const sameSpecProf = await Profissional.findOne({
        especialidade: profissional.especialidade,
        $or: [
          { alunos: { $elemMatch: { userId: uid, aceito: true } } },
          ...(userCoachIds.length ? [
            { userId: { $in: userCoachIds } },
            { profissionalId: { $in: userCoachIds } }
          ] : [])
        ]
      });

      if (sameSpecProf) {
        // se o profissional encontrado for diferente do que o usuário está tentando adicionar -> conflito
        const sameProfIds = [
          String(sameSpecProf._id || '').trim(),
          String(sameSpecProf.userId || '').trim(),
          String(sameSpecProf.profissionalId || '').trim()
        ].filter(Boolean);

        const isSameAsRequested = sameProfIds.some(id => profIdCandidates.includes(id));
        if (!isSameAsRequested) {
          // conflito: existe outro profissional com a mesma especialidade associado ao usuário
          const profName = sameSpecProf.profissionalName || sameSpecProf.name || 'um profissional';

          // se o usuario NÃO enviou force=true -> bloqueia com 409 e informa como proceder
          if (!force) {
            return res.status(409).json({
              success: false,
              msg: `Você já possui ${profName} associado(a) com a especialidade "${profissional.especialidade}". Só é permitido ter um profissional por especialidade por vez. ` +
                   `Se deseja solicitar este novo profissional e eventualmente substituir o atual quando o novo aceitar, reenvie com { force: true }.`,
              currentProfessional: {
                id: sameSpecProf.profissionalId || sameSpecProf._id,
                name: profName,
                especialidade: sameSpecProf.especialidade || ''
              },
              canForce: true
            });
          }

          // se chegou aqui, force === true -> cria a solicitação normalmente, marcando-a como forceRequest
          // (a troca só ocorrerá no /aceitar-aluno quando o novo profissional aceitar)
          const payloadForce = {
            userId: uid,
            mensagem: String(mensagem),
            criadoEm: new Date(),
            ultimoUpdate: getBrazilDate(),
            aceito: false,
            forceRequest: true, // sinaliza que o usuário solicitou troca
            previousProfessional: {
              id: sameSpecProf.profissionalId || sameSpecProf._id,
              name: sameSpecProf.profissionalName || sameSpecProf.name || null
            }
          };

          profissional.alunos.push(payloadForce);
          await profissional.save();

          return res.status(201).json({
            success: true,
            warning: true,
            msg: `Solicitação enviada. Observação: você já possui ${profName} como profissional para "${profissional.especialidade}". Quando este novo profissional aceitar, o sistema removerá a associação anterior automaticamente.`,
            aluno: payloadForce,
            profissionalId: profissional.profissionalId || profissional._id,
            currentProfessional: { id: sameSpecProf.profissionalId || sameSpecProf._id, name: profName }
          });
        }
      }
    } catch (errCheck) {
      // se a checagem falhar por qualquer motivo, não interrompe o fluxo - apenas loga e segue (fallback)
      console.warn('Falha ao verificar profissionais com mesma especialidade:', errCheck);
    }
    // --- fim checagem de especialidade ---

    // se não houve conflito (ou não foi encontrado outro), cria a solicitação normalmente
    const payload = {
      userId: uid,
      mensagem: String(mensagem),
      criadoEm: new Date(),
      ultimoUpdate: getBrazilDate(),
      aceito: false
    };

    profissional.alunos.push(payload);
    await profissional.save();

    return res.status(201).json({
      success: true,
      msg: 'Pedido para ser aluno enviado com sucesso!',
      aluno: payload,
      profissionalId: profissional.profissionalId
    });

  } catch (error) {
    console.error('Erro em queroSerAluno:', error);
    return res.status(500).json({ success: false, msg: 'Erro interno ao processar pedido.', error: error.message });
  }
};

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * POST /aceitar-aluno
 * body: { profissionalId, alunoUserId }
 *
 * - marca aluno.aceito = true dentro de profissional.alunos
 * - atualiza user.coachsId[especialidade] = idDoProfissional
 */
export const aceitarAluno = async (req, res) => {
  const { profissionalId, alunoUserId } = req.body;

  if (!profissionalId || !alunoUserId) {
    return res.status(400).json({
      success: false,
      msg: 'Parâmetros faltando: profissionalId e alunoUserId são obrigatórios.'
    });
  }

  const alunoIdStr = String(alunoUserId);

  let session;
  try {
    session = await Profissional.startSession();
    session.startTransaction();
  } catch (errStart) {
    console.error('Não foi possível iniciar sessão/transaction:', errStart);
    return res.status(500).json({
      success: false,
      msg: 'Transações não disponíveis. Habilite replica set no MongoDB.',
      error: errStart.message
    });
  }

  try {
    // 1) busca o profissional dentro da sessão
    const profissional = await Profissional.findOne({
      $or: [{ profissionalId: profissionalId }, { userId: profissionalId }]
    }).session(session);

    if (!profissional) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        msg: 'Profissional não encontrado com o profissionalId informado.'
      });
    }

    // 2) encontra índice do aluno na lista deste profissional
    const idx = (profissional.alunos || []).findIndex(a => String(a.userId) === alunoIdStr);

    let alunoEntry;
    if (idx === -1) {
      alunoEntry = {
        userId: alunoIdStr,
        mensagem: '',
        criadoEm: new Date(),
        ultimoUpdate: getBrazilDate(),
        aceito: true,
        aceitoEm: getBrazilDate()
      };
      profissional.alunos.push(alunoEntry);
    } else {
      profissional.alunos[idx].aceito = true;
      profissional.alunos[idx].aceitoEm = getBrazilDate();
      profissional.alunos[idx].ultimoUpdate = getBrazilDate();
      alunoEntry = profissional.alunos[idx];
    }

    await profissional.save({ session });

    const especialidadeKey = profissional.especialidade ? String(profissional.especialidade) : 'default';
    const profIdValue = profissional.profissionalId;

    // 3) busca o usuário
    const user = await User.findOne({
      $or: [{ _id: alunoIdStr }, { userId: alunoIdStr }]
    }).session(session);

    // 4) busca profissional antigo associado ao user para mesma especialidade
    let previousProf = null;
    if (user && user.coachsId && typeof user.coachsId === 'object') {
      const prevId = user.coachsId[especialidadeKey];
      if (prevId) {
        const queryOr = [{ profissionalId: prevId }, { userId: prevId }];
        if (isValidObjectId(prevId)) queryOr.push({ _id: new mongoose.Types.ObjectId(prevId) });

        previousProf = await Profissional.findOne({ $or: queryOr }).session(session);
      }
    }

    if (!previousProf) {
      const query = {
        especialidade: profissional.especialidade,
        alunos: { $elemMatch: { userId: alunoIdStr, aceito: true } }
      };
      if (isValidObjectId(profissional._id)) query._id = { $ne: profissional._id };

      previousProf = await Profissional.findOne(query).session(session);
    }

    let previousRemoved = null;
    if (previousProf) {
      const prevIds = [
        String(previousProf._id),
        String(previousProf.userId || ''),
        String(previousProf.profissionalId || '')
      ].map(s => s.trim()).filter(Boolean);

      const isSameAsRequested = prevIds.some(id => String(id) === String(profIdValue));
      if (!isSameAsRequested) {
        previousProf.alunos = (previousProf.alunos || []).filter(a => String(a.userId) !== alunoIdStr);
        await previousProf.save({ session });
        previousRemoved = {
          id: previousProf.profissionalId || previousProf._id,
          name: previousProf.profissionalName || previousProf.name || null
        };
      }
    }

    if (user) {
      user.coachsId = user.coachsId && typeof user.coachsId === 'object' ? user.coachsId : {};
      user.coachsId[especialidadeKey] = profIdValue;
      await user.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      msg: 'Aluno aceito com sucesso.',
      aluno: alunoEntry,
      profissionalId: profissional.profissionalId || profissional._id,
      previousProfessionalRemoved: previousRemoved,
      userUpdated: user ? { _id: user._id, coachsId: user.coachsId } : null
    });
  } catch (error) {
    try {
      if (session) {
        await session.abortTransaction();
        session.endSession();
      }
    } catch (e) {
      console.warn('Erro ao abortar transaction:', e);
    }

    console.error('Erro em aceitarAluno (transaction):', error);
    return res.status(500).json({
      success: false,
      msg: 'Erro interno ao aceitar aluno.',
      error: error.message
    });
  }
};

/**
 * POST /remover-aluno
 * body: { profissionalId, alunoUserId }
 *
 * - remove todas as entradas de profissional.alunos cujo userId casem com alunoUserId
 * - se encontrar o User, remove a chave em user.coachsId que apontava para esse profissional
 */
export const removerAluno = async (req, res) => {
  const { profissionalId, alunoUserId } = req.body || {};

  if (!profissionalId || !alunoUserId) {
    return res.status(400).json({ success: false, msg: 'Faltando parâmetros: profissionalId e alunoUserId são obrigatórios.' });
  }

  try {
    // procura pelo profissional (tolerante: profissionalId, userId ou _id)
    const profissional = await Profissional.findOne({
      $or: [
        { profissionalId: profissionalId },
        { userId: profissionalId },
      ]
    });

    if (!profissional) {
      return res.status(404).json({ success: false, msg: 'Profissional não encontrado para o profissionalId fornecido.' });
    }

    const originalCount = Array.isArray(profissional.alunos) ? profissional.alunos.length : 0;
    const filtered = (profissional.alunos || []).filter(a => String(a.userId) !== String(alunoUserId));
    const removedCount = originalCount - filtered.length;

    if (removedCount === 0) {
      return res.status(404).json({ success: false, msg: 'Aluno não encontrado na lista do profissional.' });
    }

    // atualiza e salva profissional
    profissional.alunos = filtered;
    await profissional.save();

    // tenta atualizar o usuário removido: retirar entry em coachsId se apontar para esse profissional
    const user = await User.findOne({
      $or: [
        { _id: alunoUserId },
        { userId: alunoUserId }
      ]
    });

    let userUpdated = null;
    if (user) {
      user.coachsId = user.coachsId && typeof user.coachsId === 'object' ? user.coachsId : {};

      const especialidadeKey = profissional.especialidade ? String(profissional.especialidade) : 'default';
      const profIdValue = profissional.profissionalId || String(profissional._id);

      // só remove se a chave existir e tiver o mesmo valor do profissional
      if (user.coachsId[especialidadeKey] && String(user.coachsId[especialidadeKey]) === String(profIdValue)) {
        user.coachsId[especialidadeKey] = null;
        await user.save();
      }

      userUpdated = { _id: user._id, coachsId: user.coachsId };
    }

    return res.status(200).json({
      success: true,
      msg: `Aluno removido com sucesso (${removedCount} registro(s) removido(s)).`,
      removedCount,
      profissionalId: profissional.profissionalId || profissional._id,
      alunos: profissional.alunos,
      userUpdated
    });
  } catch (error) {
    console.error('Erro em removerAluno:', error);
    return res.status(500).json({ success: false, msg: 'Erro interno ao remover aluno.', error: error.message });
  }
};