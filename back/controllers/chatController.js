import Chat from "../models/Chat.js";
import { v4 as uuidv4 } from 'uuid'
import User from "../models/User.js";

// * pegar todos os chats do usuário (query: ?userId=xxx)
// GET /pegarChats
// * pegar um chat específico; se não existir criar (retorna sempre userIds: [])
// POST /pegarChat
// enviar mensagem para um chat (POST /enviar-mensagem)
// deletar mensagem de um chat (POST /deletar-mensagem)
// se body.userId for enviado, valida que só o autor pode deletar
// adicionarUsuario (POST /adicionar-usuario-chat)
// removerUsuario (POST /remover-usuario-chat)
// se após remoção não sobrar membros, remove o chat completo

// * pegar todos os chats do usuário (query: ?userId=xxx)
// GET /pegarChats
export const pegarChats = async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ msg: '!userId' });

  try {
    const chats = await Chat.find({ 'membros.userId': String(userId) })
      .select('ChatName ChatId ChatDesc criadoEm membros mensagens')
      .sort({ criadoEm: -1 })
      .lean();

    const chatsShort = chats.map(c => ({
      ChatId: c.ChatId,
      ChatName: c.ChatName,
      ChatDesc: c.ChatDesc,
      criadoEm: c.criadoEm,
      membros: c.membros,
      userIds: (c.membros || []).map(m => String(m.userId)),
      lastMessage: c.mensagens && c.mensagens.length ? c.mensagens[c.mensagens.length - 1] : null,
      messagesCount: c.mensagens ? c.mensagens.length : 0
    }));

    return res.status(200).json(chatsShort);
  } catch (error) {
    console.error('pegarChats error:', error);
    return res.status(500).json({ error: 'Erro no servidor ao buscar chats' });
  }
};

// * pegar um chat específico; se não existir criar (retorna sempre userIds: [])
// POST /pegarChat
export const pegarChat = async (req, res) => {
  // espera param: req.params.ChatId  (string do seu model)
  const { ChatId } = req.query || {};
  const {
    userId,
    otherUserId,
    memberIds, // array de userIds para busca exata de grupo
    membros,   // array para criação: [{ userId, username }, ...]
    ChatName,
    ChatDesc,
    creatorId,
    creatorUsername
  } = req.body || {};

  try {
    // 1) Buscar por ChatId (campo do documento)
    if (ChatId) {
      const chat = await Chat.findOne({ ChatId: String(ChatId) }).lean();
      if (!chat) return res.status(404).json({ error: 'Chat não encontrado' });

      const userIds = (chat.membros || []).map(m => String(m.userId));
      return res.status(200).json({ chat, userIds });
    }

    // 2) Buscar por memberIds (array) - procura EXATAMENTE esse conjunto de userIds
    if (Array.isArray(memberIds) && memberIds.length > 0) {
      const uniqueMemberIds = [...new Set(memberIds.map(String))];

      const existing = await Chat.findOne({
        'membros.userId': { $all: uniqueMemberIds },
        $expr: { $eq: [{ $size: '$membros' }, uniqueMemberIds.length] }
      }).lean();

      if (existing) {
        const userIds = (existing.membros || []).map(m => String(m.userId));
        return res.status(200).json({ chat: existing, userIds });
      }

      // se não existir e vierem dados completos para criar, cria o grupo
      if (Array.isArray(membros) && membros.length > 0) {
        const membersToCreate = membros
          .map(m => ({ userId: String(m.userId), username: m.username || 'Usuário' }))
          .filter((v, i, a) => a.findIndex(x => x.userId === v.userId) === i);

        const createdUserIds = membersToCreate.map(m => m.userId);
        const mismatch = uniqueMemberIds.some(id => !createdUserIds.includes(id)) ||
          createdUserIds.length !== uniqueMemberIds.length;

        if (mismatch) {
          return res.status(400).json({
            error: 'Para criar grupo com memberIds, envie também `membros` com os mesmos userIds.'
          });
        }

        const newChat = new Chat({
          ChatName: ChatName || 'Grupo',
          ChatDesc: ChatDesc || 'Chat criado automaticamente',
          membros: membersToCreate
        });
        await newChat.save();
        return res.status(201).json({ chat: newChat, userIds: membersToCreate.map(m => m.userId) });
      }

      // não existe e sem dados para criar
      return res.status(404).json({ error: 'Chat com esses memberIds não encontrado' });
    }

    // 3) Buscar por par userId + otherUserId (1:1) - garante operação atômica com upsert
    if (userId && otherUserId) {
      const uid = String(userId);
      const oid = String(otherUserId);
      const sortedPair = [uid, oid].sort();
      const pairId = sortedPair.join(':');

      // tenta encontrar chat pelo pairId (1:1)
      let chat = await Chat.findOne({ pairId }).lean();
      if (chat) {
        const userIds = (chat.membros || []).map(m => String(m.userId));
        return res.status(200).json({ chat, userIds });
      }

      // não encontrou: criar atomically com findOneAndUpdate/upsert usando pairId
      // resolve usernames (opcional)
      let otherUser = null;
      try { otherUser = await User.findById(oid).select('username').lean(); } catch (e) { otherUser = null; }
      let creatorUser = null;
      try { creatorUser = await User.findById(uid).select('username').lean(); } catch (e) { creatorUser = null; }

      const otherUsernameSafe = (otherUser && otherUser.username) ? otherUser.username : 'Contato';
      const creatorUsernameSafe = (creatorUser && creatorUser.username) ? creatorUser.username : (creatorUsername || 'Usuário');

      const setOnInsert = {
        ChatId: uuidv4(),
        pairId,
        ChatName: ChatName || `${creatorUsernameSafe} & ${otherUsernameSafe}`,
        ChatDesc: ChatDesc || 'Conversa privada',
        criadoEm: typeof getBrazilDate === 'function' ? getBrazilDate() : new Date(),
        membros: [
          { userId: uid, username: creatorUsernameSafe, membroDesde: typeof getBrazilDate === 'function' ? getBrazilDate() : new Date() },
          { userId: oid, username: otherUsernameSafe, membroDesde: typeof getBrazilDate === 'function' ? getBrazilDate() : new Date() }
        ]
      };

      // upsert por pairId (simples — sem $expr)
      const chatCreatedOrFound = await Chat.findOneAndUpdate(
        { pairId },
        { $setOnInsert: setOnInsert },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();

      if (!chatCreatedOrFound) return res.status(500).json({ error: 'Erro criando/obtendo chat 1:1' });

      return res.status(200).json({ chat: chatCreatedOrFound, userIds: (chatCreatedOrFound.membros || []).map(m => String(m.userId)) });
    }


    // 4) Criar chat com ChatName + creatorId (ou com membros)
    if (ChatName && (creatorId || (Array.isArray(membros) && membros.length > 0))) {
      const membersToUse = (Array.isArray(membros) && membros.length > 0)
        ? membros.map(m => ({ userId: String(m.userId), username: m.username || 'Usuário' }))
        : [{ userId: String(creatorId), username: creatorUsername || 'Criador' }];

      const dedup = membersToUse.filter((v, i, a) => a.findIndex(x => x.userId === v.userId) === i);

      const newChat = new Chat({
        ChatName,
        ChatDesc: ChatDesc || '',
        membros: dedup
      });

      await newChat.save();
      return res.status(201).json({ chat: newChat, userIds: newChat.membros.map(m => String(m.userId)) });
    }

    // parâmetros insuficientes
    return res.status(400).json({
      error: 'Parâmetros insuficientes. Envie ChatId (param) OU memberIds (array) OU (userId + otherUserId) OU (ChatName + creatorId / membros).'
    });
  } catch (error) {
    console.error('pegarChat error:', error);
    return res.status(500).json({ error: 'Erro no servidor ao obter/criar chat' });
  }
};

// enviar mensagem (POST /enviar-mensagem)
// body: { ChatId?, userId, conteudo, otherUserId? }
export const enviarMensagem = async (req, res) => {
  const { ChatId, userId, conteudo, otherUserId } = req.body || {};
  if (!userId || !conteudo) return res.status(400).json({ error: 'userId e conteudo são obrigatórios' });

  const mensagemObj = {
    userId: String(userId),
    mensagemId: uuidv4(),
    conteudo: String(conteudo),
    vistos: [String(userId)],
    publicadoEm: typeof getBrazilDate === 'function' ? getBrazilDate() : new Date()
  };

  try {
    // 1) Se ChatId informado: só push
    if (ChatId) {
      const updated = await Chat.findOneAndUpdate(
        { ChatId: String(ChatId) },
        { $push: { mensagens: mensagemObj } },
        { new: true }
      ).lean();
      if (!updated) return res.status(404).json({ error: 'Chat não encontrado' });
      return res.status(201).json({ mensagem: mensagemObj, mensagens: updated.mensagens, chat: updated });
    }

    // 2) Se otherUserId informado: 1:1 por pairId (atômico)
    if (otherUserId) {
      const uid = String(userId);
      const oid = String(otherUserId);
      const pairId = [uid, oid].sort().join(':');

      // resolve usernames (opcional)
      let otherUser = null;
      try { otherUser = await User.findById(oid).select('username').lean(); } catch (e) { otherUser = null; }
      let creatorUser = null;
      try { creatorUser = await User.findById(uid).select('username').lean(); } catch (e) { creatorUser = null; }

      const otherUsernameSafe = (otherUser && otherUser.username) ? otherUser.username : 'Contato';
      const creatorUsernameSafe = (creatorUser && creatorUser.username) ? creatorUser.username : (creatorUsername || 'Usuário');

      // setOnInsert para criar chat caso não exista
      const setOnInsert = {
        ChatId: uuidv4(),
        pairId,
        ChatName: `${creatorUsernameSafe} & ${otherUsernameSafe}`,
        ChatDesc: 'Conversa privada',
        criadoEm: typeof getBrazilDate === 'function' ? getBrazilDate() : new Date(),
        membros: [
          { userId: uid, username: creatorUsernameSafe, membroDesde: typeof getBrazilDate === 'function' ? getBrazilDate() : new Date() },
          { userId: oid, username: otherUsernameSafe, membroDesde: typeof getBrazilDate === 'function' ? getBrazilDate() : new Date() }
        ]
      };

      // operação atômica: upsert + $push
      const updated = await Chat.findOneAndUpdate(
        { pairId },
        { $setOnInsert: setOnInsert, $push: { mensagens: mensagemObj } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();

      return res.status(201).json({ mensagem: mensagemObj, mensagens: updated.mensagens, chat: updated });
    }

    // caso sem ChatId e sem otherUserId
    return res.status(400).json({ error: 'Envie ChatId ou otherUserId' });
  } catch (err) {
    // se falhar por duplicata de índice (raro), podemos tentar recuperar e reenviar a mensagem num segundo passo
    console.error('enviarMensagem error:', err);
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
};

// deletar mensagem de um chat (POST /deletar-mensagem)
// se body.userId for enviado, valida que só o autor pode deletar
export const deletarMensagem = async (req, res) => {
  const { ChatId, mensagemId } = req.query || {};
  const { userId } = req.body || {}; // opcional: autor da requisição

  if (!ChatId) return res.status(400).json({ error: 'ChatId (param) é obrigatório' });
  if (!mensagemId) return res.status(400).json({ error: 'mensagemId (param) é obrigatório' });

  try {
    // busca chat e mensagem
    const chat = await Chat.findOne({ ChatId: String(ChatId) }).select('ChatId mensagens').lean();
    if (!chat) return res.status(404).json({ error: 'Chat não encontrado' });

    const msg = (chat.mensagens || []).find(m => String(m.mensagemId) === String(mensagemId));
    if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });

    // se mandaram userId no body, só permite deletar se for o autor
    if (userId && String(msg.userId) !== String(userId)) {
      return res.status(403).json({ error: 'Apenas o autor da mensagem pode deletá-la' });
    }

    // remove a mensagem
    const updated = await Chat.findOneAndUpdate(
      { ChatId: String(ChatId) },
      { $pull: { mensagens: { mensagemId: String(mensagemId) } } },
      { new: true }
    ).select('ChatId mensagens').lean();

    return res.status(200).json({ msg: 'Mensagem deletada', mensagens: updated ? updated.mensagens : [] });
  } catch (error) {
    console.error('deletarMensagem error:', error);
    return res.status(500).json({ error: 'Erro ao deletar mensagem' });
  }
};

// adicionarUsuario (POST /adicionar-usuario-chat)
export const adicionarUsuario = async (req, res) => {
  const { ChatId } = req.query || {};
  const { userId, username } = req.body || {};

  if (!ChatId) return res.status(400).json({ error: 'ChatId (param) é obrigatório' });
  if (!userId || !username) return res.status(400).json({ error: 'userId e username são obrigatórios' });

  try {
    // busca chat
    const chat = await Chat.findOne({ ChatId: String(ChatId) }).select('ChatId membros').lean();
    if (!chat) return res.status(404).json({ error: 'Chat não encontrado' });

    const exists = (chat.membros || []).some(m => String(m.userId) === String(userId));
    if (exists) {
      return res.status(409).json({ error: 'Usuário já é membro do chat', membros: chat.membros });
    }

    const membroObj = {
      userId: String(userId),
      username: String(username),
      membroDesde: typeof getBrazilDate === 'function' ? getBrazilDate() : new Date()
    };

    const updated = await Chat.findOneAndUpdate(
      { ChatId: String(ChatId) },
      { $push: { membros: membroObj } },
      { new: true, runValidators: true }
    ).select('ChatId membros').lean();

    return res.status(201).json({ msg: 'Usuário adicionado', membros: updated.membros });
  } catch (error) {
    console.error('adicionarUsuario error:', error);
    return res.status(500).json({ error: 'Erro ao adicionar usuário' });
  }
};

// removerUsuario (POST /remover-usuario-chat)
// se após remoção não sobrar membros, remove o chat completo
export const removerUsuario = async (req, res) => {
  const { ChatId, userId: userIdParam } = req.query || {};
  // opcional: enviar no body quem está removendo para checar permissões (não implementado aqui)
  if (!ChatId) return res.status(400).json({ error: 'ChatId (param) é obrigatório' });
  if (!userIdParam) return res.status(400).json({ error: 'userId (param) é obrigatório' });

  try {
    const chat = await Chat.findOne({ ChatId: String(ChatId) }).select('ChatId membros').lean();
    if (!chat) return res.status(404).json({ error: 'Chat não encontrado' });

    const exists = (chat.membros || []).some(m => String(m.userId) === String(userIdParam));
    if (!exists) {
      return res.status(404).json({ error: 'Usuário não é membro deste chat', membros: chat.membros });
    }

    // remove o membro
    const updated = await Chat.findOneAndUpdate(
      { ChatId: String(ChatId) },
      { $pull: { membros: { userId: String(userIdParam) } } },
      { new: true }
    ).select('ChatId membros').lean();

    // se atualizado for nulo (improvável) ou membros vazio -> deletar chat
    const membrosAfter = updated ? (updated.membros || []) : [];
    if (membrosAfter.length === 0) {
      // deleta o chat
      await Chat.deleteOne({ ChatId: String(ChatId) });
      return res.status(200).json({ msg: 'Usuário removido. Chat sem membros, chat deletado.' });
    }

    return res.status(200).json({ msg: 'Usuário removido', membros: membrosAfter });
  } catch (error) {
    console.error('removerUsuario error:', error);
    return res.status(500).json({ error: 'Erro ao remover usuário' });
  }
};

/**
 * Marca VÁRIAS mensagens como vistas por um userId (bulk)
 * body: { ChatId, mensagemIds: [..], userId }
 *
 * Usa arrayFilters para aplicar o $addToSet em cada elemento cujo mensagemId esteja no array.
 */
export const marcarMensagensVistas = async (req, res) => {
  const { ChatId, mensagemIds, userId } = req.body || {};

  if (!ChatId || !Array.isArray(mensagemIds) || mensagemIds.length === 0 || !userId) {
    return res.status(400).json({ error: 'ChatId, mensagemIds (array) e userId são obrigatórios' });
  }

  try {
    // Atualiza todos os elementos do array mensagens cujo mensagemId esteja em mensagemIds
    const updateResult = await Chat.updateOne(
      { ChatId: String(ChatId) },
      { $addToSet: { 'mensagens.$[elem].vistos': String(userId) } },
      {
        arrayFilters: [{ 'elem.mensagemId': { $in: mensagemIds.map(String) } }],
        // new não se aplica a updateOne; iremos buscar o documento atualizado depois
      }
    );

    // buscar chat atualizado (apenas mensagens afetadas)
    const chat = await Chat.findOne({ ChatId: String(ChatId) }).lean();
    if (!chat) return res.status(404).json({ error: 'Chat não encontrado' });

    // extrair mensagens atualizadas e retornar
    const updatedMsgs = (chat.mensagens || []).filter(m => mensagemIds.map(String).includes(String(m.mensagemId)));
    return res.status(200).json({ success: true, updatedCount: updatedMsgs.length, mensagens: updatedMsgs });
  } catch (err) {
    console.error('marcarMensagensVistas error:', err);
    return res.status(500).json({ error: 'Erro no servidor ao marcar mensagens vistas' });
  }
};
