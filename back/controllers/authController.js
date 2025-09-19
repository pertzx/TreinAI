// controllers/authController.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isSameDay as isSameDayFn } from 'date-fns';
import * as dateFnsTz from 'date-fns-tz';
import { getBrazilDate } from '../helpers/getBrazilDate.js';
import Profissional from '../models/Profissional.js';
import mongoose from 'mongoose';

dotenv.config();

const SECRET_JWT = process.env.SECRET_JWT;
const SALT_ROUNDS = 10;

// cria __filename e __dirname em ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// agora você pode usar __dirname normalmente
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads/image-perfil');

// garante que exista
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Config OpenAI
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

/**
 * Mapear texto/resumo para um objetivo suportado pelo schema
 * Retorna uma das chaves: 'hipertrofia', 'emagrecimento', 'condicionamento', 'saude', 'forca', 'resistencia' ou null
 */
function mapSummaryToObjective(text) {
  if (!text) return null;
  const s = text.toLowerCase();
  if (s.match(/massa|hipertrof/)) return 'hipertrofia';
  if (s.match(/perda de peso|perder peso|emagrec|definição/)) return 'emagrecimento';
  if (s.match(/condicion|cardio|cardiovascul|resist(en|ência)/)) return 'condicionamento';
  if (s.match(/\bsaú|saud/)) return 'saude';
  if (s.match(/forç|forca/)) return 'forca';
  if (s.match(/resist|resistência/)) return 'resistencia';
  return null;
}

/**
 * Summarize answers via OpenAI Chat API.
 * Returns { summary: string|null, objective_hint: string|null, raw: string|null }
 */
async function summarizeWithOpenAI(answers) {
  if (!openai) throw new Error('OpenAI client not configured.');
  const systemPrompt = `Você é um assistente que recebe respostas de um questionário sobre treino físico.
  se o usuario praticar algum esporte deixe o resumo mais focado neste esporte.
Descreva o objetivo da pessoa com base nas respostas e deixe as bem entendiveis e em português e retorne UM JSON com os campos:
- "summary": string (resumo curto),
- "objective_hint": string (uma palavra sugerindo objetivo: hipertrofia, emagrecimento, condicionamento, saude, forca, resistencia).
Retorne apenas o JSON.`;

  const userContent = `Respostas do usuário: ${answers}`;

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    max_tokens: 300,
    temperature: 0.2
  });

  const text = resp?.choices?.[0]?.message?.content || null;
  if (!text) return { summary: null, objective_hint: null, raw: null };

  try {
    const begin = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (begin !== -1 && end !== -1) {
      const jsonText = text.slice(begin, end + 1);
      const parsed = JSON.parse(jsonText);
      return {
        summary: parsed.summary || null,
        objective_hint: parsed.objective_hint || parsed.objective || null,
        raw: text
      };
    }
  } catch { }
  return { summary: text.trim(), objective_hint: null, raw: text };
}

// =======================
// LOGIN
// =======================
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ msg: "Email e senha são obrigatórios!" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "Usuário não encontrado!" });

    // Comparar senha
    const senhaCorreta = await bcrypt.compare(password, user.password);
    if (!senhaCorreta) {
      // Atualiza falhas de login
      user.stats = user.stats || {};
      user.stats.failedLoginAttempts = (user.stats.failedLoginAttempts || 0) + 1;
      await user.save();
      return res.status(401).json({ msg: "Senha incorreta!" });
    }

    // Gera token
    const token = jwt.sign({ email: user.email }, SECRET_JWT, { expiresIn: "7d" });

    return res.json({
      msg: "Login realizado com sucesso!",
      token,
      userId: user._id,
    });
  } catch (err) {
    return res.status(500).json({ msg: "Erro no login", error: err.message });
  }
};

// =======================
// SIGNUP
// =======================
export const signup = async (req, res) => {
  try {
    const { email, password, username, plano } = req.body;

    if (!email || !password || !username || !plano) {
      return res.status(400).json({ msg: 'Email, senha, nome de usuário e plano são obrigatórios.' });
    }

    const userExistente = await User.findOne({ email });
    if (userExistente) {
      return res.status(400).json({ msg: "Este usuário já existe." });
    }

    // Hash da senha
    const hashSenha = await bcrypt.hash(password, SALT_ROUNDS);

    if (plano === 'free' || plano === 'pro' || plano === 'max' || plano === 'coach') {
      const newUser = await User.create({
        username,
        email,
        password: hashSenha,
        planInfos: { status: 'inativo', planType: plano }
      });

      // Gera token
      const token = jwt.sign({ email }, SECRET_JWT, { expiresIn: "7d" });

      return res.status(201).json({ msg: 'Usuário criado com sucesso!', newUser, token });
    } else {
      return res.json({ msg: "!(plano === 'free' || plano === 'pro' || plano === 'max' || plano === 'coach')" })
    }

  } catch (err) {
    return res.status(500).json({ msg: "Erro ao criar usuário", error: err.message });
  }
};

// =======================
// DASHBOARD (rota protegida)
// =======================
export const dashboard = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.userEmail });
    if (!user) {
      return res.status(404).json({ msg: "Usuário não encontrado no dashboard." });
    }

    // Coletar dados do acesso
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Dispositivo desconhecido';

    // Atualizar estatísticas
    user.stats = user.stats || {};
    user.stats.lastLogin = new Date(getBrazilDate());

    user.stats.deviceHistory = user.stats.deviceHistory || [];
    if (!user.stats.deviceHistory.includes(userAgent)) {
      user.stats.deviceHistory.push(userAgent);
    }

    user.stats.ipHistory = user.stats.ipHistory || [];
    if (!user.stats.ipHistory.includes(ip)) {
      user.stats.ipHistory.push(ip);
    }

    await user.save();

    return res.json({
      msg: `Bem-vindo ao dashboard, ${user.username}!`,
      user
    });
  } catch (err) {
    return res.status(500).json({ msg: "Erro ao acessar dashboard", error: err.message });
  }
};

// =======================
// changeTheme
// =======================
export const changeTheme = async (req, res) => {
  try {
    const { email, novoTema } = req.body;

    if (!email || !novoTema) {
      return res.json({ msg: 'Você precisa nos informar email e novoTema.' });
    }

    const usr = await User.findOne({ email });

    if (!usr) {
      return res.json({ msg: 'Nao foi possivel encontrar o seu usuario.' });
    }

    if (usr.preferences?.theme === novoTema) {
      return res.json({ msg: 'Voce esta tentando alterar usando o mesmo valor para o novo tema.' });
    }

    usr.preferences = usr.preferences || {};
    usr.preferences.theme = novoTema;

    await usr.save();

    return res.json({ msg: 'Theme alterado com sucesso.', user: usr });
  } catch (err) {
    console.error('changeTheme error:', err);
    return res.status(500).json({ msg: 'Erro ao alterar tema', error: err.message });
  }
};

// =======================
// completeOnboarding (usa OpenAI para resumir/resposta de objetivo)
// =======================
export const completeOnboarding = async (req, res) => {
  try {
    const { email, answers, completed, completedAt, startedAt } = req.body;
    if (!email) return res.status(401).json({ msg: 'Usuário não autenticado.' });

    console.log(answers)
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado' });

    if (!answers) return res.json({ msg: 'Você não passou as respostas.' });
    if (!completed || !completedAt || !startedAt) return res.json({ msg: '!completed || !completedAt || !startedAt' });

    // Filtra respostas para salvar apenas responseAnswer
    const sanitizedAnswers = Object.keys(answers).map(key => ({
      responseAnswer: answers[key]?.responseAnswer || ''
    }));

    user.onboarding.startedAt = startedAt;
    user.onboarding.completed = completed;
    user.onboarding.completedAt = completedAt;

    // OpenAI resumindo respostas
    if (sanitizedAnswers.length > 0 && openai) {
      try {
        const aiResult = await summarizeWithOpenAI(answers);
        const candidate = aiResult.objective_hint || null;
        const mapped = mapSummaryToObjective(candidate || aiResult.summary || '');

        if (mapped) {
          user.perfil = user.perfil || {};
          user.perfil.objetivo = mapped + ' - ' + aiResult.summary;
        } else {
          user.perfil.objetivo = aiResult.summary;
        }
      } catch (err) {
        console.error('OpenAI summarization failed:', err?.message || err);
      }
    }

    await user.save();
    return res.json({ msg: 'Tudo certo!', user });

  } catch (err) {
    console.error('completeOnboarding error:', err);
    return res.status(500).json({ msg: 'Erro ao processar onboarding', error: err.message });
  }
};

const isSameDayWithTZ = (d1, d2, timezone = 'UTC') => {
  try {
    const date1 = d1 ? new Date(d1) : null;
    const date2 = d2 ? new Date(d2) : null;
    if (!date1 || !date2) return false;
    // converte para o timezone escolhido (não altera o instante, apenas a interpretação por fuso)
    const zoned1 = utcToZonedTime(date1, timezone);
    const zoned2 = utcToZonedTime(date2, timezone);
    return isSameDayFn(zoned1, zoned2);
  } catch (err) {
    // fallback: compara por ano/mês/dia em UTC
    const a = new Date(d1);
    const b = new Date(d2);
    return a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate();
  }
};

// normaliza arrays de histórico: transforma entradas primitivas em { valor, publicadoEm }
const normalizeHistoryArray = (arr) => {
  if (!arr) return [];
  return arr.map(item => {
    if (item && typeof item === 'object' && ('valor' in item || 'publicadoEm' in item)) {
      return {
        valor: Number(item.valor ?? 0),
        publicadoEm: item.publicadoEm ? new Date(item.publicadoEm).toISOString() : new Date().toISOString()
      };
    }
    const n = Number(item);
    return { valor: Number.isNaN(n) ? 0 : n, publicadoEm: new Date().toISOString() };
  });
};

export const atualizarPerfil = async (req, res) => {
  try {
    const body = req.body || {};
    const email = body.email || req.headers['x-email'];
    if (!email) return res.status(400).json({ msg: 'O email é obrigatório.' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado para o email fornecido.' });

    // opcional: timezone do cliente (por ex. 'America/Sao_Paulo')
    const timezone = body.timezone || user.perfil?.timezone || 'UTC';

    const { username, objetivo, pesoAtual, altura, idade, genero } = body;

    if (username !== undefined) user.username = String(username).trim();
    if (objetivo !== undefined) {
      user.perfil = user.perfil || {};
      user.perfil.objetivo = String(objetivo);
    }

    // normaliza arrays (garante formato consistente) — armazenamos ISO strings
    user.perfil = user.perfil || {};
    user.perfil.pesoAtual = normalizeHistoryArray(user.perfil.pesoAtual);
    user.perfil.altura = normalizeHistoryArray(user.perfil.altura);

    // ===== Peso: se fornecido, atualiza ou insere dependendo do dia (no timezone do usuário) =====
    if (pesoAtual !== undefined && pesoAtual !== '') {
      const pesoNum = Number(pesoAtual);
      if (!Number.isNaN(pesoNum)) {
        const nowISO = new Date().toISOString();
        const last = user.perfil.pesoAtual.length ? user.perfil.pesoAtual[user.perfil.pesoAtual.length - 1] : null;
        if (last && isSameDayWithTZ(last.publicadoEm, nowISO, timezone)) {
          // mesmo dia -> atualiza
          last.valor = pesoNum;
          last.publicadoEm = nowISO;
        } else {
          // novo dia -> push
          user.perfil.pesoAtual.push({ valor: pesoNum, publicadoEm: nowISO });
        }
      }
    }

    // ===== Altura: mesma lógica =====
    if (altura !== undefined && altura !== '') {
      const altNum = Number(altura);
      if (!Number.isNaN(altNum)) {
        const nowISO = new Date().toISOString();
        const lastA = user.perfil.altura.length ? user.perfil.altura[user.perfil.altura.length - 1] : null;
        if (lastA && isSameDayWithTZ(lastA.publicadoEm, nowISO, timezone)) {
          lastA.valor = altNum;
          lastA.publicadoEm = nowISO;
        } else {
          user.perfil.altura.push({ valor: altNum, publicadoEm: nowISO });
        }
      }
    }

    if (idade !== undefined && idade !== '') {
      const idadeNum = Number(idade);
      if (!Number.isNaN(idadeNum)) user.perfil.idade = idadeNum;
    }

    if (genero !== undefined) user.perfil.genero = String(genero);

    // ===== NOVO: localização (country, countryCode, state, city) =====
    // Se um campo for enviado (mesmo vazio), atualiza; se omitido, mantém o valor anterior.
    const { country, countryCode, state, city, lat, lng } = body;

    // garante existência do perfil
    user.perfil = user.perfil || {};

    if (country !== undefined) {
      const c = country ? String(country).trim() : '';
      user.perfil.country = c;
      user.country = c; // duplicar no topo por compatibilidade
    }
    if (countryCode !== undefined) {
      const cc = countryCode ? String(countryCode).trim() : '';
      user.perfil.countryCode = cc;
      user.countryCode = cc;
    }
    if (state !== undefined) {
      const s = state ? String(state).trim() : '';
      user.perfil.state = s;
      user.state = s;
    }
    if (city !== undefined) {
      const ci = city ? String(city).trim() : '';
      user.perfil.city = ci;
      user.city = ci;
    }

    // opcional: aceitar coordenadas geoespaciais (lat, lng) e popular perfil.location
    // espera lat/lng como números ou strings que podem ser convertidas
    if (lat !== undefined || lng !== undefined) {
      const maybeLat = lat !== undefined && lat !== '' ? Number(lat) : null;
      const maybeLng = lng !== undefined && lng !== '' ? Number(lng) : null;
      if (Number.isFinite(maybeLat) && Number.isFinite(maybeLng)) {
        user.perfil.location = { type: 'Point', coordinates: [maybeLng, maybeLat] };
      } else {
        // se quiser limpar location quando enviar vazio, descomente:
        // if (lat === '' || lng === '') user.perfil.location = undefined;
        // aqui optamos por não tocar se valores inválidos
      }
    }

    // === avatar (req.file) ===
    if (req.file) {
      const avatarUrl = `${req.protocol}://${req.get('host')}/uploads/image-perfil/${req.file.filename}`;

      // tenta remover avatar antigo se local em /uploads/
      try {
        if (user.avatar && typeof user.avatar === 'string') {
          const parsed = new URL(user.avatar, `${req.protocol}://${req.get('host')}`).pathname;
          if (parsed && parsed.startsWith('/uploads/')) {
            const oldFilename = path.basename(parsed);
            const oldPath = path.join(UPLOAD_DIR, oldFilename);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          }
        }
      } catch (err) {
        console.warn('Falha ao remover avatar antigo:', err.message || err);
      }

      user.avatar = avatarUrl;
    }

    await user.save();

    const safeUser = user.toObject ? user.toObject() : user;
    if (safeUser.password) delete safeUser.password;

    return res.json({ msg: 'Perfil atualizado com sucesso!', user: safeUser, avatarUrl: user.avatar || null });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    return res.status(500).json({ msg: `Erro interno do servidor: ${error.message}` });
  }
};

const criarTreinos = async (objetivo) => {
  const systemPrompt = `Você é um profissional responsável por criar treinos ultramente específicos com base no objetivo do cliente
  sempre buscando os exercicios mais especificos para conquistar o objetivo do cliente.
  Procure a quantidade de vezes que o cliente deseja treinar na semana e faça um treino ULTRA ESPECIFICO para cada dia de acordo com o OBJETIVO repassado e retorne **apenas JSON válido** com o formato:
  {
    "treinos": [
      {
        "treinoName": "String",
        "ordem": Number, 
        "descricao": "String",
        "exercicios": [
          {
            "ordem": Number,
            "musculo": "String",
            "nome": "String",
            "instrucoes": "String",
            "series": Number,
            "repeticoes": Number,
            "pse": Number --- PSE: Percepção subjetiva de esforço, é a escala de esforço que você deve realizar em cada exercício. Normalmente usamos esta escala para calcular a % do peso 1RM (sendo 1 MUITO fraco a 100 EXTREMAMENTE exaustivo).
          }
        ]
      }
    ]
  }`;

  const userPrompt = `Objetivo >> ${objetivo}`;

  const resp = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.2
  });

  const text = resp?.choices?.[0]?.message?.content || null;
  if (!text) return { treinos: [], raw: null };

  try {
    // Extrair JSON com regex para pegar o primeiro objeto JSON completo
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        treinos: parsed.treinos || [],
        raw: text
      };
    }
  } catch (error) {
    console.error('Erro ao parsear JSON:', error);
  }

  return { treinos: [], raw: text, total_tokens: resp?.usage?.total_tokens };
}

export const carregarTreinos = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ msg: "!email" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "Email invalido. Usuario nao encontrado." });

    if (user.planInfos && user.planInfos.status === 'inativo' && user.planInfos.planType !== 'free') {
      return res.status(400).json({ msg: 'O seu plano está inativo!' });
    }

    // Caso já tenha treinos
    if (Array.isArray(user.meusTreinos) && user.meusTreinos.length > 0) {
      return res.json({ msg: 'Você já tem treinos criados', user, total_tokens: 0 });
    }

    // Sem treinos: gerar via IA
    const meusTreinosResp = await criarTreinos(user.perfil?.objetivo);
    const treinosGPT = meusTreinosResp?.treinos || meusTreinosResp || [];
    const totalTokens = Number(meusTreinosResp?.total_tokens) || 0;

    const meusTreinos = (treinosGPT || []).map((treino, idx) => ({
      treinoId: uuidv4(),
      treinoName: treino.treinoName || `Treino ${idx + 1}`,
      ordem: treino.ordem ?? (idx + 1),
      descricao: treino.descricao || '',
      criadoEm: new Date(),
      exercicios: (treino.exercicios || []).map((ex, exIdx) => ({
        exercicioId: uuidv4(),
        ordem: ex.ordem ?? (exIdx + 1),
        musculo: ex.musculo,
        nome: ex.nome,
        instrucoes: ex.instrucoes,
        series: ex.series,
        repeticoes: ex.repeticoes,
        pse: ex.pse || 0
      }))
    }));

    // Atualiza user.stats.tokens agregando por dia (America/Sao_Paulo)
    let stats = user.stats || {};
    if (!Array.isArray(stats.tokens)) stats.tokens = [];

    try {
      if (totalTokens > 0) {
        const nowBrazil = getBrazilDate(); // Date
        const keyOf = (d) => {
          if (!d) return null;
          try {
            return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
          } catch {
            return null;
          }
        };
        const todayKey = keyOf(nowBrazil);

        const idxSameDay = stats.tokens.findIndex(entry => {
          const entryKey = keyOf(entry?.data);
          return entryKey && todayKey && entryKey === todayKey;
        });

        if (idxSameDay !== -1) {
          const prev = Number(stats.tokens[idxSameDay].valor || 0);
          stats.tokens[idxSameDay].valor = prev + totalTokens;
          stats.tokens[idxSameDay].data = nowBrazil;
        } else {
          stats.tokens.push({ valor: totalTokens, data: nowBrazil });
        }
      }
    } catch (err) {
      console.warn('Não foi possível atualizar user.stats.tokens em carregarTreinos:', err);
    }

    // se existir o profissionalId entao atualizar
    try {
      if (req?.body?.profissionalId) {
        const profissional = await Profissional.findOne({
          $or: [
            { profissionalId: req?.body?.profissionalId },
            { userId: req?.body?.profissionalId }
          ]
        });

        if (!profissional) console.log('Não encontrei o profissional com o profissionalId repassado.');
        if (profissional) {
          const aluno = profissional.alunos.find(a => String(a.userId) === String(user._id));
          if (!aluno) console.log('nao existe esse aluno em profissional: ' + profissional.profissionalName);
          if (aluno) {
            aluno.ultimoUpdate = getBrazilDate();
            await profissional.save();
          }
        }
      }
    } catch (error) {
      console.log('Não foi o profissional que fez update! ou aconteceu algum erro > ', error);
    }

    // Atualiza o user com findByIdAndUpdate (evita VersionError)
    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          meusTreinos,
          stats
        }
      },
      { new: true }
    );

    return res.json({
      msg: 'Treinos criados com sucesso!',
      meusTreinos,
      total_tokens: totalTokens
    });
  } catch (error) {
    console.error('carregarTreinos error:', error);
    return res.status(500).json({ msg: 'Erro interno', error: error.message });
  }
};

export const atualizarMeusTreinos = async (req, res) => {
  const { email, updated } = req.body;

  if (!email) return res.json({ msg: '!email' });
  if (!updated) return res.json({ msg: 'Voce nao passou o valor novo de user.meusTreinos' });

  try {
    const user = await User.findOne({ email });

    if (!user) return res.json({ msg: 'Nao conseguimos encontrar o seu usuario.' });

    user.meusTreinos = updated

    // se existir o profissionalId entao atualizar
    try {
      if (req?.body?.profissionalId) {
        const profissional = await Profissional.findOne({
          $or: [
            { profissionalId: req?.body?.profissionalId },
            { userId: req?.body?.profissionalId }
          ]
        });

        if (!profissional) console.log('Não encontrei o profissional com o profissionalId repassado.');
        if (profissional) {
          const aluno = profissional.alunos.find(a => String(a.userId) === String(user._id));

          if (!aluno) console.log('nao existe esse aluno em profissional: ' + profissional.profissionalName)
          if (aluno) {
            aluno.ultimoUpdate = getBrazilDate();

            await profissional.save()
          }
        }
      }
    } catch (error) {
      console.log('Não foi o profissional que fez update! ou aconteceu algum erro > ', error);
    }

    await user.save();

    return res.json({ msg: 'Tudo certo!', user })
  } catch (error) {
    return res.json({ msg: error })
  }
};

export const pegarUser = async (req, res) => {
  const { userId, profissionalId } = req.query;

  if (!userId || !profissionalId) {
    return res.status(400).json({ success: false, msg: 'Parâmetros obrigatórios: userId e profissionalId.' });
  }

  try {
    // 1) Buscar usuário: userId -> esperado ser o _id (ObjectId)
    let user = null;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      user = await User.findById(userId)
        .select('-password -salt -tokens -__v') // remova campos sensíveis conforme seu schema
        .lean();
    } else {
      // fallback: caso você também armazene um campo userId/string diferente do _id
      user = await User.findOne({ userId: String(userId) })
        .select('-password -salt -tokens -__v')
        .lean();
    }

    if (!user) {
      return res.status(404).json({ success: false, msg: 'Usuário não encontrado.' });
    }

    // 2) Buscar profissional: aceite profissionalId como UUID (campo profissionalId) OU um _id (ObjectId)
    let profissional = null;
    if (mongoose.Types.ObjectId.isValid(profissionalId)) {
      profissional = await Profissional.findById(profissionalId).lean();
    }
    if (!profissional) {
      profissional = await Profissional.findOne({ profissionalId: String(profissionalId) }).lean();
    }

    if (!profissional) {
      return res.status(404).json({ success: false, msg: 'Profissional não encontrado.' });
    }

    // 3) Construa versão segura do user (somente campos necessários)
    const safeUser = {
      _id: user._id,
      userId: user.userId || null,
      username: user.username || user.name || null,
      email: user.email || null,
      perfil: user.perfil || null,
      planInfos: user.planInfos || null,
      avatar: user.avatar || null,
      // adicione outros campos não-sensíveis que o front precisar
    };

    // 4) Construa versão segura do profissional (se quiser)
    const safeProfissional = {
      _id: profissional._id,
      profissionalId: profissional.profissionalId || null,
      profissionalName: profissional.profissionalName || null,
      biografia: profissional.biografia || null,
      imageUrl: profissional.imageUrl || null,
      especialidade: profissional.especialidade || null,
      city: profissional.city || null,
      state: profissional.state || null,
      country: profissional.country || null,
      alunos: Array.isArray(profissional.alunos) ? profissional.alunos : [],
    };

    return res.status(200).json({
      success: true,
      msg: 'tudo ok!',
      user,
      profissional: safeProfissional
    });
  } catch (err) {
    console.error('Erro em pegarUser:', err);
    return res.status(500).json({ success: false, msg: 'Erro interno ao processar a requisição.' });
  }
};
