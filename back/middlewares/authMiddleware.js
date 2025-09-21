import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const SECRET_JWT = process.env.SECRET_JWT || 'chave_secreta';

// Rate limiting para autenticação
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // máximo 5 tentativas por IP
    message: { msg: "Muitas tentativas de login. Tente novamente em 15 minutos." },
    standardHeaders: true,
    legacyHeaders: false,
});

export const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ msg: 'Token de autorização obrigatório' });
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ msg: "Token não fornecido!" });
    }

    if (!SECRET_JWT || SECRET_JWT === 'chave_secreta') {
        console.error('SECURITY WARNING: Using default JWT secret!');
        return res.status(500).json({ msg: "Configuração de segurança inválida" });
    }

    jwt.verify(token, SECRET_JWT, (err, decoded) => {
        if (err) {
            console.log(err);
            return res.status(403).json({ msg: "Token inválido ou expirado!" });
        }
        
        req.userEmail = decoded.email;
        req.userId = decoded.userId; // Adicionar userId para facilitar validações
        next();
    });
};

// Middleware para validar se usuário é admin
export const requireAdmin = async (req, res, next) => {
    try {
        const User = (await import('../models/User.js')).default;
        const user = await User.findOne({ email: req.userEmail }).select('role');
        
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ msg: 'Acesso negado. Apenas administradores.' });
        }
        
        req.adminUser = user;
        next();
    } catch (error) {
        return res.status(500).json({ msg: 'Erro ao verificar permissões' });
    }
};

// Middleware para validar ownership de recursos
export const validateOwnership = (resourceField = 'userId') => {
    return async (req, res, next) => {
        try {
            const User = (await import('../models/User.js')).default;
            const user = await User.findOne({ email: req.userEmail }).select('_id role');
            
            if (!user) {
                return res.status(404).json({ msg: 'Usuário não encontrado' });
            }
            
            // Admin pode acessar qualquer recurso
            if (user.role === 'admin') {
                req.currentUser = user;
                return next();
            }
            
            // Verificar se o recurso pertence ao usuário
            const resourceUserId = req.body[resourceField] || req.query[resourceField] || req.params[resourceField];
            
            if (resourceUserId && String(resourceUserId) !== String(user._id)) {
                return res.status(403).json({ msg: 'Acesso negado ao recurso' });
            }
            
            req.currentUser = user;
            next();
        } catch (error) {
            return res.status(500).json({ msg: 'Erro ao validar propriedade do recurso' });
        }
    };
};
