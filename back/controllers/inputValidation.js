import validator from 'validator';
import mongoose from 'mongoose';

// Validação de ObjectId
export const isValidObjectId = (id) => {
    return id && mongoose.Types.ObjectId.isValid(id);
};

// Sanitização de entrada
export const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    return validator.escape(input.trim());
};

// Validação de URL
export const isValidUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
        return false;
    }
};

// Validações específicas
export const validateInput = {
    email: (email) => {
        if (!email || typeof email !== 'string') return 'Email é obrigatório';
        if (!validator.isEmail(email)) return 'Email inválido';
        if (email.length > 254) return 'Email muito longo';
        return null;
    },
    
    password: (password) => {
        if (!password || typeof password !== 'string') return 'Senha é obrigatória';
        if (password.length < 8) return 'Senha deve ter pelo menos 8 caracteres';
        if (password.length > 128) return 'Senha muito longa';
        if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
            return 'Senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula e 1 número';
        }
        return null;
    },
    
    username: (username) => {
        if (!username || typeof username !== 'string') return 'Nome de usuário é obrigatório';
        if (username.length < 2) return 'Nome deve ter pelo menos 2 caracteres';
        if (username.length > 50) return 'Nome muito longo';
        if (!/^[a-zA-Z0-9\s\-_]+$/.test(username)) return 'Nome contém caracteres inválidos';
        return null;
    },
    
    objectId: (id, fieldName = 'ID') => {
        if (!id) return `${fieldName} é obrigatório`;
        if (!isValidObjectId(id)) return `${fieldName} inválido`;
        return null;
    },
    
    url: (url, fieldName = 'URL') => {
        if (!url || typeof url !== 'string') return `${fieldName} é obrigatória`;
        if (!isValidUrl(url)) return `${fieldName} inválida`;
        return null;
    },
    
    text: (text, fieldName = 'Campo', minLength = 1, maxLength = 1000) => {
        if (!text || typeof text !== 'string') return `${fieldName} é obrigatório`;
        const trimmed = text.trim();
        if (trimmed.length < minLength) return `${fieldName} deve ter pelo menos ${minLength} caracteres`;
        if (trimmed.length > maxLength) return `${fieldName} deve ter no máximo ${maxLength} caracteres`;
        return null;
    },
    
    number: (num, fieldName = 'Número', min = null, max = null) => {
        if (num === null || num === undefined) return `${fieldName} é obrigatório`;
        const n = Number(num);
        if (!Number.isFinite(n)) return `${fieldName} deve ser um número válido`;
        if (min !== null && n < min) return `${fieldName} deve ser pelo menos ${min}`;
        if (max !== null && n > max) return `${fieldName} deve ser no máximo ${max}`;
        return null;
    },
    
    enum: (value, allowedValues, fieldName = 'Campo') => {
        if (!allowedValues.includes(value)) {
            return `${fieldName} deve ser um dos valores: ${allowedValues.join(', ')}`;
        }
        return null;
    }
};

// Middleware de validação para rotas
export const validateRequest = (validations) => {
    return (req, res, next) => {
        const errors = [];
        
        for (const [field, validation] of Object.entries(validations)) {
            const value = req.body[field] || req.query[field] || req.params[field];
            const error = validation(value);
            if (error) {
                errors.push({ field, error });
            }
        }
        
        if (errors.length > 0) {
            return res.status(400).json({
                msg: 'Dados de entrada inválidos',
                errors: errors.reduce((acc, { field, error }) => {
                    acc[field] = error;
                    return acc;
                }, {})
            });
        }
        
        next();
    };
};

// Sanitização de objeto completo
export const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            sanitized[key] = sanitizeInput(value);
        } else if (Array.isArray(value)) {
            sanitized[key] = value.map(item => 
                typeof item === 'string' ? sanitizeInput(item) : item
            );
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
};