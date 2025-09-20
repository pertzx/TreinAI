// routes/authRoutes.js
import { Router } from 'express';
import { login, dashboard, signup, changeTheme, completeOnboarding, atualizarPerfil, carregarTreinos, atualizarMeusTreinos, pegarUser } from '../controllers/authController.js';
import { verificarToken } from '../middlewares/authMiddleware.js';
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
import { editarLocal } from '../controllers/LocalController.js';
import { getLocais } from '../controllers/LocalController.js';
import { criarAnuncio, editarAnuncio, getAnuncios } from '../controllers/AnunciosController.js';
import { deletarAnuncio } from '../controllers/AnunciosController.js';
import { adicionarRespostaSupport, alterarStatusAnuncio, alterarVisibilidadeSuporte, getAnunciosByAdmin, getSupportsByAdmin, getUsers } from '../controllers/AdminController.js';
import { getSupports, pedirSuporte } from '../controllers/SupportController.js';

const router = Router();

router.post('/login', login);
router.post('/signup', signup);
router.get('/dashboard', verificarToken, dashboard);
router.post('/create-checkout-session', CreateCheckoutSession);
router.get('/session-status', SessionStatus); // verificar status
router.post('/change-theme', changeTheme)
router.post('/complete-onboarding', completeOnboarding)
router.post('/atualizar-perfil', upload('uploads/image-perfil', 'avatar'), atualizarPerfil)
router.post('/criar-meusTreinos', carregarTreinos);
router.post('/gerar-exercicio-ia', criarExercicioIA);
router.post('/gerar-treino-ia', criarTreinoIA);
router.delete('/excluir-treino', async (req, res) => {
  const { email, treinoId } = req.query;

  if (!email) return res.json({ msg: '!email' });
  if (!treinoId) return res.json({ msg: '!treinoId' });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.json({ msg: 'Usuário não encontrado.' });

    const treinoIndex = user.meusTreinos.findIndex(t => t.treinoId === treinoId);
    if (treinoIndex === -1) return res.json({ msg: 'Treino não encontrado.' });

    user.meusTreinos.splice(treinoIndex, 1); // Remove o treino pelo índice

    // se existir o profissionalId entao atualizar
    try {
      if (req?.query?.profissionalId) {
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
    return res.json({ msg: 'Treino excluído com sucesso.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Erro interno no servidor.' });
  }
});
router.delete('/excluir-exercicio', async (req, res) => {
  const { email, treinoId, exercicioId } = req.query;

  if (!email) return res.status(400).json({ msg: '!email' });
  if (!treinoId) return res.status(400).json({ msg: '!treinoId' });
  if (!exercicioId) return res.status(400).json({ msg: '!exercicioId' });

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

    return res.json({ msg: 'Exercício excluído com sucesso!', user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ msg: 'Erro interno no servidor.' });
  }
});
router.put('/atualizar-meusTreinos', atualizarMeusTreinos)
router.post('/conversar', conversar);
router.post('/publicar-no-historico', publicarNoHistorico);
router.post('/atualizar-plano', atualizarPlano)
router.get('/procurar-exercicio', procurarExercicio);
router.post('/adicionar-exercicio', adicionarExercicio);
router.post('/adicionar-report-exercicio', adicionarReport);
router.get('/profissionais', profissionais);
router.post('/publicar-profissional', upload('uploads/image-profissional', 'image'), publicarProfissional);
router.post('/editar-profissional', upload('uploads/image-profissional', 'image'), editarProfissional);
router.post('/quero-ser-aluno', queroSerAluno);
router.post('/aceitar-aluno', aceitarAluno);
router.post('/remover-aluno', removerAluno);
router.get('/pegar-user', pegarUser);

//chat
router.get('/pegarChats', pegarChats);
router.post('/pegarChat', pegarChat);
router.post('/enviar-mensagem', enviarMensagem);
router.post('/deletar-mensagem', deletarMensagem);
router.post('/adicionar-usuario-chat', adicionarUsuario);
router.post('/remover-usuario-chat', removerUsuario);
router.post('/marcar-mensagens-vistas', marcarMensagensVistas);

// nutri
router.post('/conversar-nutri', conversarNutri);

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
router.post('/createPayment', upload('uploads/tmp', 'image'), CriarAssinaturaProLocal);

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
router.post('/editar-local', upload('uploads/image-local', 'image'), editarLocal);

// =======================
// GET /locais  (getLocais)
// query: userId, country, state, city, localType, q, page, limit, sort, >>> utilize apenas o paramentro userId, para buscar apenas o do propio user
// =======================
router.get('/locais', getLocais);

// apenas passar o localId e o userId
router.post('/deletar-local', deletarLocal);

// anuncios
router.post('/adicionar-saldo', SessionPaymentSaldoDeImpressoes);
router.post('/criar-anuncio', uploadMidiaAnuncio('uploads/midias-anuncio', 'midia'), criarAnuncio);
router.get('/anuncios', getAnuncios); // query profissionalId (opcional). se nao passar, retorna todos os anuncios disponiveis.
router.post('/deletar-anuncio', deletarAnuncio); // corpo => profissionalId e anuncioId.
router.post('/editar-anuncio', uploadMidiaAnuncio('uploads/midias-anuncio', 'midia'), editarAnuncio); // corpo => profissionalId e anuncioId.

// admin
router.post('/usuarios', getUsers) // body: adminId (obrigatório)
router.post('/anuncios-by-admin', getAnunciosByAdmin) // body: adminId (obrigatório)
router.post('/alterar-status-anuncio', alterarStatusAnuncio) // body: adminId, anuncioId, novoStatus (obrigatórios)
router.get('/supports-by-admin', getSupportsByAdmin) // body: adminId, 
router.post('/alterarVisibilidade-by-admin', alterarVisibilidadeSuporte) // body: adminId, supportId, boolean
router.post('/adicionarRespostaSuportAdmin', adicionarRespostaSupport) // body: adminId, supportId, resposta

// support
router.get('/supports', getSupports) // body: adminId, anuncioId, novoStatus (obrigatórios)
router.post('/supports', pedirSuporte) // body: adminId, assunto

export default router;
