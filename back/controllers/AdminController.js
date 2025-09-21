import Anuncio from "../models/Anuncios.js";
import User from "../models/User.js";
import Support from "../models/Support.js";
import { getBrazilDate } from "../helpers/getBrazilDate.js";
import validator from 'validator';
import mongoose from 'mongoose';

// Validação de ObjectId
const isValidObjectId = (id) => {
    return id && mongoose.Types.ObjectId.isValid(id);
};

// Sanitização de entrada
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return validator.escape(input.trim());
};

export const getUsers = async (req, res) => {
    try {
        const { adminId } = req.body;

        if (!isValidObjectId(adminId)) {
            return res.status(400).json({ msg: 'ID de administrador inválido' });
        }

        const user = await User.findById(adminId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
        }

        // Não retornar senhas e dados sensíveis
        const users = await User.find()
            .select('-password -stats.tokens -stats.ipHistory -stats.deviceHistory')
            .limit(1000) // Limitar quantidade de usuários retornados
            .lean();

        return res.status(200).json({ users, success: true, msg: 'Sucesso ao buscar usuários como admin.' });
    } catch (error) {
        console.error('getUsers error:', error);
        return res.status(500).json({ success: false, msg: "Erro ao buscar usuários.", error: error.message || String(error) });
    }
};

export const getAnunciosByAdmin = async (req, res) => {
    try {
        const { adminId } = req.body;

        if (!isValidObjectId(adminId)) {
            return res.status(400).json({ msg: 'ID de administrador inválido' });
        }

        const user = await User.findById(adminId).select('role');
        if (user.role !== 'admin') {
            return res.status(403).json({ message: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
        }

        // Lógica para buscar anúncios
        const anuncios = await Anuncio.find()
            .limit(1000) // Limitar quantidade
            .lean();

        return res.status(200).json({ anuncios, success: true, msg: 'Sucesso ao buscar anúncios como admin.' });
    } catch (error) {
        console.error('getAnunciosByAdmin error:', error);
        return res.status(500).json({ success: false, msg: "Erro ao buscar anúncios.", error: error.message || String(error) });
    }
}

export const alterarStatusAnuncio = async (req, res) => {
    try {
        const { adminId, anuncioId, novoStatus } = req.body;

        if (!isValidObjectId(adminId)) {
            return res.status(400).json({ msg: 'ID de administrador inválido' });
        }
        
        if (!anuncioId || typeof anuncioId !== 'string') {
            return res.status(400).json({ msg: 'ID do anúncio inválido' });
        }
        
        if (!['ativo', 'inativo'].includes(novoStatus)) {
            return res.status(400).json({ msg: 'Status inválido. Use "ativo" ou "inativo".' });
        }

        const user = await User.findById(adminId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ msg: 'Acesso negado. Apenas administradores podem acessar esta rota.' });
        }
        
        const anuncio = await Anuncio.findOne({ anuncioId });
        if (!anuncio) {
            return res.status(404).json({ msg: 'Anúncio não encontrado.' });
        }

        if (anuncio.status === novoStatus) {
            return res.status(400).json({ msg: `O anúncio já está com o status "${novoStatus}".` });
        }

        anuncio.status = novoStatus;
        await anuncio.save();

        return res.status(200).json({ success: true, msg: `Status do anúncio alterado para "${novoStatus}".`, anuncio });
    } catch (error) {
        console.error('alterarStatusAnuncio error:', error);
        return res.status(500).json({ success: false, msg: "Erro ao alterar status do anúncio.", error: error.message || String(error) });
    }
}

// get /supports-by-admin
export const getSupportsByAdmin = async (req, res) => {
    try {
        // paginação opcional (se não quiser, passe page/perPage ausentes e ele retorna tudo)
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage, 10) || 20));
        const search = (req.query.search || '').toString().trim();
        const adminId = req.query.adminId;

        if (!adminId) return res.json({ msg: 'adminId é obrigatorio', success: false });

        const user = await User.findById(adminId);
        if (!user) return res.json({ msg: 'Não encontrei seu usuario.', success: false });

        if (user && user.role !== 'admin') {
            return res.json({ msg: 'Somente admins podem fazer isso.', success: false });
        }

        // Build filter incrementally so we can combine search + responded + privado
        const and = [];

        // busca opcional em assunto/descricao (OR dentro do $and)
        if (search) {
            and.push({
                $or: [
                    { assunto: { $regex: search, $options: 'i' } },
                    { descricao: { $regex: search, $options: 'i' } }
                ]
            });
        }

        // filtro respondido / não respondido
        const respondedRaw = (req.query.responded || '').toString().toLowerCase(); // e.g. 'responded' | 'unresponded' | 'all' | 'true' | 'false'
        if (respondedRaw && respondedRaw !== 'all') {
            if (['responded', 'true', '1'].includes(respondedRaw)) {
                // resposta existe e não é string vazia
                and.push({ resposta: { $exists: true, $ne: null }, });
            } else if (['unresponded', 'false', '0'].includes(respondedRaw)) {
                // resposta inexistente ou vazia
                and.push({
                    $or: [
                        { resposta: { $exists: false } },
                        { resposta: null },
                        { resposta: '' }
                    ]
                });
            }
        }

        // opcional: filtrar por privado (privado=true|false)
        if (typeof req.query.privado !== 'undefined') {
            const pRaw = req.query.privado.toString().toLowerCase();
            const pBool = ['true', '1', 'yes'].includes(pRaw);
            and.push({ privado: pBool });
        }

        // combine into filter
        const filter = and.length ? { $and: and } : {};

        // total usando mesmo filter
        const total = await Support.countDocuments(filter);

        const supports = await Support.find(filter)
            .sort({ createdAt: -1 })
            .skip((page - 1) * perPage)
            .limit(perPage)
            .populate({ path: 'userId', select: 'name email' })
            .lean();

        return res.status(200).json({
            supports,
            pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
            success: true,
            msg: 'Sucesso ao buscar pedidos de suporte.'
        });
    } catch (error) {
        console.error('getSupports error:', error);
        return res.status(500).json({
            success: false,
            msg: "Erro ao buscar pedidos de suporte.",
            error: error.message || String(error)
        });
    }
}

export const adicionarRespostaSupport = async (req, res) => {
    try {
        const { adminId, supportId, resposta } = req.body;

        // Verificações basicas
        if (!adminId) return res.json({ msg: 'adminId é obrigatorio', success: false })

        const user = await User.findById(adminId)
        if (!user) return res.json({ msg: 'Não encontrei seu usuario.', success: false })

        if (user && user.role !== 'admin') {
            return res.json({ msg: 'Somente admins podem fazer isso.', success: false })
        }

        // logica
        if (!supportId) return res.json({ msg: 'supportId é obrigatorio', success: false })

        const support = await Support.findOne({ supportId });

        if (!support) return res.json({ msg: 'Não encontrei o pedido de ajuda.', success: false })

        if (!resposta) return res.json({ msg: 'Você nao passou a resposta', success: false })

        support.resposta = resposta
        support.respondidoEm = getBrazilDate();

        await support.save()
    } catch (error) {
        return res.json({ msg: "Erro ao adicionar resposta", success: false, error })
    }
}

export const alterarVisibilidadeSuporte = async (req, res) => {
    try {
        const { adminId, supportId } = req.body
        let { boolean } = req.body

        if (!adminId) return res.json({ msg: 'adminId é obrigatório', success: false })

        const user = await User.findById({ where: { ...(adminId && { adminId }) } })
        if (!user) return res.json({ msg: 'Não encontrei seu usuário.', success: false })
        if (user.role !== 'admin') return res.json({ msg: 'Somente admins podem fazer isso.', success: false })

        if (!supportId) return res.json({ msg: 'supportId é obrigatório', success: false })

        const support = await Support.findOne({ supportId })
        if (!support) return res.json({ msg: 'Não encontrei o pedido de ajuda.', success: false })

        if (typeof boolean === 'undefined' || boolean === null) {
            return res.json({ msg: 'Você não passou o boolean', success: false })
        }

        // aceitar 'true'/'false' de strings e outros formatos
        if (typeof boolean === 'string') {
            if (boolean === 'true' || boolean === '1') boolean = true
            else if (boolean === 'false' || boolean === '0') boolean = false
        }
        boolean = !!boolean

        if (support.privado === boolean) {
            return res.json({ msg: 'Esse valor já existe.', success: false })
        }

        support.privado = boolean
        const saved = await support.save()

        return res.json({ msg: 'Visibilidade atualizada', success: true, support: saved })
    } catch (error) {
        console.error('alterarVisibilidadeSuporte error', error)
        return res.status(500).json({ msg: 'Erro ao alterar visibilidade', success: false, error: error.message })
    }
}
