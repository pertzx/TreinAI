import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import validator from 'validator';

// Rate limiting para diferentes tipos de operações
export const createRateLimit = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message: { msg: message },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            console.warn(`Rate limit exceeded for IP: ${req.ip}, Route: ${req.path}`);
            res.status(429).json({ msg: message });
        }
    });
};

// Slow down para operações custosas
export const createSlowDown = (windowMs, delayAfter, delayMs) => {
    return slowDown({
        windowMs,
        delayAfter,
        delayMs,
        maxDelayMs: delayMs * 10
    });
};

// Rate limits específicos
export const authRateLimit = createRateLimit(15 * 60 * 1000, 5, 'Muitas tentativas de autenticação');
export const apiRateLimit = createRateLimit(1 * 60 * 1000, 60, 'Muitas requisições à API');
export const uploadRateLimit = createRateLimit(5 * 60 * 1000, 10, 'Muitos uploads');
export const aiRateLimit = createRateLimit(1 * 60 * 1000, 20, 'Muitas requisições à IA');

// Slow down para operações de IA
export const aiSlowDown = createSlowDown(1 * 60 * 1000, 10, 1000);

// Middleware de validação de entrada
export const validateAndSanitize = (req, res, next) => {
    // Sanitizar query parameters
    if (req.query) {
        for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
                req.query[key] = validator.escape(value.trim());
            }
        }
    }
    
    // Sanitizar body (já feito no index.js com xss, mas reforçando)
    if (req.body && typeof req.body === 'object') {
        for (const [key, value] of Object.entries(req.body)) {
            if (typeof value === 'string') {
                req.body[key] = validator.escape(value.trim());
            }
        }
    }
    
    next();
};

// Middleware de log de segurança
export const securityLogger = (req, res, next) => {
    const startTime = Date.now();
    
    // Log da requisição
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`);
    
    // Override do res.json para logar respostas de erro
    const originalJson = res.json;
    res.json = function(data) {
        const duration = Date.now() - startTime;
        
        if (res.statusCode >= 400) {
            console.warn(`Security Alert - ${res.statusCode} response in ${duration}ms - ${req.method} ${req.path} - IP: ${req.ip}`);
        }
        
        return originalJson.call(this, data);
    };
    
    next();
};

// Middleware para detectar tentativas de ataque
export const detectAttacks = (req, res, next) => {
    const suspiciousPatterns = [
        /\.\./,  // path traversal
        /<script/i,  // XSS
        /union.*select/i,  // SQL injection
        /javascript:/i,  // javascript protocol
        /data:text\/html/i,  // data URI XSS
        /vbscript:/i,  // VBScript
        /onload=/i,  // event handlers
        /onerror=/i,
        /onclick=/i,
        /eval\(/i,  // eval injection
        /expression\(/i,  // CSS expression
        /import\s*\(/i,  // dynamic imports
    ];
    
    const checkString = (str) => {
        return suspiciousPatterns.some(pattern => pattern.test(str));
    };
    
    const checkObject = (obj) => {
        if (typeof obj === 'string') return checkString(obj);
        if (Array.isArray(obj)) return obj.some(checkObject);
        if (obj && typeof obj === 'object') {
            return Object.values(obj).some(checkObject);
        }
        return false;
    };
    
    const fullUrl = req.originalUrl;
    const body = req.body;
    const query = req.query;
    
    if (checkString(fullUrl) || checkObject(body) || checkObject(query)) {
        console.error(`SECURITY ALERT: Attack attempt detected from ${req.ip}: ${req.method} ${req.originalUrl}`);
        return res.status(400).json({ msg: 'Requisição contém conteúdo suspeito' });
    }
    
    next();
};

// Middleware para validar Content-Type em uploads
export const validateContentType = (allowedTypes = ['multipart/form-data']) => {
    return (req, res, next) => {
        const contentType = req.headers['content-type'];
        
        if (!contentType) {
            return res.status(400).json({ msg: 'Content-Type obrigatório' });
        }
        
        const isAllowed = allowedTypes.some(type => contentType.includes(type));
        
        if (!isAllowed) {
            return res.status(400).json({ 
                msg: `Content-Type não permitido. Tipos aceitos: ${allowedTypes.join(', ')}` 
            });
        }
        
        next();
    };
};

// Middleware para limitar tamanho de arquivos
export const limitFileSize = (maxSizeBytes) => {
    return (req, res, next) => {
        if (req.file && req.file.size > maxSizeBytes) {
            return res.status(400).json({ 
                msg: `Arquivo muito grande. Tamanho máximo: ${Math.round(maxSizeBytes / 1024 / 1024)}MB` 
            });
        }
        next();
    };
};