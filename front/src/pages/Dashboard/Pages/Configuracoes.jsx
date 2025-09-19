import React, { useEffect, useState } from 'react';
import api from '../../../Api';
import { getBrazilDate } from '../../../../helpers/getBrazilDate.js';

/**
 * Configuracoes - usa `tema` com valores 'dark' | 'light'
 * Props:
 *  - setTema(tema)  // função para atualizar tema no nível superior
 *  - tema           // 'dark' ou 'light'
 *  - user           // user object do backend
 */

const Switch = ({ checked, onChange, label, tema }) => (
  <button
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`relative inline-flex items-center h-10 w-20 rounded-full p-1 transition-all focus:outline-none ${checked ? (tema === 'dark' ? 'bg-blue-600' : 'bg-blue-600') : (tema === 'dark' ? 'bg-gray-600' : 'bg-gray-200')
      }`}
  >
    <span
      className={`inline-block w-8 h-8 rounded-full bg-white transform transition-transform ${checked ? 'translate-x-10' : 'translate-x-0'
        }`}
    />
    <span className="sr-only">{label}</span>
  </button>
);

const Configuracoes = ({ setTema, tema, user }) => {
  const [lang, setLang] = useState('pt');
  const [notificacoes, setNotificacoes] = useState(true);

  const [saving, setSaving] = useState({ theme: false, lang: false, notifications: false });
  const [planLoading, setPlanLoading] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  const [currentPlan, setCurrentPlan] = useState(user?.planInfos?.planType || 'free');
  const [planInfos, setPlanInfos] = useState(user?.planInfos || {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [changeError, setChangeError] = useState(null); // mensagem de erro ao tentar trocar para mesmo valor/tipo

  const priceMapForDisplay = {
    free: { label: 'Free', price: 0 },
    pro: { label: 'Pro', price: 15 },
    max: { label: 'Max', price: 40 },
    coach: { label: 'Coach', price: 70 },
  };

  useEffect(() => {
    // Sincroniza tema -> se user tiver preferência usa ela
    if (user?.preferences?.theme === 'dark' || user?.preferences?.theme === 'light') {
      setTema(user.preferences.theme);
    } else {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'dark' || savedTheme === 'light') setTema(savedTheme);
    }

    if (user?.preferences?.language) {
      setLang(user.preferences.language);
      localStorage.setItem('lang', user.preferences.language);
    } else {
      const savedLang = localStorage.getItem('lang');
      if (savedLang) setLang(savedLang);
    }

    if (typeof user?.preferences?.notifications === 'boolean') {
      setNotificacoes(Boolean(user.preferences.notifications));
      localStorage.setItem('notifications', String(user.preferences.notifications));
    } else {
      const savedNotifications = localStorage.getItem('notifications');
      if (savedNotifications !== null) setNotificacoes(savedNotifications === 'true');
    }

    if (user?.planInfos) {
      setCurrentPlan(user.planInfos.planType);
      setPlanInfos(user.planInfos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const applyPlanResponse = (resData, novoPlano) => {
    if (!resData) return;
    if (resData.subscription || resData.planInfos) {
      const subs = resData.subscription || resData.planInfos;
      const nextPaymentValue = subs?.nextPaymentValue ?? (priceMapForDisplay[novoPlano]?.price ?? null);
      const nextPaymentDate = subs?.nextPaymentDate ?? subs?.expirationDate ?? null;
      const subscriptionId = subs?.id ?? subs?.subscriptionId ?? null;
      const status = subs?.status ?? (novoPlano === 'free' ? 'inativo' : 'ativo');

      setPlanInfos((prev) => ({
        ...prev,
        planType: novoPlano,
        status,
        subscriptionId,
        nextPaymentValue,
        nextPaymentDate,
      }));
      setCurrentPlan(novoPlano);
      return;
    }

    setPlanInfos((prev) => ({
      ...prev,
      planType: novoPlano,
      status: novoPlano === 'free' ? 'inativo' : 'ativo',
      subscriptionId: prev.subscriptionId || null,
      nextPaymentValue: priceMapForDisplay[novoPlano].price,
      nextPaymentDate: novoPlano === 'free' ? null : new Date(getBrazilDate() + 30 * 24 * 3600 * 1000).toISOString(),
    }));
    setCurrentPlan(novoPlano);
  };

  // ======== REQUISIÇÕES REAIS ========
  const toggleTema = async () => {
    const novoTema = tema === 'dark' ? 'light' : 'dark';
    setTema(novoTema);
    localStorage.setItem('theme', novoTema);

    setSaving((prev) => ({ ...prev, theme: true }));
    setGlobalLoading(true);
    try {
      await api.post('/change-theme', { email: user.email, novoTema });
    } catch (err) {
      console.error('Erro ao salvar tema no servidor:', err);
    } finally {
      setSaving((prev) => ({ ...prev, theme: false }));
      setGlobalLoading(false);
    }
  };

  const toggleLang = async () => {
    const newLang = lang === 'pt' ? 'en' : 'pt';
    setLang(newLang);
    localStorage.setItem('lang', newLang);

    setSaving((prev) => ({ ...prev, lang: true }));
    setGlobalLoading(true);
    try {
      await api.post('/change-language', { email: user.email, language: newLang });
    } catch (err) {
      console.error('Erro ao salvar idioma no servidor:', err);
    } finally {
      setSaving((prev) => ({ ...prev, lang: false }));
      setGlobalLoading(false);
    }
  };

  const toggleNotificacoes = async () => {
    const newVal = !notificacoes;
    setNotificacoes(newVal);
    localStorage.setItem('notifications', String(newVal));

    setSaving((prev) => ({ ...prev, notifications: true }));
    setGlobalLoading(true);
    try {
      await api.post('/change-notifications', { email: user.email, notifications: newVal });
    } catch (err) {
      console.error('Erro ao salvar notificações no servidor:', err);
    } finally {
      setSaving((prev) => ({ ...prev, notifications: false }));
      setGlobalLoading(false);
    }
  };

  // NOVA LÓGICA: bloquear solicitações para mesmo tipo OU mesmo valor
  const askChangePlan = (novoPlano) => {
    const novoPreco = priceMapForDisplay[novoPlano]?.price ?? null;
    const precoAtual = priceMapForDisplay[currentPlan]?.price ?? null;

    if (novoPlano === currentPlan) {
      setChangeError('Você já está neste plano. Escolha outro plano diferente.');
      clearErrorAfter();
      return;
    }

    // bloqueia quando o preço é igual (mesmo valor)
    if (novoPreco !== null && precoAtual !== null && novoPreco === precoAtual) {
      setChangeError('O plano selecionado tem o mesmo valor do seu plano atual — alteração não permitida.');
      clearErrorAfter();
      return;
    }

    // tudo ok — abre modal de confirmação
    setPendingPlan(novoPlano);
    setConfirmText('');
    // setPassword('');
    setConfirmOpen(true);
  };

  const clearErrorAfter = (ms = 4000) => {
    setTimeout(() => setChangeError(null), ms);
  };

  const confirmChangePlan = async () => {
    if (!pendingPlan) return;
    if (confirmText.trim().toLowerCase() !== pendingPlan.toLowerCase()) {
      return;
    }

    if (!password) {
      return;
    }

    setPlanLoading(true);
    setGlobalLoading(true);

    try {
      const payload = { userId: user?._id, plan: pendingPlan, password, email: user?.email };
      const res = await api.post('/atualizar-plano', payload);

      // aplicar resposta no frontend
      applyPlanResponse(res?.data, pendingPlan);

      if (res?.data?.url) window.location.href = res?.data?.url;
      if (res?.data?.msg) console.log('Resposta do backend:', res.data.msg);
    } catch (err) {
      console.error('Erro ao tentar alterar plano:', err);
    } finally {
      setPlanLoading(false);
      setGlobalLoading(false);
      setConfirmOpen(false);
      setPendingPlan(null);
      setConfirmText('');
      setPassword('');
      // opcional: recarregar para garantir dados sincronizados com webhook
      // window.location.reload();
    }
  };

  const closeModal = () => {
    if (planLoading) return;
    setConfirmOpen(false);
    setPendingPlan(null);
    setConfirmText('');
    setPassword('');
  };

  const trocaExplicacao = (novoPlano) => {
    if (novoPlano === 'free') {
      return (
        <div>
          <p>Ao escolher <strong>Free</strong>, sua assinatura será cancelada (se houver).</p>
          <p>O acesso pago será removido e seu plano ficará como <strong>FREE</strong>.</p>
          <p>O timing final depende do fluxo Stripe/backend.</p>
        </div>
      );
    }

    return (
      <div>
        <p>Ao trocar para <strong>{novoPlano}</strong> vamos solicitar ao backend a mudança da assinatura no Stripe. Nessa operação:</p>

        <ul>
          <li>
            O Stripe pode aplicar ajuste proporcional (proration):<br />
            <code>(Preço do novo plano – Saldo do plano atual) + Preço do novo plano</code><br />
            Esse valor aparece na próxima fatura e pode fazer o valor parecer maior temporariamente.
          </li>
          <li>
            <strong>Por que isso acontece:</strong> o Stripe precisa ajustar o que você já pagou do plano antigo e o que vai usar do novo plano.
            O crédito do plano antigo (não usado) é subtraído, e o débito do novo plano (parte do mês que você vai usar) é somado.<br />
            Por isso, no mês da troca, o valor pode ser maior, mas <strong>nos meses seguintes você paga apenas o preço normal do novo plano</strong>.
          </li>
          <li>A alteração pode ser aplicada imediatamente ou ao fim do ciclo, dependendo da configuração do Stripe.</li>
          <li>Seu perfil será atualizado com os novos valores assim que a mudança for confirmada.</li>
        </ul>
      </div>
    );
  };



  // Estilos condicionais baseados em tema ('dark' | 'light')
  const containerClass = tema === 'dark' ? 'bg-gray-900 text-white' : 'bg-white text-black';
  const cardClass = tema === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const subtleBg = tema === 'dark' ? 'bg-gray-700' : 'bg-gray-50';

  return (
    <div className={`flex w-full items-center mt-5 gap-4 flex-col p-4 ${containerClass}`}>
      {globalLoading && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="bg-white/95 dark:bg-gray-900 p-6 rounded-2xl flex items-center gap-3">
            <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin border-blue-600" />
            <div>Carregando...</div>
          </div>
        </div>
      )}

      {/* Banner de erro temporário ao tentar trocar para mesmo plano/valor */}
      {changeError && (
        <div className="w-full max-w-2xl p-3 rounded-lg border border-red-400 bg-red-50 text-red-700">
          {changeError}
        </div>
      )}

      {/* Tema */}
      <div className={`flex items-center justify-between w-full max-w-2xl p-4 rounded-2xl border ${cardClass}`}>
        <div>
          <div className="text-sm font-medium">Tema</div>
          <div className="text-xs ">Altera entre tema claro e escuro</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs">{tema === 'dark' ? 'Dark' : 'Light'}</span>
          <Switch checked={tema === 'dark'} onChange={toggleTema} label="Alternar tema" tema={tema} />
        </div>
      </div>

      {/* Idioma */}
      <div className={`flex items-center justify-between w-full max-w-2xl p-4 rounded-2xl border ${cardClass}`}>
        <div>
          <div className="text-sm font-medium">Idioma</div>
          <div className="text-xs ">Escolha entre Português (pt) e Inglês (en)</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase">{lang}</span>
          <Switch checked={lang === 'en'} onChange={toggleLang} label="Alternar idioma" tema={tema} />
        </div>
      </div>

      {/* Notificações */}
      <div className={`flex items-center justify-between w-full max-w-2xl p-4 rounded-2xl border ${cardClass}`}>
        <div>
          <div className="text-sm font-medium">Notificações</div>
          <div className="text-xs ">Receber notificações sobre treinos e ofertas</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs">{notificacoes ? 'Ativas' : 'Desativadas'}</span>
          <Switch checked={notificacoes} onChange={toggleNotificacoes} label="Alternar notificações" tema={tema} />
        </div>
      </div>

      {/* Plan Info */}
      <div className={`w-full max-w-2xl p-4 rounded-2xl border ${subtleBg} ${cardClass}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium">Plano Atual</div>
            <div className="text-xs ">Resumo das informações da assinatura</div>
          </div>
          <div className="text-sm text-gray-300 capitalize">{currentPlan}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-3 rounded-xl border">
            <div className="text-xs ">Status</div>
            <div className="font-medium capitalize">{planInfos.status || '—'}</div>
          </div>
          {/* <div className="p-3 rounded-xl border">
            <div className="text-xs ">Próximo valor</div>
            <div className="font-medium">R$ {planInfos.nextPaymentValue ?? '—'}</div>
            <div className="text-xs ">{formatDate(planInfos.nextPaymentDate)}</div>
          </div> */}
          <div className="p-3 rounded-xl border">
            <div className="text-xs ">Subscription ID</div>
            <div className="font-mono text-xs break-all">{planInfos.subscriptionId || '—'}</div>
          </div>
        </div>

        <div className="text-xs  mt-3">
          Sua próxima fatura será gerada em: {planInfos.expirationDate ? formatDate(planInfos.expirationDate) : planInfos.nextPaymentDate ? formatDate(planInfos.nextPaymentDate) : '_'}
        </div>
      </div>

      {/* Alteração de Plano */}
      <div className={`w-full max-w-2xl p-4 rounded-2xl border ${cardClass}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-medium">Alterar Plano</div>
            <div className="text-xs ">Escolha um novo plano para seu usuário</div>
          </div>
          <div className="text-xs text-gray-300">Plano atual: <strong className="capitalize">{currentPlan}</strong></div>
        </div>

        <div className="flex gap-3 flex-wrap">
          {['pro', 'max', 'coach', 'free'].map((p) => {
            const isSamePlan = currentPlan === p;
            const samePrice = (priceMapForDisplay[p].price ?? null) === (priceMapForDisplay[currentPlan]?.price ?? null);
            const disabled = planLoading || isSamePlan || samePrice;
            return (
              <button
                key={p}
                disabled={disabled}
                onClick={() => askChangePlan(p)}
                title={disabled ? (isSamePlan ? 'Você já está neste plano' : 'Plano com mesmo valor do atual — não permitido') : `Alterar para ${p}`}
                className={`px-4 py-2 rounded-2xl font-semibold transition ${currentPlan === p ? 'bg-blue-600 text-white' : (tema === 'dark' ? 'bg-gray-700 text-white' : 'bg-white text-black border')
                  } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {priceMapForDisplay[p].label} {priceMapForDisplay[p].price ? `— R$ ${priceMapForDisplay[p].price}` : ''}
              </button>
            );
          })}
        </div>

        <div className="text-xs  mt-3">
          Ao alterar o plano, o sistema tentará atualizar sua assinatura no Stripe. Normalmente:
          <ul className="list-disc ml-4 mt-1">
            <li>Haverá ajuste proporcional (proration) caso mude no meio do ciclo.</li>
            <li>Ao cancelar (passar para Free) a assinatura é removida.</li>
            <li>Os detalhes finais (datas e valores) são atualizados quando o Stripe confirma a troca.</li>
          </ul>
        </div>
      </div>

      {/* Modal de confirmação (input) */}
      {confirmOpen && pendingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeModal} />
          <div className={` ${tema === 'dark' ? 'bg-gray-900' : 'bg-white'} relative w-full max-w-lg rounded-2xl p-6 shadow-lg z-10`}>
            <h3 className="text-lg font-semibold mb-2">Confirmar alteração para "{pendingPlan}"</h3>

            <div className="mb-3 text-sm ">
              {trocaExplicacao(pendingPlan)}
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div className="p-3 flex flex-col justify-evenly rounded border">
                <div className="text-xs ">Plano atual</div>
                <div className="font-medium capitalize">{currentPlan}</div>
              </div>
              <div className="p-3 rounded border">
                <div className="text-xs ">Novo plano</div>
                <div className="font-medium capitalize">{pendingPlan}</div>
                <div className="text-xs ">Valor: R$ {priceMapForDisplay[pendingPlan].price ?? '—'}</div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs  mb-1">Digite o nome do plano para confirmar</label>
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={`Digite "${pendingPlan}" para confirmar`}
                className="w-full px-3 py-2 rounded-lg border focus:ring-2"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs  mb-1">Digite a sua senha confirmar</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`Digite a sua senha`}
                type='password'
                className="w-full px-3 py-2 rounded-lg border focus:ring-2"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={closeModal} disabled={planLoading} className="px-4 py-2 rounded-lg border">Cancelar</button>
              <button
                disabled={planLoading || confirmText.trim().toLowerCase() !== pendingPlan.toLowerCase()}
                onClick={confirmChangePlan}
                className={`px-4 py-2 rounded-lg font-semibold ${planLoading ? 'bg-gray-400 text-white' : 'bg-blue-600 text-white'}`}
              >
                {planLoading ? 'Processando...' : `Confirmar mudança para ${pendingPlan}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl text-xs  text-center mt-2">
        {globalLoading ? (
          <span>Operação em andamento...</span>
        ) : (
          <span>Alterações aplicadas no servidor. Webhooks do Stripe podem atualizar os dados finais do plano em seguida.</span>
        )}
      </div>
    </div>
  );
};

export default Configuracoes;
