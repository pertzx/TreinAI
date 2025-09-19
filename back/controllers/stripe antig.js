// controllers/Stripe.js
import dotenv from 'dotenv';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
import User from '../models/User.js';
import bcrypt from 'bcrypt';
import Local from '../models/local.js';
import ProcessedStripeEvent from '../models/ProcessedStripeEvent.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// Helper: grava logs (você pode trocar por logger mais avançado)
const log = (...args) => console.log('[StripeController]', ...args);

// =====================================================================================
// Criar Assinatura / Checkout Session (Subscription)
// =====================================================================================
export const CriarAssinaturaProLocal = async (req, res) => {
  try {
    const {
      tipo,
      profissionalId,
      description = '',
      paymentMethod = 'card',
      email,
      link,
      localName,
      localDescricao,
      country,
      countryCode,
      state,
      city,
    } = req.body || {};

    if (!tipo || !profissionalId || !email) {
      return res.status(400).json({ success: false, msg: 'tipo, profissionalId e email são obrigatórios' });
    }

    const tipoNorm = String(tipo).trim().toLowerCase();
    const priceMap = {
      'clinica-de-fisioterapia': process.env.STRIPE_PRICEID_100,
      'consultorio-de-nutricionista': process.env.STRIPE_PRICEID_100,
      'academia': process.env.STRIPE_PRICEID_180,
      'loja': process.env.STRIPE_PRICEID_180,
      'outros': process.env.STRIPE_PRICEID_50
    };
    const unitPrice = priceMap[tipoNorm];
    if (!unitPrice) return res.status(400).json({ success: false, msg: 'tipo inválido' });

    const pm = String(paymentMethod || 'card').toLowerCase();
    if (!['card', 'pix'].includes(pm)) return res.status(400).json({ success: false, msg: 'paymentMethod inválido' });

    // localizar user (por email) para possivelmente salvar stripeCustomerId
    let user = null;
    try {
      user = await User.findOne({ email }).catch(() => null);
    } catch (err) { user = null; }

    // localizar ou criar customer no Stripe
    let customerId = user?.planInfos?.stripeCustomerId || null;
    if (!customerId) {
      try {
        const customers = await stripe.customers.list({ email, limit: 1 });
        customerId = customers.data[0]?.id || null;
      } catch (err) {
        log('Aviso: falha ao procurar customer por email:', err?.message || err);
      }
    }
    if (!customerId) {
      try {
        const c = await stripe.customers.create({ email, metadata: { app: 'treinai' } });
        customerId = c.id;
        if (user) { user.planInfos = user.planInfos || {}; user.planInfos.stripeCustomerId = customerId; await user.save().catch(() => { }); }
      } catch (err) {
        log('Aviso: não foi possível criar customer (continuando sem customer):', err?.message || err);
        customerId = null;
      }
    }

    // tratar imagem enviada via multer (opcional)
    let imageUrl = '';
    if (req.file && req.file.filename) {
      const host = req.get && req.get('host') ? req.get('host') : (req.headers && req.headers.host) || 'localhost';
      const protocol = req.protocol || 'http';
      imageUrl = `${protocol}://${host}/uploads/image-local/${req.file.filename}`;
    }

    // 1) Criar Local PENDING no banco (garante desambiguação)
    const pendingLocal = await Local.create({
      profissionalId: String(profissionalId),
      link: link,
      localName: localName || 'Sem nome',
      localDescricao: localDescricao || 'Local pendente (aguardando pagamento)',
      localType: tipoNorm,
      imageUrl: imageUrl || null,
      country: country || '—',
      countryCode: countryCode || '',
      state: state || '—',
      city: city || '—',
      status: 'pending',
      criadoEm: new Date(),
      createdFrom: 'checkout_pending',
      subscriptionId: `pending_${Date.now()}`
    });

    // metadata que iremos propagar para a subscription
    const subscriptionMetadata = {
      app: 'treinai',
      flow: 'publish_local',
      pendingLocalId: String(pendingLocal._id),
      profissionalId: String(profissionalId),
      link: link,
      localType: tipoNorm,
      localName: localName || '',
      localDescricao: localDescricao || '',
      imageUrl: imageUrl || '',
      country: country || '',
      countryCode: countryCode || '',
      state: state || '',
      city: city || '',
      price_id: unitPrice
    };

    const sessionParams = {
      mode: 'subscription',
      payment_method_types: pm === 'pix' ? ['pix'] : ['card'],
      line_items: [{ price: unitPrice, quantity: 1 }],
      success_url: `${process.env.URL}success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}cancel`,
      metadata: { app: 'treinai', pendingLocalId: String(pendingLocal._id), flow: 'publish_local' },
      subscription_data: {
        metadata: subscriptionMetadata
      }
    };
    if (customerId) sessionParams.customer = customerId;

    const session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(201).json({
      success: true,
      msg: `Checkout session criada (${pm}).`,
      sessionId: session.id,
      url: session.url,
      amount: unitPrice,
      tipo: tipoNorm,
      profissionalId: String(profissionalId),
      customerId: customerId || null,
      payment_method_types_used: session.payment_method_types || [pm],
      pendingLocalId: String(pendingLocal._id)
    });

  } catch (error) {
    console.error('CreatePayment fatal error:', error?.message || error);
    return res.status(500).json({ success: false, msg: 'Erro ao criar Checkout Session', error: error?.message || String(error) });
  }
};

// =======================
// Create Checkout Session (outro fluxo de planos)
// =======================
export const CreateCheckoutSession = async (req, res) => {
  const { plan, userId } = req.body;
  if (!plan || !userId) return res.status(400).json({ msg: '!plan || !userId' });

  const priceMap = {
    pro: process.env.STRIPE_PRICEID_PRO,
    max: process.env.STRIPE_PRICEID_MAX,
    coach: process.env.STRIPE_PRICEID_COACH,
  };

  const priceId = priceMap[plan];
  if (!priceId) return res.status(400).json({ msg: '!priceId para esse plano' });

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado' });

    // tenta usar stripeCustomerId já salvo no user
    let customerId = user.planInfos?.stripeCustomerId || null;

    // fallback: procurar no Stripe por email
    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = customers.data[0]?.id || null;
    }

    // cria customer no Stripe se necessário e salva no user
    if (!customerId) {
      const c = await stripe.customers.create({
        email: user.email,
        metadata: { app_user_id: String(user._id) },
      });
      customerId = c.id;
      user.planInfos = user.planInfos || {};
      user.planInfos.stripeCustomerId = customerId;
      await user.save();
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.URL}success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}cancel`,
      metadata: {
        user_id: String(user._id),
        plan_type: plan,
        app: 'treinai'
      },
      subscription_data: {
        metadata: {
          user_id: String(user._id),
          plan_type: plan,
          app: 'treinai'
        },
      },
      customer: customerId,
    });

    return res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('CreateCheckoutSession error:', err);
    return res.status(500).json({ error: err.message });
  }
};

// =====================================================================================
// Webhook Handler (idempotente)
// =====================================================================================
export const StripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook constructEvent error:', err.message || err);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  const evtType = event.type;
  log('Evento recebido:', evtType, event.id);

  // Idempotência: gravar esse event.id em coleção dedicada
  try {
    await ProcessedStripeEvent.create({ eventId: event.id, meta: { type: evtType, receivedAt: new Date() } });
  } catch (err) {
    if (err && err.code === 11000) {
      log(`Evento ${event.id} já processado - ignorando.`);
      return res.json({ received: true });
    }
    console.error('Erro ao gravar ProcessedStripeEvent:', err);
    return res.status(500).send('Erro interno de webhook (idempotency).');
  }

  const data = event.data.object || {};
  const evtCreatedMs = (typeof event.created === 'number') ? (event.created * 1000) : Date.now();

  // helpers locais
  const ensureUserByCustomer = async (customerId) => {
    if (!customerId) return null;
    let user = await User.findOne({ 'planInfos.stripeCustomerId': customerId });
    if (user) return user;
    try {
      const customer = await stripe.customers.retrieve(customerId);
      const appUserId = customer?.metadata?.app_user_id || customer?.metadata?.user_id;
      if (appUserId) {
        const byId = await User.findById(appUserId);
        if (byId) { byId.planInfos = byId.planInfos || {}; byId.planInfos.stripeCustomerId = customerId; await byId.save(); return byId; }
      }
      if (customer?.email) {
        const byEmail = await User.findOne({ email: customer.email });
        if (byEmail) { byEmail.planInfos = byEmail.planInfos || {}; byEmail.planInfos.stripeCustomerId = customerId; await byEmail.save(); return byEmail; }
      }
    } catch (err) {
      console.warn('ensureUserByCustomer erro:', err?.message || err);
    }
    return null;
  };

  const findUserBySubscription = async (subscriptionId) => {
    if (!subscriptionId) return null;
    return await User.findOne({ 'planInfos.subscriptionId': subscriptionId });
  };

  const applyManualUpdate = async (userId, updates = {}, eventTs = evtCreatedMs) => {
    if (!userId) return null;
    const user = await User.findById(userId);
    if (!user) return null;
    user.planInfos = user.planInfos || {};
    for (const [k, v] of Object.entries(updates)) user.planInfos[k] = v;
    user.planInfos.lastStripeEventTimestamp = eventTs;
    await user.save();
    log(`Usuário ${userId} atualizado com:`, updates);
    return user;
  };

  try {
    switch (evtType) {
      // Checkout session completed: salvar subscriptionId / marcar 'inativo' até invoice.paid
      case 'checkout.session.completed': {
        log('checkout.session.completed');
        const session = data;
        if (!session.metadata || session.metadata.app !== 'treinai') { log('session: origem diferente -> ignorando'); break; }
        const subscriptionId = session.subscription || null;
        const customerId = session.customer || null;

        // atualização de usuário (se aplicável)
        if (session.metadata.plan_type) {
          if (session.metadata.user_id) {
            await applyManualUpdate(session.metadata.user_id, {
              subscriptionId,
              stripeCustomerId: customerId,
              status: 'inativo',
              planType: session.metadata.plan_type,
              nextPaymentValue: null,
              nextPaymentDate: null
            }, evtCreatedMs);
          } else if (customerId) {
            const user = await ensureUserByCustomer(customerId);
            if (user) await applyManualUpdate(user._id, { subscriptionId, stripeCustomerId: customerId, status: 'inativo', planType: session.metadata.plan_type, }, evtCreatedMs);
            else log('checkout.session.completed: usuário não encontrado para customer', customerId);
          }
        }

        // se for fluxo de publish_local, vincular subscriptionId ao pending local
        try {
          if (session.metadata.flow && session.metadata.flow === 'publish_local' && session.metadata.pendingLocalId) {
            const pendingLocalId = session.metadata.pendingLocalId;
            const loc = await Local.findById(pendingLocalId);
            if (loc) {
              loc.subscriptionId = subscriptionId || loc.subscriptionId;
              // manter local em pending até invoice.paid confirme o pagamento
              await loc.save();
              log('checkout.session.completed: pending Local atualizado com subscriptionId:', loc._id);
            } else {
              log('checkout.session.completed: pendingLocalId não encontrado:', pendingLocalId);
            }
          }
        } catch (errLocal) {
          console.warn('checkout.session.completed: erro ao vincular pending local:', errLocal?.message || errLocal);
        }

        break;
      }

      // Invoice paid => pagamento confirmado -> ATIVA usuário e CRIA/ATUALIZA local (usar pendingLocalId preferencialmente)
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        log('invoice.paid handler');
        const invoice = data;
        const invoiceId = invoice.id;
        const subscriptionId = invoice.subscription || null;
        const customerId = invoice.customer || null;
        const invoicePaidFlag = invoice.paid === true || invoice.status === 'paid' || (typeof invoice.amount_paid === 'number' && invoice.amount_paid > 0);
        if (!invoicePaidFlag) { log('invoice não está paga -> ignorando'); break; }

        // localizar user
        let user = null;
        if (invoice.metadata?.user_id) user = await User.findById(invoice.metadata.user_id);
        if (!user && customerId) user = await User.findOne({ 'planInfos.stripeCustomerId': customerId });
        if (!user && subscriptionId) user = await User.findOne({ 'planInfos.subscriptionId': subscriptionId });

        // Atualizar user (se aplicável)
        if (user) {
          user.planInfos = user.planInfos || {};
          if (String(user.planInfos.lastProcessedInvoiceId) === String(invoiceId)) {
            log('invoice já processada anteriormente -> ignorando');
          } else {
            user.planInfos.subscriptionId = subscriptionId || user.planInfos.subscriptionId;
            user.planInfos.stripeCustomerId = customerId || user.planInfos.stripeCustomerId;
            user.planInfos.nextPaymentValue = (invoice.amount_paid != null) ? (invoice.amount_paid / 100) : user.planInfos.nextPaymentValue;

            // tentar pegar next date via subscription
            let nextPaymentDate = null;
            if (subscriptionId) {
              try {
                const sub = await stripe.subscriptions.retrieve(subscriptionId);
                if (sub && sub.current_period_end) nextPaymentDate = new Date(sub.current_period_end * 1000);
              } catch (err) { /* ignore */ }
            }
            user.planInfos.nextPaymentDate = nextPaymentDate || user.planInfos.nextPaymentDate;
            user.planInfos.status = 'ativo';
            user.planInfos.lastProcessedInvoiceId = invoiceId;

            // proration history (se houver)
            const prorationLines = (invoice.lines && invoice.lines.data) ? invoice.lines.data.filter(l => Boolean(l.proration)) : [];
            if (prorationLines.length) {
              user.planInfos.prorationHistory = user.planInfos.prorationHistory || [];
              const summary = prorationLines.map(l => ({ id: l.id, description: l.description, amount: typeof l.amount === 'number' ? l.amount / 100 : null }));
              user.planInfos.prorationHistory.push({ invoiceId, createdAt: new Date(), lines: summary, total: summary.reduce((s, x) => s + (x.amount || 0), 0) });
            }
            await user.save();
            log('Usuario ativado via invoice.paid:', user._id);
          }
        } else {
          log('invoice.paid: usuário não encontrado (customer/subscription/metadata).');
        }

        // --- DESAMBIGUAÇÃO / CRIAÇÃO OU ATUALIZAÇÃO DO LOCAL ---
        // Preferir: 1) invoice.metadata.pendingLocalId 2) subscription.metadata.pendingLocalId 3) local por subscriptionId 4) criar a partir de metadata completa
        let md = invoice.metadata || {};
        let pendingLocalId = md.pendingLocalId || null;

        // se não tiver pendingLocalId no invoice, tentar pegar da subscription
        if (!pendingLocalId && subscriptionId) {
          try {
            const subFull = await stripe.subscriptions.retrieve(subscriptionId);
            md = { ...md, ...(subFull?.metadata || {}) };
            pendingLocalId = subFull?.metadata?.pendingLocalId || null;
          } catch (err) {
            log('invoice.paid: falha ao recuperar subscription para metadata (não crítico):', err?.message || err);
          }
        }

        // 1) Se pendingLocalId exist, vincular/ativar esse local (preferido)
        if (pendingLocalId) {
          try {
            const local = await Local.findById(pendingLocalId);
            if (local) {
              // security check: confirmar profissionalId bate com metadata (se fornecido)
              if (md.profissionalId && String(local.profissionalId) !== String(md.profissionalId)) {
                console.warn('pendingLocalId existe mas profissionalId não confere — não ativando automaticamente. pendingLocalId:', pendingLocalId);
              } else {
                local.status = 'ativo';
                if (subscriptionId) local.subscriptionId = subscriptionId;
                local.localDescricao = local.localDescricao || md.localDescricao || local.localDescricao;
                local.imageUrl = local.imageUrl || md.imageUrl || local.imageUrl;
                local.country = local.country || md.country || local.country;
                local.countryCode = local.countryCode || md.countryCode || local.countryCode;
                local.state = local.state || md.state || local.state;
                local.city = local.city || md.city || local.city;
                local.atualizadoEm = new Date();
                await local.save();
                log('Local (pending) ativado e vinculado à subscription:', local._id);
              }
            } else {
              log('pendingLocalId fornecido, mas local não encontrado:', pendingLocalId);
            }
          } catch (err) {
            console.error('Erro ao ativar pendingLocalId:', err);
          }
          break; // já tratamos o local; fim do fluxo de criação de local
        }

        // 2) fallback: procurar local por subscriptionId no DB
        if (subscriptionId) {
          try {
            const bySub = await Local.findOne({ subscriptionId });
            if (bySub) {
              bySub.status = 'ativo';
              bySub.atualizadoEm = new Date();
              await bySub.save();
              log('Local atualizado por subscriptionId:', bySub._id);
              break;
            }
          } catch (err) {
            console.warn('Erro ao procurar Local por subscriptionId (não crítico):', err);
          }
        }

        // 3) fallback final: se metadata tem profissionalId+localName+localType completos, criar novo local (cuidado com duplicados)
        if (md.profissionalId && md.localName && md.localType) {
          try {
            const exists = await Local.findOne({ profissionalId: md.profissionalId, localName: md.localName, localType: md.localType });
            if (exists) {
              // possivelmente registrar subscriptionId se ausente
              if (subscriptionId && !exists.subscriptionId) {
                exists.subscriptionId = subscriptionId;
                exists.status = 'ativo';
                exists.atualizadoEm = new Date();
                await exists.save();
                log('Local existente atualizado com subscriptionId:', exists._id);
              } else {
                log('Local já existe, nada a fazer.');
              }
            } else {
              const payloadForLocal = {
                profissionalId: md.profissionalId,
                localName: md.localName,
                localDescricao: md.localDescricao || '',
                localType: md.localType,
                imageUrl: md.imageUrl || null,
                country: md.country || null,
                countryCode: md.countryCode || null,
                state: md.state || null,
                city: md.city || null,
                subscriptionId: subscriptionId || null,
                status: 'ativo',
                criadoEm: new Date(),
                criadoVia: 'invoice.paid'
              };
              const created = await Local.create(payloadForLocal);
              log('Local criado a partir de metadata do invoice.paid:', created._id);
            }
          } catch (err) {
            console.error('Erro ao criar/atualizar Local a partir de metadata:', err);
          }
        } else {
          log('invoice.paid: metadata insuficiente para criar local automaticamente; gravado para revisão manual.', md);
          // opcional: gravar esse caso em uma fila para análise manual
        }

        break;
      }

      // payment failed -> para locais: desativar/excluir; para users: marcar inativo
      case 'invoice.payment_failed': {
        log('invoice.payment_failed');
        const invoice = data;
        const subscriptionId = invoice.subscription || null;
        const customerId = invoice.customer || null;

        // determinar metadata/flow (invoice metadata ou subscription metadata)
        let md = invoice.metadata || {};
        if ((!md || Object.keys(md).length === 0) && subscriptionId) {
          try {
            const subFull = await stripe.subscriptions.retrieve(subscriptionId);
            md = { ...(subFull?.metadata || {}) };
          } catch (err) {
            log('invoice.payment_failed: falha ao recuperar subscription metadata (não crítico):', err?.message || err);
          }
        }

        const flow = md.flow || null;

        // Se for flow de publish_local -> desativar local (ou remover)
        if (flow === 'publish_local') {
          try {
            const pendingLocalId = md.pendingLocalId || null;
            let local = null;
            if (pendingLocalId) local = await Local.findById(pendingLocalId);
            if (!local && subscriptionId) local = await Local.findOne({ subscriptionId });

            if (local) {
              // Se local foi criado apenas como pending e nunca ativo, podemos optar por deletar.
              // Por padrão aqui só marcamos inativo para segurança.
              local.status = 'inativo';
              local.atualizadoEm = new Date();
              local.paymentFailureReason = local.paymentFailureReason || `invoice.payment_failed: invoice ${invoice.id}`;
              await local.save();
              log('Local marcado como inativo por falha no pagamento (publish_local):', local._id);
              // Se preferir deletar o local quando criadoFrom === 'checkout_pending', descomente:
              // if (local.createdFrom === 'checkout_pending') await Local.findByIdAndDelete(local._id);
            } else {
              log('invoice.payment_failed (publish_local): local não encontrado por pendingLocalId/subscriptionId.', { pendingLocalId, subscriptionId });
            }
          } catch (err) {
            console.error('invoice.payment_failed: erro ao desativar local:', err);
          }
        } else {
          // fluxo de usuário: marcar user.planInfos.status = 'inativo'
          try {
            let user = null;
            if (md.user_id) user = await User.findById(md.user_id);
            if (!user && customerId) user = await User.findOne({ 'planInfos.stripeCustomerId': customerId });
            if (!user && subscriptionId) user = await User.findOne({ 'planInfos.subscriptionId': subscriptionId });

            if (user) {
              user.planInfos = user.planInfos || {};
              user.planInfos.status = 'inativo';
              user.planInfos.lastPaymentFailed = invoice.id;
              user.planInfos.lastStripeEventTimestamp = evtCreatedMs;
              await user.save();
              log('Usuário marcado inativo por invoice.payment_failed:', user._id);
            } else {
              log('invoice.payment_failed: usuário não encontrado para marcar inativo.');
            }
          } catch (err) {
            console.error('invoice.payment_failed: erro ao marcar usuário inativo:', err);
          }
        }

        break;
      }

      // subscription deleted -> atualizar status local/usuario
      case 'customer.subscription.deleted': {
        log('customer.subscription.deleted');
        const subscription = data;
        const subscriptionId = subscription.id;
        const customerId = subscription.customer || null;
        let md = subscription.metadata || {};
        let flow = 'user'

        console.log(subscriptionId)
        // Para Local vinculado a essa subscription: marcar inativo (ou remover)
        try {
          const local = await Local.findOne({ subscriptionId });
          if (local) {
            if (local.subscriptionId === subscriptionId) {
              // logica pra deletar local
              flow = 'local'
            }
          } else {
            log('customer.subscription.deleted: nenhum local encontrado com subscriptionId:', subscriptionId);
          }
        } catch (err) {
          console.warn('customer.subscription.deleted: erro: ', err);
        }

        if (flow === 'local') {
          try {
            const local = await Local.findOne({ subscriptionId });
            if (local){
              local.status = 'inativo';
              local.atualizadoEm = new Date();
              log('Local marcado inativo por subscription.deleted:', local._id);
              await local.save();
            }
          } catch (error) {
            console.warn('customer.subscription.deleted: erro ao atualizar local:', err);
          }
        } else {
          // Atualizar usuário se possível
          try {
            let user = null;
            if (md.user_id) user = await User.findById(md.user_id);
            if (!user && customerId) user = await ensureUserByCustomer(customerId);
            if (!user && subscriptionId) user = await findUserBySubscription(subscriptionId);

            if (user) {
              user.planInfos = user.planInfos || {};
              user.planInfos.subscriptionId = null;
              user.planInfos.status = 'inativo';
              user.planInfos.nextPaymentDate = null;
              user.planInfos.nextPaymentValue = null;
              user.planInfos.lastStripeEventTimestamp = evtCreatedMs;
              await user.save();
              log('Usuário atualizado por subscription.deleted:', user._id);
            }
          } catch (err) {
            console.warn('customer.subscription.deleted: erro ao atualizar usuário:', err);
          }
        }

        break;
      }

      default:
        log('Evento não tratado:', evtType);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('Erro ao processar webhook:', err);
    return res.status(500).send('Erro interno');
  }
};

// =====================================================================================
// SessionStatus
// =====================================================================================
export const SessionStatus = async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: '!session_id' });

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.subscription) {
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      return res.json({ status: sub.status, subscriptionId: sub.id });
    }

    const isActive = session.payment_status === 'paid' ? 'ativo' : 'inativo';
    return res.json({ status: isActive, subscriptionId: session.subscription || null });
  } catch (err) {
    console.error('Erro ao consultar sessão:', err);
    return res.status(500).json({ error: 'Erro ao consultar sessão' });
  }
};

// =====================================================================================
// atualizarPlano (mantive sua versão completa - não modifiquei a lógica aqui, apenas deixei como está)
// =====================================================================================
export const atualizarPlano = async (req, res) => {
  try {
    const { email, userId, plan, password } = req.body;
    if (!userId) return res.status(400).json({ msg: '!userId' });
    if (!email) return res.status(400).json({ msg: '!email' });
    if (!plan) return res.status(400).json({ msg: '!plan' });
    if (!password) return res.status(400).json({ msg: '!password' });

    console.log('[atualizarPlano] Iniciando fluxo', { userId, email, requestedPlan: plan });

    const ALLOWED_PLANS = ['free', 'pro', 'max', 'coach'];
    const priceMap = {
      pro: process.env.STRIPE_PRICEID_PRO,
      max: process.env.STRIPE_PRICEID_MAX,
      coach: process.env.STRIPE_PRICEID_COACH,
    };

    const user = await User.findById(userId);
    if (!user) {
      console.warn('[atualizarPlano] Usuário não encontrado', { userId, email });
      return res.status(404).json({ msg: '!usuario' });
    }

    const senhaValida = await bcrypt.compare(password, user.password);
    if (!senhaValida) {
      console.warn('[atualizarPlano] Senha inválida para userId', userId);
      return res.status(403).json({ msg: 'Senha incorreta' });
    }

    const currentPlan = String(user.planInfos?.planType || 'free').toLowerCase();
    const requestedPlan = String(plan).toLowerCase().trim();
    if (!ALLOWED_PLANS.includes(requestedPlan)) {
      console.warn('[atualizarPlano] Plano requisitado inválido', requestedPlan);
      return res.status(400).json({ msg: '!planoInvalido' });
    }
    if (requestedPlan === currentPlan) {
      console.log('[atualizarPlano] Requisição para o mesmo plano atual — nada a fazer', { userId, currentPlan });
      return res.status(400).json({ msg: 'Já está neste plano', planInfos: user.planInfos });
    }

    // localizar/garantir customerId
    let customerId = user.planInfos?.stripeCustomerId || null;
    if (!customerId) {
      console.log('[atualizarPlano] Procurando customer pelo email no Stripe', email);
      const customers = await stripe.customers.list({ email, limit: 1 });
      customerId = customers.data[0]?.id || null;
      console.log('[atualizarPlano] customer encontrado via email:', customerId);
    }

    // helper para listar assinaturas ativas do customer
    const listActiveSubscriptions = async () => {
      if (!customerId) return [];
      console.log('[atualizarPlano] Listando assinaturas ativas para customer:', customerId);
      const subs = await stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 100 });
      console.log('[atualizarPlano] assinaturas ativas retornadas:', subs.data?.length || 0);
      return Array.isArray(subs.data) ? subs.data : [];
    };

    // -------------------- CANCEL (FREE) --------------------
    if (requestedPlan === 'free') {
      console.log('[atualizarPlano] Fluxo de downgrade para FREE iniciado', { userId, customerId });

      if (!customerId) {
        console.log('[atualizarPlano] Nenhum customer no Stripe — atualizando localmente para free');
        user.planInfos = user.planInfos || {};
        user.planInfos.status = 'inativo';
        user.planInfos.planType = 'free';
        user.planInfos.nextPaymentDate = null;
        user.planInfos.nextPaymentValue = null;
        user.planInfos.subscriptionId = null;
        await user.save();
        return res.json({ msg: 'Não havia customer no Stripe. Plano setado para free localmente.', planInfos: user.planInfos });
      }

      const activeSubs = await listActiveSubscriptions();
      if (!activeSubs.length) {
        console.log('[atualizarPlano] Customer não tem assinaturas ativas — atualizando localmente para free', { customerId });
        user.planInfos = user.planInfos || {};
        user.planInfos.status = 'inativo';
        user.planInfos.planType = 'free';
        user.planInfos.nextPaymentDate = null;
        user.planInfos.nextPaymentValue = null;
        user.planInfos.subscriptionId = null;
        await user.save();
        return res.json({ msg: 'Sem assinatura ativa no Stripe. Plano setado para free localmente.', planInfos: user.planInfos });
      }

      // heurística para escolher assinatura a cancelar
      const knownPriceIds = Object.values(priceMap).filter(Boolean);
      let subToCancel = activeSubs.find(s => String(s.id) === String(user.planInfos?.subscriptionId));
      if (!subToCancel) subToCancel = activeSubs.find(s => s.items?.data?.some(it => knownPriceIds.includes(it.price?.id)));
      if (!subToCancel) subToCancel = activeSubs.find(s => s.metadata && String(s.metadata.app_user_id) === String(userId));
      if (!subToCancel) subToCancel = activeSubs[0];

      // tentar recuperar detalhes da assinatura para calcular reembolso pró-rata (se aplicável)
      let refund = null;
      try {
        const subscription = await stripe.subscriptions.retrieve(subToCancel.id, { expand: ['latest_invoice', 'latest_invoice.payment_intent'] });
        const now = Math.floor(Date.now() / 1000);
        const periodStart = subscription.current_period_start || now;
        const periodEnd = subscription.current_period_end || now;
        const totalSeconds = Math.max(1, periodEnd - periodStart);
        const remainingSeconds = Math.max(0, periodEnd - now);
        const items = subscription.items?.data || [];
        let totalAmount = 0;
        for (const it of items) {
          let unit = it.price?.unit_amount ?? null;
          if (unit == null && it.price?.unit_amount_decimal) unit = Math.round(parseFloat(it.price.unit_amount_decimal || '0'));
          const qty = it.quantity || 1;
          totalAmount += (unit || 0) * qty;
        }
        const prorated = Math.round(totalAmount * (remainingSeconds / totalSeconds));

        // obter chargeId do latest_invoice
        let chargeId = null;
        const latestInvoice = subscription.latest_invoice || null;
        if (latestInvoice) {
          if (typeof latestInvoice.charge === 'string' && latestInvoice.charge) chargeId = latestInvoice.charge;
          else if (latestInvoice.payment_intent && latestInvoice.payment_intent.charges && Array.isArray(latestInvoice.payment_intent.charges.data) && latestInvoice.payment_intent.charges.data.length) {
            chargeId = latestInvoice.payment_intent.charges.data[0].id;
          }
        }

        // checar se existe valor reembolsável
        let refundable = 0;
        if (chargeId) {
          try {
            const charge = await stripe.charges.retrieve(chargeId);
            refundable = Math.max(0, (charge.amount || 0) - (charge.amount_refunded || 0));
          } catch (err) {
            refundable = 0;
          }
        }

        if (prorated > 0 && chargeId && refundable > 0) {
          const amountToRefund = Math.min(prorated, refundable);
          try {
            refund = await stripe.refunds.create({ charge: chargeId, amount: amountToRefund });
            console.log('[atualizarPlano] Refund criado:', refund.id, 'amount:', refund.amount);
          } catch (errRefund) {
            console.warn('[atualizarPlano] Falha ao criar refund:', errRefund?.message || errRefund);
          }
        } else {
          console.log('[atualizarPlano] Nenhum valor elegível para refund (prorated, chargeId, refundable):', { prorated, chargeId, refundable });
        }

        // cancelar assinatura (imediato)
        try {
          await stripe.subscriptions.cancel(subToCancel.id);
          console.log('[atualizarPlano] subscription.del OK:', subToCancel.id);
        } catch (errCancel) {
          console.warn('[atualizarPlano] Falha ao deletar subscription no Stripe:', errCancel?.message || errCancel);
        }
      } catch (err) {
        console.warn('[atualizarPlano] Erro ao processar cancelamento/refund (não crítico):', err?.message || err);
        // tentaremos ao menos cancelar sem refund
        try {
          await stripe.subscriptions.cancel(subToCancel.id);
        } catch (e) { console.warn('[atualizarPlano] fallback cancel falhou:', e?.message || e); }
      }

      // atualizar localmente
      user.planInfos = user.planInfos || {};
      user.planInfos.status = 'inativo';
      user.planInfos.planType = 'free';
      user.planInfos.nextPaymentDate = null;
      user.planInfos.nextPaymentValue = null;
      user.planInfos.subscriptionId = null;
      await user.save();

      return res.json({
        msg: 'Assinatura cancelada e plano setado para free',
        planInfos: user.planInfos,
        canceledSubscription: subToCancel?.id || null,
        refundId: refund?.id || null,
        refundAmount: refund?.amount || null
      });
    } // end requestedPlan === 'free'

    // -------------------- UPGRADE / DOWNGRADE (proration) --------------------
    const priceId = priceMap[requestedPlan];
    if (!priceId) {
      console.warn('[atualizarPlano] priceId não encontrado para requestedPlan:', requestedPlan);
      return res.status(400).json({ msg: '!planoInvalido' });
    }

    // criar customer se necessário
    if (!customerId) {
      console.log('[atualizarPlano] Criando customer no Stripe (não havia)', { email, userId });
      const c = await stripe.customers.create({
        email,
        metadata: { app_user_id: String(user._id) },
      });
      customerId = c.id;
      user.planInfos = user.planInfos || {};
      user.planInfos.stripeCustomerId = customerId;
      await user.save();
      console.log('[atualizarPlano] Customer criado:', customerId);
    }

    const activeSubs = await listActiveSubscriptions();

    // encontrar assinatura alvo para atualizar
    console.log('[atualizarPlano] Procurando assinatura alvo para update', { customerId, priceId });
    let subscriptionToUpdate = null;
    if (activeSubs.length) {
      subscriptionToUpdate = activeSubs.find(s => String(s.id) === String(user.planInfos?.subscriptionId));
      if (!subscriptionToUpdate) {
        subscriptionToUpdate = activeSubs.find(s => s.items?.data?.some(it => String(it.price?.id) === String(priceId)));
      }
      if (!subscriptionToUpdate) {
        subscriptionToUpdate = activeSubs.find(s => s.metadata && String(s.metadata.app_user_id) === String(userId));
      }
      if (!subscriptionToUpdate) {
        console.log('[atualizarPlano] Não foi encontrada assinatura claramente relacionada — optando por criar checkout (evitar alterar assinatura errada).');
        subscriptionToUpdate = null;
      }
    }

    if (!subscriptionToUpdate) {
      console.log('[atualizarPlano] Chamando CreateCheckoutSession para plano:', requestedPlan);
      req.body.plan = requestedPlan;
      req.body.userId = String(user._id);
      return await CreateCheckoutSession(req, res);
    }

    // atualiza assinatura usando proration automática do Stripe
    const subscriptionFull = await stripe.subscriptions.retrieve(subscriptionToUpdate.id);
    const itemId = subscriptionFull.items?.data?.[0]?.id;
    if (!itemId) {
      console.warn('[atualizarPlano] assinatura sem item id — fallback para checkout', { subscriptionId: subscriptionFull.id });
      req.body.plan = requestedPlan;
      req.body.userId = String(user._id);
      return await CreateCheckoutSession(req, res);
    }

    console.log('[atualizarPlano] Atualizando assinatura com proration automática:', subscriptionFull.id);
    const updated = await stripe.subscriptions.update(subscriptionFull.id, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: 'create_prorations', // deixe o Stripe criar as linhas de proration
    });

    // obter upcoming invoice para visualização (invoice preview)
    let invoicePreview = null;
    try {
      invoicePreview = await stripe.invoices.retrieveUpcoming({
        customer: customerId,
        subscription: updated.id
      });
      console.log('[atualizarPlano] upcoming invoice obtida', { id: invoicePreview.id, total: invoicePreview.total, amount_due: invoicePreview.amount_due });
    } catch (errUpcoming) {
      console.warn('[atualizarPlano] retrieveUpcoming falhou (não crítico):', errUpcoming?.message || errUpcoming);
    }

    // atualizar dados do user local
    user.planInfos = user.planInfos || {};
    user.planInfos.planType = requestedPlan;
    user.planInfos.subscriptionId = updated.id;
    user.planInfos.stripeCustomerId = customerId;
    user.planInfos.status = 'ativo';

    if (invoicePreview) {
      user.planInfos.nextPaymentValue = typeof invoicePreview.amount_due === 'number' ? invoicePreview.amount_due / 100 : (typeof invoicePreview.total === 'number' ? invoicePreview.total / 100 : null);
      if (invoicePreview.next_payment_attempt) {
        user.planInfos.nextPaymentDate = new Date(invoicePreview.next_payment_attempt * 1000);
      } else if (updated.current_period_end) {
        user.planInfos.nextPaymentDate = new Date(updated.current_period_end * 1000);
      } else {
        user.planInfos.nextPaymentDate = null;
      }
    } else {
      user.planInfos.nextPaymentValue = updated.items?.data?.[0]?.price?.unit_amount ? updated.items.data[0].price.unit_amount / 100 : null;
      user.planInfos.nextPaymentDate = updated.current_period_end ? new Date(updated.current_period_end * 1000) : null;
    }

    await user.save();

    const invoicePreviewResponse = invoicePreview ? {
      id: invoicePreview.id,
      amount_due: typeof invoicePreview.amount_due === 'number' ? invoicePreview.amount_due / 100 : null,
      total: typeof invoicePreview.total === 'number' ? invoicePreview.total / 100 : null,
      lines: invoicePreview.lines?.data?.map(l => ({
        id: l.id,
        description: l.description,
        amount: (typeof l.amount === 'number' ? l.amount / 100 : null),
        proration: Boolean(l.proration),
        period: l.period || null,
      })) || []
    } : null;

    return res.json({
      msg: 'Assinatura atualizada no Stripe (aguardando invoice). Confira invoicePreview.',
      planInfos: user.planInfos,
      subscription: updated,
      invoicePreview: invoicePreviewResponse
    });

  } catch (error) {
    console.error('[atualizarPlano] Erro ao atualizar plano:', error);
    return res.status(500).json({ msg: 'Erro ao atualizar plano', error: error.message || error });
  }
};

// =====================================================================================
// deletarLocal API (checa subscription vinculada, tenta pró-rata + refund, cancela subscription e remove local)
// =====================================================================================
export const deletarLocal = async (req, res) => {
  const { subscriptionId, localId, profissionalId } = req.body || {};

  if (!profissionalId || !localId) {
    return res.status(400).json({ msg: 'profissionalId e localId são obrigatórios' });
  }

  try {
    // buscar local e validar dono (tenta achar por localId campo ou por _id)
    let local = await Local.findOne({ localId }) || await Local.findById(localId);
    if (!local) return res.status(404).json({ msg: 'Local não encontrado' });
    if (String(local.profissionalId) !== String(profissionalId)) return res.status(403).json({ msg: 'Não autorizado' });

    // se tiver subscription vinculada (via payload ou via local.subscriptionId), tentar recuperar e cancelar com segurança
    let refund = null;
    const subId = subscriptionId || local.subscriptionId || null;
    if (subId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subId, { expand: ['latest_invoice', 'latest_invoice.payment_intent'] });
        // calcular pró-rata simples
        const now = Math.floor(Date.now() / 1000);
        const periodStart = subscription.current_period_start || now;
        const periodEnd = subscription.current_period_end || now;
        const totalSeconds = Math.max(1, periodEnd - periodStart);
        const remainingSeconds = Math.max(0, periodEnd - now);
        const items = subscription.items?.data || [];
        let totalAmount = 0;
        for (const it of items) {
          let unit = it.price?.unit_amount ?? null;
          if (unit == null && it.price?.unit_amount_decimal) unit = Math.round(parseFloat(it.price.unit_amount_decimal || '0'));
          const qty = it.quantity || 1;
          totalAmount += (unit || 0) * qty;
        }
        const prorated = Math.round(totalAmount * (remainingSeconds / totalSeconds));

        // recuperar chargeId do latest_invoice (expand já tentou trazer payment_intent)
        let chargeId = null;
        const latestInvoice = subscription.latest_invoice || null;
        if (latestInvoice) {
          if (typeof latestInvoice.charge === 'string' && latestInvoice.charge) chargeId = latestInvoice.charge;
          else if (latestInvoice.payment_intent && latestInvoice.payment_intent.charges && Array.isArray(latestInvoice.payment_intent.charges.data) && latestInvoice.payment_intent.charges.data.length) {
            chargeId = latestInvoice.payment_intent.charges.data[0].id;
          }
        }

        // checar valor reembolsável
        let refundable = 0;
        if (chargeId) {
          try {
            const charge = await stripe.charges.retrieve(chargeId);
            refundable = Math.max(0, (charge.amount || 0) - (charge.amount_refunded || 0));
          } catch (err) {
            refundable = 0;
          }
        }

        if (prorated > 0 && chargeId && refundable > 0) {
          const amountToRefund = Math.min(prorated, refundable);
          try {
            refund = await stripe.refunds.create({ charge: chargeId, amount: amountToRefund });
            log('Refund criado ao deletar local:', refund.id, 'amount:', refund.amount);
          } catch (errRefund) {
            console.warn('Falha ao criar refund:', errRefund?.message || errRefund);
          }
        }

        // cancelar assinatura (imediato)
        try {
          await stripe.subscriptions.cancel(subId);
          log('Subscription cancelada (del) ao deletar local:', subId);
        } catch (errCancel) {
          console.warn('Falha ao cancelar subscription:', errCancel?.message || errCancel);
        }
      } catch (err) {
        console.warn('deletarLocal: falha ao recuperar/cancelar subscription (não crítico):', err?.message || err);
      }
    }

    // apagar local no banco
    if (local._id) {
      await Local.findByIdAndDelete(local._id);
    } else {
      await Local.findOneAndDelete({ localId });
    }

    return res.json({
      msg: 'Local removido. Subscription cancelada quando aplicável.',
      refundId: refund?.id || null,
      refundAmount: refund?.amount || null
    });
  } catch (error) {
    console.error('Erro ao deletar local:', error);
    return res.status(500).json({ msg: 'Erro ao deletar local', error: error?.message || String(error) });
  }
};
