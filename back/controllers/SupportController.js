import Support from "../models/Support.js";
import User from "../models/User.js";

/**
 * GET /supports
 * Query params opcionais:
 *  - page (default 1)
 *  - perPage (default 20)
 *  - privado (optional: 'true'|'false')  => filtra por privado
 *  - search (texto para buscar em assunto/descricao)
 *  - sort (ex: '-createdAt' | 'createdAt' | 'assunto')
 */
// getSupports - retorna SOMENTE supports com privado === false
export const getSupports = async (req, res) => {
  try {
    // paginação opcional (se não quiser, passe page/perPage ausentes e ele retorna tudo)
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.perPage, 10) || 20));
    const search = (req.query.search || '').toString().trim();

    // filtro FORÇADO: apenas públicos
    const filter = { privado: false };

    // busca opcional em assunto/descricao
    if (search) {
      filter.$or = [
        { assunto: { $regex: search, $options: 'i' } },
        { descricao: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Support.countDocuments(filter);

    const supports = await Support.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .select('assunto resposta respondidoEm descricao privado criadoEm createdAt updatedAt')
      // .populate({ path: 'userId', select: 'name email' })
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

/**
 * POST /supports (pedirSuporte)
 * Body esperados:
 *  - userId (required)
 *  - userEmail (required)  // será preferencialmente substituído pelo email do user no DB quando possível
 *  - assunto (required)
 *  - descricao (required)
 */
export const pedirSuporte = async (req, res) => {
  const { userId, userEmail, assunto, descricao } = req.body;

  if (!userId) return res.status(400).json({ msg: '!userId', success: false });
  if (!userEmail) return res.status(400).json({ msg: '!userEmail', success: false });
  if (!assunto) return res.status(400).json({ msg: '!assunto', success: false });
  if (!descricao) return res.status(400).json({ msg: '!descricao', success: false });

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ msg: 'Usuário não encontrado.', success: false });

    const newSupport = await Support.create(
      { userId, userEmail, assunto, descricao }
    )

    return res.status(201).json({ support: newSupport, success: true, msg: 'Pedido de suporte criado com sucesso.' });
  } catch (error) {
    return res.status(500).json({ success: false, msg: "Erro ao criar pedido de suporte.", error: error.message || String(error) });
  }
}
