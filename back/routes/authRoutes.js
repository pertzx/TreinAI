// routes/authRoutes.js
import { Router } from 'express';
import { login, dashboard, signup, changeTheme, completeOnboarding, atualizarPerfil, carregarTreinos, atualizarMeusTreinos, pegarUser } from '../controllers/authController.js';
import { verificarToken, requireAdmin, validateOwnership, authRateLimit } from '../middlewares/authMiddleware.js';
import {
  CreateCheckoutSession,
  SessionStatus,
  atualizarPlano,
  CriarAssinaturaProLocal,
  deletarLocal,
  SessionPaymentSaldoDeImpressoes,
} from '../controllers/stripe.js';
import { conversar, criarExercicioIA, criarTreinoIA } from '../controllers/UsingIA.js';
import User from '../models/User.js';
import { publicarNoHistorico } from '../controllers/database.js';
import { adicionarExercicio, adicionarReport, procurarExercicio } from '../controllers/treino.js';
import { upload, uploadMidiaAnuncio } from '../controllers/multerConfig.js';
import { aceitarAluno, editarProfissional, profissionais, publicarProfissional, queroSerAluno, removerAluno } from '../controllers/profissionais.js';
import Profissional from '../models/Profissional.js';
import { getBrazilDate } from '../helpers/getBrazilDate.js';
import { adicionarUsuario, deletarMensagem, enviarMensagem, marcarMensagensVistas, pegarChat, pegarChats, removerUsuario } from '../controllers/chatController.js';
import { conversarNutri } from '../controllers/NutriAI.js';
import { editarLocal, getLocais } from '../controllers/LocalController.js';
import { criarAnuncio, editarAnuncio, getAnuncios, deletarAnuncio } from '../controllers/AnunciosController.js';
import { adicionarRespostaSupport, alterarStatusAnuncio, alterarVisibilidadeSuporte, getAnunciosByAdmin, getSupportsByAdmin, getUsers } from '../controllers/AdminController.js';
import { getSupports, pedirSuporte } from '../controllers/SupportController.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting específico para autenticação
const strictAuthLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 tentativas
    message: { msg: "Muitas tentativas. Tente novamente em 15 minutos." },
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting geral para APIs
const generalLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 60, // 60 requests por minuto
    message: { msg: "Muitas requisições. Tente novamente em 1 minuto." },
});

// Aplicar rate limiting
router.use(generalLimit);

// Rotas de autenticação com rate limiting específico
router.post('/login', strictAuthLimit, login);
router.post('/signup', strictAuthLimit, signup);

router.get('/dashboard', verificarToken, dashboard);
router.post('/create-checkout-session', verificarToken, CreateCheckoutSession);
router.get('/session-status', SessionStatus); // verificar status
router.post('/change-theme', verificarToken, changeTheme)
router.post('/complete-onboarding', verificarToken, completeOnboarding)
router.post('/atualizar-perfil', verificarToken, upload('uploads/image-perfil', 'avatar'), atualizarPerfil)
router.post('/criar-meusTreinos', verificarToken, carregarTreinos);
router.post('/gerar-exercicio-ia', verificarToken, criarExercicioIA);
router.post('/gerar-treino-ia', verificarToken, criarTreinoIA);

router.delete('/excluir-treino', async (req, res) => {
  const { email, treinoId } = req.query;

  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ msg: 'Email inválido' });
  }
  if (!treinoId) return res.status(400).json({ msg: 'ID do treino obrigatório' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado.' });

    const treinoIndex = user.meusTreinos.findIndex(t => t.treinoId === treinoId);
    if (treinoIndex === -1) return res.status(404).json({ msg: 'Treino não encontrado.' });

    user.meusTreinos.splice(treinoIndex, 1); // Remove o treino pelo índice

    // se existir o profissionalId entao atualizar
    try {
      if (req?.query?.profissionalId) {
        if (!isValidObjectId(req.query.profissionalId)) {
          return res.status(400).json({ msg: 'ID do profissional inválido' });
        }
        
        const profissional = await Profissional.findOne({
          $or: [
            { profissionalId: req?.query?.profissionalId },
            { userId: req?.query?.profissionalId }
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
    return res.status(200).json({ msg: 'Treino excluído com sucesso.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Erro interno no servidor.' });
  }
});

router.delete('/excluir-exercicio', async (req, res) => {
  const { email, treinoId, exercicioId } = req.query;

  if (!email || !validator.isEmail(email)) {
    return res.status(400).json({ msg: 'Email inválido' });
  }
  if (!treinoId) return res.status(400).json({ msg: 'ID do treino obrigatório' });
  if (!exercicioId) return res.status(400).json({ msg: 'ID do exercício obrigatório' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado.' });

    const treino = user.meusTreinos.find(t => t.treinoId === treinoId);
    if (!treino) return res.status(404).json({ msg: 'Treino não encontrado.' });

    const exercicioIndex = treino.exercicios.findIndex(ex => ex.exercicioId === exercicioId);
    if (exercicioIndex === -1) return res.status(404).json({ msg: 'Exercício não encontrado.' });

    // Remove o exercício
    treino.exercicios.splice(exercicioIndex, 1);

    // se existir o profissionalId entao atualizar
    try {
      if (req?.query?.profissionalId) {
        if (!isValidObjectId(req.query.profissionalId)) {
          return res.status(400).json({ msg: 'ID do profissional inválido' });
        }
        
        const profissional = await Profissional.findOne({
          $or: [
            { profissionalId: req?.query?.profissionalId },
            { userId: req?.query?.profissionalId }
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

    return res.status(200).json({ msg: 'Exercício excluído com sucesso!' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Erro interno no servidor.' });
  }
});

router.put('/atualizar-meusTreinos', verificarToken, atualizarMeusTreinos)
router.post('/conversar', verificarToken, conversar);
router.post('/publicar-no-historico', verificarToken, publicarNoHistorico);
router.post('/atualizar-plano', verificarToken, atualizarPlano)
router.get('/procurar-exercicio', procurarExercicio);
router.post('/adicionar-exercicio', verificarToken, adicionarExercicio);
router.post('/adicionar-report-exercicio', verificarToken, adicionarReport);
router.get('/profissionais', profissionais);
router.post('/publicar-profissional', verificarToken, upload('uploads/image-profissional', 'image'), publicarProfissional);
router.post('/editar-profissional', verificarToken, upload('uploads/image-profissional', 'image'), editarProfissional);
router.post('/quero-ser-aluno', verificarToken, queroSerAluno);
router.post('/aceitar-aluno', verificarToken, aceitarAluno);
router.post('/remover-aluno', verificarToken, removerAluno);
router.get('/pegar-user', verificarToken, pegarUser);

//chat
router.get('/pegarChats', verificarToken, pegarChats);
router.post('/pegarChat', verificarToken, pegarChat);
router.post('/enviar-mensagem', verificarToken, enviarMensagem);
router.post('/deletar-mensagem', verificarToken, deletarMensagem);
router.post('/adicionar-usuario-chat', verificarToken, adicionarUsuario);
router.post('/remover-usuario-chat', verificarToken, removerUsuario);
router.post('/marcar-mensagens-vistas', verificarToken, marcarMensagensVistas);

// nutri
router.post('/conversar-nutri', verificarToken, conversarNutri);

// local
// salva upload no tmp — só movemos para image-local quando invoice.paid confirmar

/*
      tipo,
      userId,
      description = '',
      paymentMethod = 'card',
      link,
      localName,
      localDescricao,
      country,
      countryCode,
      state,
      city,
    } = req.body || {}; 
     
    alem de passar > image pro upload
*/
router.post('/createPayment', verificarToken, upload('uploads/tmp', 'image'), CriarAssinaturaProLocal);

/* 
localId,
      link,
      localName,
      localDescricao,
      country,
      countryCode,
      state,
      city,
      lat,
      lng,
*/
router.post('/editar-local', verificarToken, upload('uploads/image-local', 'image'), editarLocal);

// =======================
// GET /locais  (getLocais)
// query: userId, country, state, city, localType, q, page, limit, sort, >>> utilize apenas o paramentro userId, para buscar apenas o do propio user
// =======================
router.get('/locais', getLocais);

// apenas passar o localId e o userId
router.post('/deletar-local', verificarToken, deletarLocal);

// anuncios
router.post('/adicionar-saldo', verificarToken, SessionPaymentSaldoDeImpressoes);
router.post('/criar-anuncio', verificarToken, uploadMidiaAnuncio('uploads/midias-anuncio', 'midia'), criarAnuncio);
router.get('/anuncios', getAnuncios); // query profissionalId (opcional). se nao passar, retorna todos os anuncios disponiveis.
router.post('/deletar-anuncio', verificarToken, deletarAnuncio); // corpo => profissionalId e anuncioId.
router.post('/editar-anuncio', verificarToken, uploadMidiaAnuncio('uploads/midias-anuncio', 'midia'), editarAnuncio); // corpo => profissionalId e anuncioId.

// admin
router.post('/usuarios', verificarToken, requireAdmin, getUsers) // body: adminId (obrigatório)
router.post('/anuncios-by-admin', verificarToken, requireAdmin, getAnunciosByAdmin) // body: adminId (obrigatório)
router.post('/alterar-status-anuncio', verificarToken, requireAdmin, alterarStatusAnuncio) // body: adminId, anuncioId, novoStatus (obrigatórios)
router.get('/supports-by-admin', verificarToken, requireAdmin, getSupportsByAdmin) // body: adminId, 
router.post('/alterarVisibilidade-by-admin', verificarToken, requireAdmin, alterarVisibilidadeSuporte) // body: adminId, supportId, boolean
router.post('/adicionarRespostaSuportAdmin', verificarToken, requireAdmin, adicionarRespostaSupport) // body: adminId, supportId, resposta

// support
router.get('/supports', getSupports) // body: adminId, anuncioId, novoStatus (obrigatórios)
router.post('/supports', verificarToken, pedirSuporte) // body: adminId, assunto

export default router;
