// controllers/Stripe.js
import dotenv from 'dotenv';
import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';
import User from '../models/User.js';
import bcrypt from 'bcrypt';
import Local from '../models/local.js';
import ProcessedStripeEvent from '../models/ProcessedStripeEvent.js';
import mongoose from 'mongoose';
import Profissional from '../models/Profissional.js';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// Helper: grava logs
const log = (...args) => console.log('[StripeController]', ...args);

// ---------------------------
// PendingUpload model (novo)
// Armazena uploads temporários que só viram Local após confirmação de pagamento
// ---------------------------
const PendingUploadSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String },
  userId: { type: String },
  localName: { type: String },
  localDescricao: { type: String },
  localType: { type: String },
  link: { type: String },
  country: { type: String },
  countryCode: { type: String },
  state: { type: String },
  city: { type: String },
  createdAt: { type: Date, default: () => new Date() },
  subscriptionId: { type: String, default: null }, // atualizado no checkout.session.completed
  metadata: { type: Object, default: {} },
});
const PendingUpload = mongoose.models.PendingUpload || mongoose.model('PendingUpload', PendingUploadSchema);

// ---------------------------
// Paths helpers
// ---------------------------
const TMP_DIR = path.join(process.cwd(), 'uploads', 'tmp');
const FINAL_DIR = path.join(process.cwd(), 'uploads', 'image-local');

async function ensureDir(dir) {
  try { await fs.promises.mkdir(dir, { recursive: true }); } catch (e) { /* ignore */ }
}
async function moveFile(src, dest) {
  await ensureDir(path.dirname(dest));
  return fs.promises.rename(src, dest);
}
async function unlinkIfExists(fp) {
  try {
    // Ensure the path is inside the TMP_DIR for safety
    const normalizedPath = path.resolve(fp);
    if (!normalizedPath.startsWith(TMP_DIR + path.sep)) {
      console.warn('unlinkIfExists: Attempted to unlink file outside TMP_DIR:', normalizedPath);
      return;
    }
    const exists = await fs.promises.stat(normalizedPath).then(() => true).catch(() => false);
    if (exists) await fs.promises.unlink(normalizedPath);
  } catch (e) {
    console.warn('unlinkIfExists error:', e?.message || e);
  }
}

export const isValidObjectId = (id) => {
  if (id === null || id === undefined) return false;
  const s = String(id).trim();
  if (!s) return false;

  // ObjectId (24 hex) válido
  if (mongoose.Types.ObjectId.isValid(s)) return true;

  // Id numérico bruto (ex: 91209192)
  if (/^\d+$/.test(s)) return true;

  // UUID v1-v5
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return true;

  return false;
};

export const safeFindById = async (Model, id) => {
  if (id === null || id === undefined) return null;
  const s = String(id).trim();
  if (!s) return null;

  // se for ObjectId -> findById (rápido e seguro)
  if (mongoose.Types.ObjectId.isValid(s)) {
    try { return await Model.findById(s); } catch (e) { return null; }
  }

  // se for numérico -> tentar campos legacy comuns sem lançar (adapte nomes se tiver campo próprio)
  if (/^\d+$/.test(s)) {
    return await Model.findOne({
      $or: [
        { legacyNumericId: s },
        { numericId: s },
        { externalId: s },
        { _id: s } // caso você já tenha _id de outro tipo
      ]
    }).exec();
  }

  // se for UUID -> tentar campos comuns
  if (/^[0-9a-f-]{36}$/i.test(s)) {
    return await Model.findOne({
      $or: [
        { uuid: s },
        { externalId: s },
        { _id: s }
      ]
    }).exec();
  }

  return null;
};

/**
 * Remove pending upload: apaga arquivo tmp e documento PendingUpload
 */
async function removePendingUpload(pendingId) {
  if (!pendingId) return;

  if (!isValidObjectId(pendingId)) {
    return
  }

  
  const p = await safeFindById(PendingUpload, pendingId);

  if (!p) return;
  try {
    const tmpPath = path.join(TMP_DIR, p.filename);
    await unlinkIfExists(tmpPath);
  } catch (e) {
    console.warn('removePendingUpload: falha ao apagar arquivo tmp:', e?.message || e);
  }
  try {
    if (!isValidObjectId(pendingId)) {
      return
    }
    await PendingUpload.findByIdAndDelete(pendingId);
  } catch (e) {
    console.warn('removePendingUpload: falha ao apagar documento PendingUpload:', e?.message || e);
  }
}


// =====================================================================================
// cancelSubscriptionWithRefund (mantive, removi calls inválidos: use cancel not del)
// =====================================================================================
async function cancelSubscriptionWithRefund(subscriptionId) {
  try {
    let canceledSubscription = null;
    try {
      // tentar cancelar (API: cancel)
      canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);
      log('[cancelSubscriptionWithRefund] subscription.cancel OK:', subscriptionId);
    } catch (errCancel) {
      console.warn('[cancelSubscriptionWithRefund] Falha ao cancelar subscription:', errCancel?.message || errCancel);
      return { success: false, error: errCancel?.message || String(errCancel) };
    }

    // buscar a última invoice da subscription (se houver) e reembolsar a charge se aplicável
    let refund = null;
    try {
      const invoices = await stripe.invoices.list({ subscription: subscriptionId, limit: 1 });
      if (invoices && Array.isArray(invoices.data) && invoices.data.length > 0) {
        const latestInvoice = invoices.data[0];
        if (latestInvoice.charge) {
          try {
            const charge = await stripe.charges.retrieve(latestInvoice.charge);
            const refundable = Math.max(0, (charge.amount || 0) - (charge.amount_refunded || 0));
            if (refundable > 0) {
              refund = await stripe.refunds.create({ charge: latestInvoice.charge, amount: refundable });
              log('[cancelSubscriptionWithRefund] Refund criado:', refund.id, 'amount:', refund.amount);
            } else {
              log('[cancelSubscriptionWithRefund] Nenhum valor reembolsável na charge:', latestInvoice.charge);
            }
          } catch (errCharge) {
            console.warn('[cancelSubscriptionWithRefund] Falha ao recuperar charge ou criar refund:', errCharge?.message || errCharge);
          }
        } else {
          log('[cancelSubscriptionWithRefund] latestInvoice não tem charge:', latestInvoice.id);
        }
      }
    } catch (errInvoices) {
      console.warn('[cancelSubscriptionWithRefund] Falha ao listar invoices:', errInvoices?.message || errInvoices);
    }

    return { success: true, subscription: canceledSubscription, refund };
  } catch (error) {
    console.error('[cancelSubscriptionWithRefund] Erro ao cancelar assinatura:', error);
    return { success: false, error: error?.message || String(error) };
  }
}

// adicionarSaldoDeImpressoes
export const SessionPaymentSaldoDeImpressoes = async (req, res) => {
  try {
    const { quantidade, userId } = req.body || {};
    if (!userId || !quantidade || isNaN(quantidade) || quantidade <= 0) {
      return res.status(400).json({ success: false, msg: 'userId e quantidade (>0) são obrigatórios' });
    }

    // quantidade = valor em R$ que o cliente quer adicionar
    // 1 real = 300 impressoes
    const valorEmReais = Number(quantidade);
    const impressoesPorReal = 175; // quanto menor mais caro para o cliente. recomendado 50-300
    const saldoDeImpressoes = Math.floor(valorEmReais * impressoesPorReal); // 1 real = impressoesPorReal

    const totalAmount = Math.floor(valorEmReais * 100); // Stripe espera centavos

    // Buscar usuário
    if (!isValidObjectId(userId)) {
      return res.json({ success: false, msg: 'Passe um ID valido' })
    }

    const user = await safeFindById(User, userId)
    if (!user) return res.status(404).json({ success: false, msg: 'Usuário não encontrado' });

    // Buscar ou criar customer no Stripe
    let customerId = user.planInfos?.stripeCustomerId || null;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = customers.data[0]?.id || null;
      if (!customerId) {
        const c = await stripe.customers.create({ email: user.email, metadata: { app_user_id: String(user._id) } });
        customerId = c.id;
        user.planInfos = user.planInfos || {};
        user.planInfos.stripeCustomerId = customerId;
        await user.save();
      }
    }

    // Criar sessão de pagamento única (payment, não subscription)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer: customerId,
      line_items: [{
        price_data: {
          currency: 'brl',
          product_data: {
            name: `Saldo de Impressões (R$${valorEmReais.toFixed(2)})`,
            metadata: { userId }
          },
          unit_amount: 100, // 1 real por unidade
        },
        quantity: valorEmReais, // valorEmReais unidades de R$1
      }],
      success_url: `${process.env.URL}success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}cancel`,
      metadata: {
        app: 'treinai',
        flow: 'saldo_impressoes',
        userId,
        quantidade: saldoDeImpressoes, // saldo de impressões a ser creditado
        valorEmReais
      }
    });

    return res.status(201).json({
      success: true,
      msg: 'Checkout session criada para saldo de impressões.',
      sessionId: session.id,
      url: session.url,
      amount: totalAmount,
      saldoDeImpressoes,
      userId,
    });
  } catch (error) {
    console.error('SessionPaymentSaldoDeImpressoes error:', error);
    return res.status(500).json({ success: false, msg: 'Erro ao criar Checkout Session', error: error?.message || String(error) });
  }
};

// =====================================================================================
// Criar Assinatura / Checkout Session (Subscription)
// - NÃO cria Local definitivo. salva upload em tmp + PendingUpload e envia pendingUploadId na metadata
// =====================================================================================
export const CriarAssinaturaProLocal = async (req, res) => {
  try {
    const {
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

    if (!tipo || !userId) {
      return res.status(400).json({ success: false, msg: 'tipo e userId são obrigatórios' });
    }

    // impedir envio sem imagem (retorna JSON explicando o erro)
    const incomingField = req.file?.fieldname || 'image';
    if (!req.file || !req.file.path) {
      return res.status(400).json({
        success: false,
        msg: 'A imagem é obrigatória para a criação do local. Envie um arquivo de imagem no campo "' + incomingField + '".'
      });
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

    // localizar user (por id) para possivelmente salvar stripeCustomerId
    let user = null;
    try {
      if (isValidObjectId(userId)) {
        user = await safeFindById(User, userId);
      }
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

    // tratar upload: mover para TMP_DIR e criar PendingUpload
    let pendingUpload = null;
    if (req.file && req.file.path) {
      try {
        await ensureDir(TMP_DIR);
        const origPath = req.file.path;
        const filename = req.file.filename || path.basename(origPath);
        const tmpPath = path.join(TMP_DIR, filename);
        // mover do local temporário do multer (ou da pasta default) para our TMP_DIR
        await moveFile(origPath, tmpPath);

        pendingUpload = await PendingUpload.create({
          filename,
          originalName: req.file.originalname || filename,
          userId: String(userId),
          localName: localName || '',
          localDescricao: localDescricao || '',
          localType: tipoNorm,
          link: link || '',
          country: country || '',
          countryCode: countryCode || '',
          state: state || '',
          city: city || '',
          metadata: { app: 'treinai' }
        });
      } catch (err) {
        console.error('CriarAssinaturaProLocal: falha ao mover/upload para tmp ou criar PendingUpload:', err);
        // se falhar, tentar remover arquivo original
        if (req.file?.path) {
          await unlinkIfExists(req.file.path);
        }
        return res.status(500).json({ success: false, msg: 'Erro ao processar upload' });
      }
    }

    // montar metadata da subscription (usar pendingUpload._id se existir)
    const subscriptionMetadata = {
      app: 'treinai',
      flow: 'publish_local',
      pendingUploadId: pendingUpload ? String(pendingUpload._id) : null,
      userId: String(userId),
      link: link || '',
      localType: tipoNorm,
      localName: localName || '',
      localDescricao: localDescricao || '',
      imageTmpFilename: pendingUpload ? pendingUpload.filename : '',
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
      metadata: { app: 'treinai', pendingUploadId: pendingUpload ? String(pendingUpload._id) : null, flow: 'publish_local' },
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
      userId: String(userId),
      customerId: customerId || null,
      payment_method_types_used: session.payment_method_types || [pm],
      pendingUploadId: pendingUpload ? String(pendingUpload._id) : null
    });

  } catch (error) {
    console.error('CreatePayment fatal error:', error?.message || error);
    return res.status(500).json({ success: false, msg: 'Erro ao criar Checkout Session', error: error?.message || String(error) });
  }
};



// =======================
// Create Checkout Session (outro fluxo de planos) - sem mudanças importantes
// =======================
export const CreateCheckoutSession = async (req, res) => {
  // ... (não alterei este bloco no seu código; mantém igual ao que você já tem)
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
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ msg: "Passe um ID valido", success: false })
    }

    const user = await safeFindById(User, userId);
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado' });

    let customerId = user.planInfos?.stripeCustomerId || null;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = customers.data[0]?.id || null;
    }

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
// Webhook Handler (idempotente) - atualizado para lidar com PendingUpload lifecycle
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

  // helpers locais (mantive os seus ensureUserByCustomer/findUserBySubscription/applyManualUpdate)
  const ensureUserByCustomer = async (customerId) => {
    if (!customerId) return null;
    let user = await User.findOne({ 'planInfos.stripeCustomerId': customerId });
    if (user) return user;
    try {
      const customer = await stripe.customers.retrieve(customerId);
      const appUserId = customer?.metadata?.app_user_id || customer?.metadata?.user_id;
      if (appUserId) {
        if (!isValidObjectId(appUserId)) {
          return null
        }
        const byId = await safeFindById(User, appUserId);
        
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

    if (!isValidObjectId(userId)) {
      return null
    }

    const user = await safeFindById(User, userId);
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
      // checkout.session.completed: vincular subscriptionId ao PendingUpload (se houver)
      case 'checkout.session.completed': {
        log('checkout.session.completed');
        const session = data;
        if (!session.metadata || session.metadata.app !== 'treinai') { log('session: origem diferente -> ignorando'); break; }
        const subscriptionId = session.subscription || null;
        const customerId = session.customer || null;

        // atualização de usuário (se aplicável) - mantive sua lógica
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

        // se for fluxo publish_local: vincular subscriptionId ao PendingUpload
        try {
          if (session.metadata.flow && session.metadata.flow === 'publish_local' && session.metadata.pendingUploadId) {
            const pendingId = session.metadata.pendingUploadId;
            let p = null;

            if (isValidObjectId(pendingId)) {
              p = await safeFindById(PendingUpload, pendingId);
            }

            if (p) {
              p.subscriptionId = subscriptionId || p.subscriptionId;
              await p.save();
              log('checkout.session.completed: PendingUpload atualizado com subscriptionId:', pendingId);
            } else {
              log('checkout.session.completed: pendingUploadId não encontrado:', pendingId);
            }
          }
        } catch (errLocal) {
          console.warn('checkout.session.completed: erro ao vincular pending upload:', errLocal?.message || errLocal);
        }

        // --- adicionarSaldoDeImpressoes ---
        // Se for fluxo saldo_impressoes, creditar saldo no usuário
        if (
          (session.metadata && session.metadata.flow === 'saldo_impressoes' && session.metadata.userId && session.metadata.quantidade) ||
          (md && md.flow === 'saldo_impressoes' && md.userId && md.quantidade)
        ) {
          try {
            const userId = (session.metadata && session.metadata.userId) || (md && md.userId);
            const quantidade = parseInt((session.metadata && session.metadata.quantidade) || (md && md.quantidade), 10);
            if (!isNaN(quantidade) && quantidade > 0) {
              let userSaldo = null;
              if (isValidObjectId(userId)) {
                userSaldo = await safeFindById(User, userId);
              }
              if (userSaldo) {
                userSaldo.saldoDeImpressoes = (userSaldo.saldoDeImpressoes || 0) + quantidade;
                await userSaldo.save();
                log(`Saldo de impressões adicionado ao user ${userId}: +${quantidade} (total: ${userSaldo.saldoDeImpressoes})`);
              } else {
                log('saldo_impressoes: usuário não encontrado para userId:', userId);
              }
            }
          } catch (errSaldo) {
            console.error('Erro ao adicionar saldo de impressões:', errSaldo);
          }
        }

        break;
      }

      // invoice.paid -> mover tmp -> final e criar Local definitivo (se houver pendingUploadId)
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        log('invoice.paid handler');
        const invoice = data;
        const invoiceId = invoice.id;
        const subscriptionId = invoice.subscription || null;
        const customerId = invoice.customer || null;
        const invoicePaidFlag = invoice.paid === true || invoice.status === 'paid' || (typeof invoice.amount_paid === 'number' && invoice.amount_paid > 0);
        if (!invoicePaidFlag) { log('invoice não está paga -> ignorando'); break; }

        // Atualizar user (se aplicável) - mantive sua lógica
        let user = null;
        if (invoice.metadata?.user_id) {
          if (isValidObjectId(invoice.metadata.user_id)) {
            user = await safeFindById(User, invoice.metadata.user_id);
          }
        }
        if (!user && customerId) user = await User.findOne({ 'planInfos.stripeCustomerId': customerId });
        if (!user && subscriptionId) user = await User.findOne({ 'planInfos.subscriptionId': subscriptionId });

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

            await user.save();
            log('Usuario ativado via invoice.paid:', user._id);
          }
        } else {
          log('invoice.paid: usuário não encontrado (customer/subscription/metadata).');
        }


        // --- lifecycle do PendingUpload -> criação do Local definitivo ---
        let md = invoice.metadata || {};
        let pendingUploadId = md.pendingUploadId || null;

        // se não vier na invoice, tentar buscar na subscription metadata
        if (!pendingUploadId && subscriptionId) {
          try {
            const subFull = await stripe.subscriptions.retrieve(subscriptionId);
            md = { ...md, ...(subFull?.metadata || {}) };
            pendingUploadId = subFull?.metadata?.pendingUploadId || null;
          } catch (err) {
            log('invoice.paid: falha ao recuperar subscription para metadata (não crítico):', err?.message || err);
          }
        }

        if (pendingUploadId) {
          try {
            let pending = null;
            if (isValidObjectId(pendingUploadId)) {
              pending = await safeFindById(PendingUpload, pendingUploadId);
            }
            if (!pending) {
              log('invoice.paid: pendingUploadId informado, mas não encontrado:', pendingUploadId);
            } else {
              // mover arquivo tmp -> final
              const src = path.join(TMP_DIR, pending.filename);
              const dest = path.join(FINAL_DIR, pending.filename);
              try {
                await ensureDir(FINAL_DIR);
                await moveFile(src, dest);
              } catch (e) {
                console.error('invoice.paid: falha ao mover arquivo tmp->final:', e?.message || e);
                // mesmo se mover falhar, podemos tentar criar local com imageUrl null ou registrar para revisão
              }

              // montar imageUrl a partir de process.env.URL (webhook não tem req)
              const baseUrl = (process.env.BASEURL || '').replace(/\/$/, '');
              const imageUrl = pending.filename ? `${baseUrl}/uploads/image-local/${pending.filename}` : null;

              // checar duplicidade (por userId+localName+localType)
              let exists = null;
              if (pending.userId && pending.localName && pending.localType) {
                exists = await Local.findOne({ userId: pending.userId, localName: pending.localName, localType: pending.localType });
              }
              if (exists) {
                // atualizar subscriptionId/status se necessário
                if (subscriptionId && !exists.subscriptionId) exists.subscriptionId = subscriptionId;
                if (exists.status !== 'ativo') exists.status = 'ativo';
                exists.atualizadoEm = new Date();
                if (imageUrl && !exists.imageUrl) exists.imageUrl = imageUrl;
                await exists.save();
                log('invoice.paid: Local já existia, atualizado a partir do PendingUpload:', exists._id);
              } else {
                // criar Local definitivo
                const payload = {
                  userId: pending.userId,
                  link: pending.link || '',
                  localName: pending.localName,
                  localDescricao: pending.localDescricao || '',
                  localType: pending.localType,
                  imageUrl: imageUrl || null,
                  country: pending.country || null,
                  countryCode: pending.countryCode || null,
                  state: pending.state || null,
                  city: pending.city || null,
                  subscriptionId: subscriptionId || pending.subscriptionId || null,
                  status: 'ativo',
                  criadoEm: new Date(),
                  criadoVia: 'invoice.paid'
                };

                console.log(payload)

                try {
                  const createdLocal = await Local.create(payload);
                  log('invoice.paid: Local criado a partir do PendingUpload:', createdLocal._id);
                } catch (errCreateLocal) {
                  console.error('invoice.paid: erro ao criar Local a partir do PendingUpload:', errCreateLocal);
                }
              }

              // remover PendingUpload (arquivo já movido)
              try {
                if (isValidObjectId(pendingUploadId)) {
                  await PendingUpload.findByIdAndDelete(pendingUploadId);
                }
              } catch (e) {
                console.warn('invoice.paid: falha ao remover PendingUpload (não crítico):', e?.message || e);
              }
            }
          } catch (err) {
            console.error('invoice.paid: erro ao processar pendingUploadId:', err);
          }
          break;
        }

        // Se não houver pendingUploadId, usar seus fallbacks originais (por subscriptionId etc.)
        // (aqui mantenho sua lógica anterior para subscriptionId/metadata sem pendingUpload)
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

        // 3) fallback final: criar a partir da metadata se completa
        if (md.userId && md.localName && md.localType) {
          try {
            const exists = await Local.findOne({ userId: md.userId, localName: md.localName, localType: md.localType });
            if (exists) {
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
                userId: md.userId,
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
        }

        break;
      }

      // payment failed -> remover PendingUpload (se existir) e marcar local inativo (se já existia), NÃO criar Local
      case 'invoice.payment_failed': {
        log('invoice.payment_failed');
        const invoice = data;
        const subscriptionId = invoice.subscription || null;
        const customerId = invoice.customer || null;

        // tentar obter metadata da invoice; se vazio, puxar da subscription
        let md = invoice.metadata && Object.keys(invoice.metadata).length ? invoice.metadata : {};
        if ((!md || Object.keys(md).length === 0) && subscriptionId) {
          try {
            const subFull = await stripe.subscriptions.retrieve(subscriptionId);
            md = { ...(subFull?.metadata || {}) };
          } catch (err) {
            log('invoice.payment_failed: falha ao recuperar subscription metadata (não crítico):', err?.message || err);
            md = md || {};
          }
        }

        const flow = md.flow || null;
        const pendingUploadId = md.pendingUploadId || null;

        // fluxo publish_local: se houver pendingUploadId -> remover tmp + PendingUpload
        if (flow === 'publish_local' && pendingUploadId) {
          try {
            await removePendingUpload(pendingUploadId);
            log('invoice.payment_failed: pendingUpload removido (checkout abandonado ou pagamento falhou):', pendingUploadId);
          } catch (e) {
            console.warn('invoice.payment_failed: falha ao remover pendingUpload:', e?.message || e);
          }
        }

        // além disso, se já existe Local vinculado a essa subscription, marcar inativo (mantive sua lógica segura)
        try {
          if (subscriptionId) {
            const local = await Local.findOne({ subscriptionId });
            if (local) {
              local.status = 'inativo';
              local.paymentFailureInvoiceId = invoice.id;
              local.lastPaymentFailedAt = new Date(evtCreatedMs);
              local.updatedAt = new Date();
              await local.save();
              log('Local existente marcado inativo por invoice.payment_failed:', local._id);
            }
          }
        } catch (e) {
          console.warn('invoice.payment_failed: erro ao marcar local existente inativo (não crítico):', e?.message || e);
        }

        // usuário: marca inativo conforme sua lógica original
        try {
          let user = null;
          if (md.user_id) {
            if (isValidObjectId(md.user_id)) {
              user = await safeFindById(User, md.user_id);
            }
          }
          if (!user && customerId) user = await User.findOne({ 'planInfos.stripeCustomerId': customerId });
          if (!user && subscriptionId) user = await User.findOne({ 'planInfos.subscriptionId': subscriptionId });
          if (user) {
            user.planInfos = user.planInfos || {};
            user.planInfos.status = 'inativo';
            user.planInfos.lastPaymentFailed = invoice.id;
            user.planInfos.lastStripeEventTimestamp = evtCreatedMs;
            await user.save();
            log('Usuário marcado inativo por invoice.payment_failed:', user._id);
          }
        } catch (errUser) {
          console.error('invoice.payment_failed: erro ao marcar usuário inativo:', errUser);
        }

        break;
      }

      // checkout.session.expired -> usuário abandonou checkout: remover pendingUpload (se existir)
      case 'checkout.session.expired': {
        log('checkout.session.expired');
        const session = data;
        // session.metadata.pendingUploadId é o que criamos
        const pendingUploadId = session.metadata?.pendingUploadId || null;
        if (pendingUploadId) {
          try {
            await removePendingUpload(pendingUploadId);
            log('checkout.session.expired: PendingUpload removido (abandonado):', pendingUploadId);
          } catch (e) {
            console.warn('checkout.session.expired: falha ao remover pendingUpload:', e?.message || e);
          }
        }
        break;
      }

      // customer.subscription.deleted -> manter sua lógica, mas não criar/excluir pending uploads
      case 'customer.subscription.deleted': {
        log('customer.subscription.deleted');
        const subscription = data;
        const subscriptionId = subscription.id;
        const customerId = subscription.customer || null;
        const md = subscription.metadata || {};

        // detectar fluxo local
        const metadataIndicatesLocal = (md && (String(md.flow || '').toLowerCase() === 'publish_local' || !!md.pendingUploadId || !!md.pendingLocalId));

        let local = null;
        try {
          local = await Local.findOne({ subscriptionId });
        } catch (err) {
          console.warn('customer.subscription.deleted: erro ao procurar local por subscriptionId:', err);
        }

        if (metadataIndicatesLocal || local) {
          try {
            if (local) {
              local.status = 'inativo';
              local.atualizadoEm = new Date();
              await local.save();
              log('Local marcado inativo por subscription.deleted:', local._id);
            } else {
              log('subscription.deleted indica publish_local mas Local não encontrado (provavelmente já removido):', { subscriptionId, metadata: md });
            }
          } catch (err) {
            console.warn('customer.subscription.deleted: erro ao atualizar local:', err);
          }
        } else {
          try {
            let user = null;
            if (md.user_id) {
              if (isValidObjectId(md.user_id)) {
                user = await safeFindById(User, md.user_id);
              }
            }
            if (!user && customerId) user = await ensureUserByCustomer(customerId);
            if (!user && subscriptionId) user = await findUserBySubscription(subscriptionId);
            if (user) {
              user.planInfos = user.planInfos || {};
              user.planInfos.subscriptionId = null;
              user.planInfos.status = 'inativo';
              user.planInfos.planType = 'free';
              user.planInfos.nextPaymentDate = null;
              user.planInfos.nextPaymentValue = null;
              user.planInfos.lastStripeEventTimestamp = evtCreatedMs;
              await user.save();
              log('Usuário atualizado por subscription.deleted (plano removido):', user._id);
            } else {
              log('customer.subscription.deleted: usuário não encontrado para subscriptionId/customerId.', { subscriptionId, customerId });
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

    let user = null;
    if (isValidObjectId(userId)) {
      user = await safeFindById(User, userId);
    }
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

      // usar helper cancel + refund
      let refundResult = null;
      try {
        const result = await cancelSubscriptionWithRefund(subToCancel.id);
        if (!result.success) {
          console.warn('[atualizarPlano] cancelSubscriptionWithRefund retornou erro:', result.error);
        } else {
          refundResult = result.refund || null;
        }
      } catch (errCancelHelper) {
        console.warn('[atualizarPlano] Erro no cancelSubscriptionWithRefund (não crítico):', errCancelHelper?.message || errCancelHelper);
        // fallback: tentar cancelar simples
        try {
          await stripe.subscriptions.del(subToCancel.id);
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
        refundId: refundResult?.id || null,
        refundAmount: refundResult?.amount || null
      });
    }

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
// deletarLocal atualizado para usar cancelSubscriptionWithRefund
export const deletarLocal = async (req, res) => {
  const { subscriptionId, localId, userId } = req.body || {};

  if (!userId || !localId) {
    return res.status(400).json({ msg: 'userId e localId são obrigatórios' });
  }

  try {
    // buscar local e validar dono (tenta achar por localId campo ou por _id)
    let local = await Local.findOne({ localId }) || await Local.findOne({ localId });
    if (!local) return res.status(404).json({ msg: 'Local não encontrado' });
    if (String(local.userId) !== String(userId)) return res.status(403).json({ msg: 'Não autorizado' });

    // se tiver subscription vinculada (via payload ou via local.subscriptionId), tentar recuperar e cancelar com segurança
    let refundInfo = null;
    let canceledSubscriptionId = null;
    const subId = subscriptionId || local.subscriptionId || null;

    if (subId) {
      try {
        log('deletarLocal: tentando cancelar subscription via cancelSubscriptionWithRefund', subId);
        const result = await cancelSubscriptionWithRefund(subId);

        if (!result) {
          log('deletarLocal: cancelSubscriptionWithRefund retornou vazio para', subId);
        } else if (result.success === false) {
          log('deletarLocal: cancelSubscriptionWithRefund retornou erro (não crítico):', result.error || result);
        } else {
          canceledSubscriptionId = result.subscription?.id || subId;
          if (result.refund) {
            refundInfo = {
              id: result.refund.id,
              amount: result.refund.amount || null,
              status: result.refund.status || null
            };
          }
          log('deletarLocal: cancelSubscriptionWithRefund ok', { canceledSubscriptionId, refundInfo });
        }
      } catch (err) {
        console.warn('deletarLocal: erro ao executar cancelSubscriptionWithRefund (continuando):', err?.message || err);
      }
    } else {
      log('deletarLocal: sem subscription vinculada ao local (ou subscriptionId não fornecido).');
    }

    // apagar local no banco
    try {
      if (local._id) {
        if (isValidObjectId(local._id)) {
          await Local.findByIdAndDelete(local._id);
        }
        log('deletarLocal: Local removido do DB:', local._id);
      } else {
        await Local.findOneAndDelete({ localId });
        log('deletarLocal: Local removido do DB por localId:', localId);
      }
    } catch (errDelete) {
      console.error('deletarLocal: erro ao apagar local do DB:', errDelete);
      return res.status(500).json({ msg: 'Erro ao apagar local do banco', error: errDelete?.message || String(errDelete) });
    }

    return res.json({
      msg: 'Local removido. Subscription cancelada quando aplicável.',
      canceledSubscription: canceledSubscriptionId || null,
      refund: refundInfo
    });
  } catch (error) {
    console.error('deletarLocal: erro geral:', error);
    return res.status(500).json({ msg: 'Erro ao deletar local', error: error?.message || String(error) });
  }
};

