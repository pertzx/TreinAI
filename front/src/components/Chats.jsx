import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import api from '../Api.js'; // ajuste o caminho se necessário

/**
 * Chats.jsx (corrigido)
 * - seleciona chat automaticamente pelo parâmetro de URL `cId` (query) ou `cId` (route param)
 * - normaliza ChatId/_id comparações
 * - melhor limpeza de polling
 * - marca mensagens vistas em lote quando carrega o chat
 *
 * Props:
 *  - user: objeto do usuário (espera user._id | user.userId | user.id e user.username)
 *  - tema: 'dark' | 'light'
 */

const Chats = ({ user, tema }) => {
  const userId = user?.userId || user?._id || user?.id || null;
  const username = user?.username || user?.name || 'Você';

  // pegar cId tanto como route param quanto query param
  const params = useParams();
  const location = useLocation();
  const routeCid = params?.cId || null;
  const queryCid = (() => {
    try {
      const sp = new URLSearchParams(location.search);
      return sp.get('cId') || null;
    } catch (e) {
      return null;
    }
  })();
  const initialCid = routeCid || queryCid || null;

  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);

  const [addUserId, setAddUserId] = useState('');
  const [addUsername, setAddUsername] = useState('');
  const [removeUserId, setRemoveUserId] = useState('');

  const chatsIntervalRef = useRef(null);
  const messagesIntervalRef = useRef(null);
  const bottomRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // refs to store last known data for comparisons (avoid rerenders)
  const lastChatsRef = useRef(null);
  const lastMessagesRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const hasLoadedMessagesOnceRef = useRef(false);
  const pendingCidRef = useRef(initialCid); // se cId chegar antes dos chats

  const isDark = tema === 'dark';
  const containerClass = isDark ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900';
  const panelClass = isDark ? 'bg-gray-800' : 'bg-gray-50';
  const messageMineClass = isDark ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-gray-900';
  const messageOtherClass = isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900';

  // ---------- small helpers ----------
  const getChatId = (c) => String(c?.ChatId ?? c?._id ?? '');

  // ---------- helpers to compare lightweight summaries ----------
  const areChatsEqual = (a = [], b = []) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const A = a[i];
      const B = b[i];
      const idA = getChatId(A);
      const idB = getChatId(B);
      if (idA !== idB) return false;

      const countA = A.messagesCount ?? (A.mensagens && A.mensagens.length) ?? (A.lastMessage ? 1 : 0);
      const countB = B.messagesCount ?? (B.mensagens && B.mensagens.length) ?? (B.lastMessage ? 1 : 0);
      if (Number(countA) !== Number(countB)) return false;

      const lastA = A.lastMessage ? String(A.lastMessage.mensagemId ?? A.lastMessage._id ?? A.lastMessage.publicadoEm ?? '') : '';
      const lastB = B.lastMessage ? String(B.lastMessage.mensagemId ?? B.lastMessage._id ?? B.lastMessage.publicadoEm ?? '') : '';
      if (lastA !== lastB) return false;
    }
    return true;
  };

  // normalize messages and include `vistos` array
  const normalizeMessages = (arr = []) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(m => ({
      mensagemId: m.mensagemId ?? m._id ?? String(m.id ?? ''),
      userId: String(m.userId ?? m.from ?? ''),
      conteudo: m.conteudo ?? m.text ?? m.mensagem ?? '',
      publicadoEm: m.publicadoEm ?? m.createdAt ?? m.publicadoEm ?? null,
      vistos: Array.isArray(m.vistos) ? m.vistos.map(String) : []
    }));
  };

  const areMessagesEqual = (a = [], b = []) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const A = a[i];
      const B = b[i];
      if (String(A.mensagemId) !== String(B.mensagemId)) return false;
      if ((A.publicadoEm || '') !== (B.publicadoEm || '')) return false;
    }
    return true;
  };

  // ---------- scroll detection ----------
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const onScroll = () => {
      const threshold = 80; // px from bottom to still be considered "at bottom"
      const scrollBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
      isAtBottomRef.current = scrollBottom <= threshold;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // ---------- API calls ----------
  const fetchChats = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadingChats(prev => (prev ? prev : true));
      setError(null);
      const res = await api.get('/pegarChats', { params: { userId } });
      const raw = Array.isArray(res.data) ? res.data : [];

      // annotate hasUnread based on lastMessage.vistos (if available)
      const annotated = raw.map(c => {
        const last = c.lastMessage || (Array.isArray(c.mensagens) ? c.mensagens[c.mensagens.length - 1] : null);
        const lastVistos = Array.isArray(last?.vistos) ? last.vistos.map(String) : [];
        const lastUserId = last?.userId ?? last?.from ?? null;
        const hasUnread = !!last && !lastVistos.includes(String(userId)) && String(lastUserId) !== String(userId);
        return { ...c, hasUnread };
      });

      // compare with lastChatsRef by lightweight criteria
      if (lastChatsRef.current && areChatsEqual(lastChatsRef.current, annotated)) {
        return;
      }

      lastChatsRef.current = annotated;
      setChats(annotated);

      // if there's a pending cId (from URL) and selectedChat not set yet -> select
      if (pendingCidRef.current && !selectedChat) {
        const foundByCid = annotated.find(c => getChatId(c) === String(pendingCidRef.current));
        if (foundByCid) {
          setSelectedChat(foundByCid);
          pendingCidRef.current = null;
        }
      }

      // keep selectedChat reference if exists (update only if metadata changed)
      if (selectedChat) {
        const found = annotated.find(c => getChatId(c) === getChatId(selectedChat));
        if (!found) {
          setSelectedChat(null);
          setMessages([]);
          lastMessagesRef.current = null;
          hasLoadedMessagesOnceRef.current = false;
        } else {
          const lastSel = selectedChat;
          const changed =
            (String(found.ChatDesc ?? '') !== String(lastSel.ChatDesc ?? '')) ||
            Number(found.messagesCount ?? 0) !== Number(lastSel.messagesCount ?? 0) ||
            String(found.lastMessage?.mensagemId ?? found.lastMessage?._id ?? '') !== String(lastSel.lastMessage?.mensagemId ?? lastSel.lastMessage?._id ?? '');
          if (changed) setSelectedChat(found);
        }
      }

    } catch (err) {
      console.error('fetchChats error:', err);
      setError(prev => prev || 'Erro ao carregar conversas.');
    } finally {
      setLoadingChats(false);
    }
  }, [userId, selectedChat]);

  // guess other user id (1:1)
  const guessOtherUserId = (chat) => {
    try {
      const ids = chat?.userIds || (chat?.membros || []).map(m => m.userId) || [];
      const unique = ids.map(String).filter(Boolean);
      if (!unique.length) return null;
      if (!userId) return unique[0];
      const other = unique.find(id => String(id) !== String(userId));
      return other || unique[0];
    } catch (err) {
      return null;
    }
  };

  // fetchChatMessages: normaliza, compara e marca vistas em lote
  const fetchChatMessages = useCallback(async (chat) => {
    if (!chat) return;
    try {
      if (!hasLoadedMessagesOnceRef.current) setLoadingMessages(true);
      setError(null);

      const ChatId = chat.ChatId || chat._id || null;
      let res;
      if (ChatId) {
        res = await api.post('/pegarChat', {}, { params: { ChatId } });
      } else {
        const otherUserId = guessOtherUserId(chat);
        res = await api.post('/pegarChat', { userId, otherUserId, creatorUsername: username });
      }

      const chatData = res?.data?.chat || res?.data;
      const msgsRaw = Array.isArray(chatData?.mensagens) ? chatData.mensagens : (chatData?.messages || []);
      const normalized = normalizeMessages(msgsRaw);

      // compare to lastMessagesRef
      if (lastMessagesRef.current && areMessagesEqual(lastMessagesRef.current, normalized)) {
        hasLoadedMessagesOnceRef.current = true;
        setLoadingMessages(false);
        return;
      }

      // messages changed -> update
      lastMessagesRef.current = normalized;
      setMessages(normalized);
      hasLoadedMessagesOnceRef.current = true;

      // marcar mensagens não-vistas em lote (apenas as que não são suas e não contém userId em vistos)
      const unseen = normalized.filter(m => String(m.userId) !== String(userId) && !(Array.isArray(m.vistos) && m.vistos.map(String).includes(String(userId))));
      if (unseen.length > 0 && ChatId) {
        const mensagemIds = unseen.map(m => m.mensagemId);
        try {
          await api.post('/marcar-mensagens-vistas', { ChatId, mensagemIds, userId });

          // atualizar localmente as mensagens marcadas
          setMessages(prev => (prev || []).map(m => mensagemIds.includes(m.mensagemId) ? { ...m, vistos: Array.from(new Set([...(m.vistos || []).map(String), String(userId)])) } : m));

          // atualizar chats: recompute hasUnread for that chat
          setChats(prev => (Array.isArray(prev) ? prev.map(c => {
            if (getChatId(c) !== String(ChatId)) return c;
            const last = c.lastMessage || (Array.isArray(c.mensagens) ? c.mensagens[c.mensagens.length - 1] : null);
            if (!last) return { ...c, hasUnread: false };
            const lv = (last.vistos || []).map(String);
            return { ...c, hasUnread: !lv.includes(String(userId)) };
          }) : prev));

        } catch (err) {
          console.warn('Falha ao marcar mensagens vistas em lote:', err);
          // se falhar, ok — UI permanece responsiva, tentaremos novamente no próximo polling
        }
      }

      // auto-scroll se usuário estiver perto do bottom
      setTimeout(() => {
        if (isAtBottomRef.current) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 80);

    } catch (err) {
      console.error('fetchChatMessages error:', err);
      setError(prev => prev || 'Erro ao carregar mensagens.');
    } finally {
      setLoadingMessages(false);
    }
  }, [userId, username]);

  // enviar mensagem
  const sendMessage = async () => {
    if (!selectedChat || !newMessage.trim() || !userId) return;
    const ChatId = selectedChat.ChatId || selectedChat._id;
    if (!ChatId) {
      console.warn('Chat selecionado não tem ChatId. Não foi possível enviar.');
      return;
    }

    try {
      await api.post('/enviar-mensagem', { ChatId, userId, conteudo: newMessage.trim() });
      setNewMessage('');
      await fetchChatMessages(selectedChat);
      await fetchChats();
    } catch (err) {
      console.error('sendMessage error:', err);
      setError('Erro ao enviar mensagem.');
    }
  };

  // deletar mensagem
  const deleteMessage = async (mensagemId) => {
    if (!selectedChat || !mensagemId) return;
    const ChatId = selectedChat.ChatId || selectedChat._id;
    if (!ChatId) return;
    try {
      await api.post('/deletar-mensagem', { userId }, { params: { ChatId, mensagemId } });
      await fetchChatMessages(selectedChat);
      await fetchChats();
    } catch (err) {
      console.error('deleteMessage error:', err);
      setError('Erro ao deletar mensagem.');
    }
  };

  // adicionar usuario
  const addUser = async () => {
    if (!selectedChat || !addUserId || !addUsername) return;
    const ChatId = selectedChat.ChatId || selectedChat._id;
    if (!ChatId) return;
    try {
      await api.post('/adicionar-usuario-chat', { userId: addUserId, username: addUsername }, { params: { ChatId } });
      setAddUserId(''); setAddUsername('');
      await fetchChatMessages(selectedChat);
      await fetchChats();
    } catch (err) {
      console.error('addUser error:', err);
      setError('Erro ao adicionar usuário ao chat.');
    }
  };

  // remover usuario
  const removeUser = async () => {
    if (!selectedChat || !removeUserId) return;
    const ChatId = selectedChat.ChatId || selectedChat._id;
    if (!ChatId) return;
    try {
      await api.post('/remover-usuario-chat', {}, { params: { ChatId, userId: removeUserId } });
      setRemoveUserId('');
      await fetchChats();
      const refreshed = await api.post('/pegarChat', {}, { params: { ChatId } }).catch(() => null);
      if (refreshed && (refreshed.data?.chat || refreshed.data)) {
        await fetchChatMessages(selectedChat);
      } else {
        setSelectedChat(null);
        setMessages([]);
        lastMessagesRef.current = null;
        hasLoadedMessagesOnceRef.current = false;
      }
    } catch (err) {
      console.error('removeUser error:', err);
      setError('Erro ao remover usuário do chat.');
    }
  };

  // ---------- effects / polling ----------
  useEffect(() => {
    // start polling when userId available
    if (!userId) return;

    // inicial fetch + polling
    fetchChats();
    if (chatsIntervalRef.current) clearInterval(chatsIntervalRef.current);
    chatsIntervalRef.current = setInterval(() => fetchChats(), 5000);

    return () => {
      if (chatsIntervalRef.current) clearInterval(chatsIntervalRef.current);
      chatsIntervalRef.current = null;
    };
  }, [userId, fetchChats]);

  useEffect(() => {
    // when selectedChat changes, start/stop messages polling
    if (!selectedChat) {
      setMessages([]);
      lastMessagesRef.current = null;
      hasLoadedMessagesOnceRef.current = false;
      if (messagesIntervalRef.current) {
        clearInterval(messagesIntervalRef.current);
        messagesIntervalRef.current = null;
      }
      return;
    }

    // optimistic clear unread marker in UI
    setChats(prev => (Array.isArray(prev) ? prev.map(c => (getChatId(c) === getChatId(selectedChat) ? { ...c, hasUnread: false } : c)) : prev));

    // fetch messages immediately
    fetchChatMessages(selectedChat);

    if (messagesIntervalRef.current) clearInterval(messagesIntervalRef.current);
    messagesIntervalRef.current = setInterval(() => fetchChatMessages(selectedChat), 2500);

    return () => {
      if (messagesIntervalRef.current) clearInterval(messagesIntervalRef.current);
      messagesIntervalRef.current = null;
    };
  }, [selectedChat, fetchChatMessages]);

  // if chats change and there's an initial cId that hasn't been handled, attempt to select it
  useEffect(() => {
    if (!pendingCidRef.current || !chats.length) return;
    const found = chats.find(c => getChatId(c) === String(pendingCidRef.current));
    if (found) {
      setSelectedChat(found);
      pendingCidRef.current = null;
    }
  }, [chats]);

  // helper to format date
  const fmt = (iso) => iso ? new Date(iso).toLocaleString('pt-BR') : '';

  // ---------- render ----------
  return (
    <div className={`min-h-[60vh] p-3 rounded-lg shadow-md ${containerClass}`}>
      <div className="max-w-7xl mx-auto md:grid md:grid-cols-3 gap-4">
        {/* lista de chats */}
        <div className={`md:col-span-1 p-2 rounded ${panelClass}`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Conversas</h3>
            <button onClick={fetchChats} className="text-sm px-2 py-1 border rounded">Atualizar</button>
          </div>

          <div className="overflow-auto h-[48vh] md:h-[70vh] divide-y">
            {loadingChats && <div className="p-2 text-sm"></div>}
            {!loadingChats && chats.length === 0 && <div className="p-2 text-sm text-gray-400">Nenhuma conversa</div>}

            {chats.map(chat => {
              const key = getChatId(chat) || `${chat.ChatName}-${JSON.stringify(chat.userIds || chat.membros || [])}`;
              // estilo especial quando há mensagens não-vistas para o usuário
              const unreadClass = chat.hasUnread ? 'border-l-4 border-rose-500 bg-rose-50/10' : '';
              const boldTitle = chat.hasUnread ? 'font-semibold' : 'font-medium';
              const isSelected = selectedChat && getChatId(selectedChat) === getChatId(chat);
              return (
                <div
                  key={key}
                  onClick={() => setSelectedChat(chat)}
                  className={`m-2 p-3 cursor-pointer hover:bg-gray-200/30 rounded ${isSelected ? 'ring-2 ring-indigo-400' : ''} ${unreadClass}`}
                >
                  <div className="flex justify-between items-center">
                    <div className={`${boldTitle}`}>{chat.ChatName}</div>
                    <div className="text-xs text-gray-400">{chat.messagesCount ?? (chat.mensagens && chat.mensagens.length) ?? 0}</div>
                  </div>
                  <div className="text-xs text-gray-500">{chat.ChatDesc}</div>
                  <div className="text-xs text-gray-400 mt-1 truncate">{chat.lastMessage ? chat.lastMessage.conteudo?.slice(0, 60) : 'Sem mensagens'}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* janela de chat */}
        <div className="md:col-span-2 flex flex-col">
          <div className={`p-3 border-b ${panelClass} flex items-center justify-between`}>
            <div>
              <div className="font-semibold">{selectedChat ? selectedChat.ChatName : 'Selecione uma conversa'}</div>
              <div className="text-xs text-gray-400">{selectedChat ? selectedChat.ChatDesc : 'Mensagens aparecerão aqui'}</div>
            </div>
            <div className="text-xs text-gray-400">{selectedChat ? `Membros: ${selectedChat.userIds?.length || selectedChat.membros?.length || 0}` : ''}</div>
          </div>

          <div ref={messagesContainerRef} className="flex-1 overflow-auto p-4 h-[48vh] md:h-[70vh]">
            {selectedChat ? (
              <div className="space-y-3">
                {loadingMessages && !hasLoadedMessagesOnceRef.current && <div className="text-sm text-gray-400"></div>}
                {!loadingMessages && messages.length === 0 && <div className="text-sm text-gray-400">Nenhuma mensagem ainda</div>}

                {messages.map((m, idx) => {
                  const key = m.mensagemId || m._id || idx;
                  const mine = String(m.userId) === String(userId);
                  const seenByMe = Array.isArray(m.vistos) && m.vistos.map(String).includes(String(userId));
                  const seenCount = Array.isArray(m.vistos) ? m.vistos.length : 0;

                  return (
                    <div key={key} className={`max-w-[80%] p-3 rounded-2xl ${mine ? 'ml-auto' : ''} ${mine ? messageMineClass : messageOtherClass}`}>
                      <div className="text-sm whitespace-pre-wrap">{m.conteudo}</div>
                      <div className="flex items-center justify-between mt-1 text-xs opacity-80">
                        <div>{mine ? username : m.userId} • {fmt(m.publicadoEm)}</div>
                        <div className="flex items-center gap-2">
                          {mine ? (
                            // mostrar visto/contador quando for minha mensagem
                            <div className="text-[11px] text-gray-400">{seenByMe ? '✓ visto' : '⏺ não visto'}{seenByMe ? ` • ${seenCount}` : ''}</div>
                          ) : (
                            // para mensagens de outros, indicar se eu já vi
                            <div className="text-[11px] text-gray-400">{seenByMe ? '✓ visto' : ''}</div>
                          )}

                          {mine && (
                            <button onClick={() => deleteMessage(m.mensagemId)} className="text-xs px-2 py-0.5 rounded border">Apagar</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div ref={bottomRef} />
              </div>
            ) : (
              <div className="text-center text-gray-400 p-8">Selecione uma conversa</div>
            )}
          </div>

          {selectedChat && (
            <div className={`p-3 border-t ${panelClass} space-y-2`}>
              <div className="flex gap-2 items-center">
                <input placeholder="userId para adicionar" value={addUserId} onChange={e => setAddUserId(e.target.value)} className="px-2 py-1 rounded border w-1/4" />
                <input placeholder="username" value={addUsername} onChange={e => setAddUsername(e.target.value)} className="px-2 py-1 rounded border w-1/4" />
                <button onClick={addUser} className="px-3 py-1 rounded bg-green-600 text-white">Adicionar</button>

                <input placeholder="userId para remover" value={removeUserId} onChange={e => setRemoveUserId(e.target.value)} className="px-2 py-1 rounded border w-1/4 ml-4" />
                <button onClick={removeUser} className="px-3 py-1 rounded bg-red-600 text-white">Remover</button>
              </div>
            </div>
          )}

          <div className={`p-3 border-t ${panelClass}`}>
            <div className="flex gap-2">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendMessage(); }}
                className="flex-1 px-3 py-2 rounded-lg border focus:outline-none"
                placeholder={selectedChat ? 'Escreva uma mensagem...' : 'Selecione um chat'}
                disabled={!selectedChat}
              />
              <button onClick={sendMessage} disabled={!selectedChat || !newMessage.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50">Enviar</button>
            </div>
            {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chats;
