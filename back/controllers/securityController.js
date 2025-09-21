import User from '../models/User.js';
import { getBrazilDate } from '../helpers/getBrazilDate.js';

// Log de eventos de segurança
const logSecurityEvent = async (userId, event, details = {}) => {
    try {
        console.log(`SECURITY EVENT: ${event}`, {
            userId,
            timestamp: new Date().toISOString(),
            ...details
        });
        
        // Aqui você pode salvar em uma collection de logs de segurança
        // ou enviar para um serviço de monitoramento
        
    } catch (error) {
        console.error('Erro ao logar evento de segurança:', error);
    }
};

// Verificar tentativas de login suspeitas
export const checkSuspiciousActivity = async (req, res, next) => {
    try {
        const ip = req.ip;
        const userAgent = req.headers['user-agent'];
        
        // Verificar se há muitas tentativas de IPs diferentes para o mesmo email
        if (req.body.email) {
            const recentAttempts = await User.aggregate([
                {
                    $match: {
                        email: req.body.email,
                        'stats.lastFailedLogin': {
                            $gte: new Date(Date.now() - 60 * 60 * 1000) // última hora
                        }
                    }
                },
                {
                    $project: {
                        'stats.ipHistory': 1
                    }
                }
            ]);
            
            if (recentAttempts.length > 0) {
                const uniqueIPs = new Set(recentAttempts[0]?.stats?.ipHistory || []);
                if (uniqueIPs.size > 10) { // Mais de 10 IPs diferentes
                    await logSecurityEvent(null, 'SUSPICIOUS_LOGIN_PATTERN', {
                        email: req.body.email,
                        uniqueIPs: uniqueIPs.size,
                        currentIP: ip
                    });
                    
                    return res.status(429).json({
                        msg: 'Atividade suspeita detectada. Conta temporariamente bloqueada.'
                    });
                }
            }
        }
        
        next();
    } catch (error) {
        console.error('Erro ao verificar atividade suspeita:', error);
        next();
    }
};

// Middleware para detectar bots
export const detectBots = (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    
    const botPatterns = [
        /bot/i,
        /crawler/i,
        /spider/i,
        /scraper/i,
        /curl/i,
        /wget/i,
        /python/i,
        /requests/i
    ];
    
    const isBot = botPatterns.some(pattern => pattern.test(userAgent));
    
    if (isBot && req.path.includes('/api/')) {
        console.warn(`Bot detected: ${userAgent} from ${req.ip}`);
        return res.status(403).json({ msg: 'Acesso negado para bots' });
    }
    
    next();
};

// Middleware para validar origem das requisições
export const validateOrigin = (req, res, next) => {
    const origin = req.headers.origin;
    const referer = req.headers.referer;
    
    // Lista de origens permitidas
    const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://your-production-domain.com'
    ];
    
    // Para requisições AJAX, verificar origin
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || 
        req.headers['content-type']?.includes('application/json')) {
        
        if (origin && !allowedOrigins.includes(origin)) {
            console.warn(`Invalid origin: ${origin} from ${req.ip}`);
            return res.status(403).json({ msg: 'Origem não autorizada' });
        }
    }
    
    next();
};

// Middleware para prevenir timing attacks
export const preventTimingAttacks = (req, res, next) => {
    const start = process.hrtime.bigint();
    
    res.on('finish', () => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000; // Convert to milliseconds
        
        // Se a resposta foi muito rápida (possível timing attack)
        if (duration < 100 && res.statusCode === 401) {
            // Adicionar delay aleatório para mascarar timing
            setTimeout(() => {}, Math.random() * 200 + 100);
        }
    });
    
    next();
};

export { logSecurityEvent };