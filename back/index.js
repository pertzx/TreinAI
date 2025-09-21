// server.js
import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cors from 'cors';
import authRoutes from './routes/authRoutes.js';
import { StripeWebhook } from './controllers/stripe.js';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss';

// cria __filename e __dirname em ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();
const app = express();

// Validar variáveis de ambiente críticas
if (!process.env.SECRET_JWT || process.env.SECRET_JWT === 'chave_secreta') {
    console.error('CRITICAL: SECRET_JWT não está configurado ou usando valor padrão!');
    process.exit(1);
}

if (!process.env.DB_PASSWORD || !process.env.DB_USER) {
    console.error('CRITICAL: Credenciais do banco de dados não configuradas!');
    process.exit(1);
}

// Helmet para headers de segurança
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            scriptSrc: ["'self'"],
            connectSrc: ["'self'", "https://api.stripe.com"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

// Stripe Webhook (usa raw body)
app.post('/webhook', express.raw({ type: 'application/json' }), StripeWebhook);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // 100 requisições por IP
  message: { msg: "Muitas requisições. Tente novamente mais tarde." },
  standardHeaders: true,
  legacyHeaders: false,
})

// CORS configurado adequadamente
const corsOptions = {
    origin: function (origin, callback) {
        // Lista de origens permitidas
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'https://your-production-domain.com'
        ];
        
        // Permitir requests sem origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Não permitido pelo CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

// Outros middlewares
app.use(limiter);
app.use(cors(corsOptions));

// Proteção contra NoSQL injection
app.use(mongoSanitize());

// Middleware para sanitizar XSS
app.use((req, res, next) => {
    if (req.body && typeof req.body === 'object') {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = xss(req.body[key]);
            }
        }
    }
    next();
});

app.use(express.json({ limit: '10mb' })); // Limitar tamanho do payload
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos com headers de segurança
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Middleware de log de segurança
app.use((req, res, next) => {
    // Log de tentativas suspeitas
    const suspiciousPatterns = [
        /\.\./,  // path traversal
        /<script/i,  // XSS
        /union.*select/i,  // SQL injection
        /javascript:/i,  // javascript protocol
    ];
    
    const fullUrl = req.originalUrl + JSON.stringify(req.body);
    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(fullUrl));
    
    if (isSuspicious) {
        console.warn(`SECURITY: Suspicious request from ${req.ip}: ${req.method} ${req.originalUrl}`);
        return res.status(400).json({ msg: 'Requisição inválida' });
    }
    
    next();
});

// Conexão com MongoDB
const MONGO_URI = `mongodb+srv://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASSWORD)}@cluster0.vcxrbu2.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI, {
        maxPoolSize: 10, // Limitar conexões
        serverSelectionTimeoutMS: 5000, // Timeout
        socketTimeoutMS: 45000,
    });
    console.log('✅ Banco de dados conectado com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    process.exit(1);
  }
}

connectDB()

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    
    // Não vazar informações em produção
    if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({ msg: 'Erro interno do servidor' });
    }
    
    return res.status(500).json({ 
        msg: 'Erro interno do servidor', 
        error: err.message 
    });
});

// Rotas
app.use('/', authRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ msg: 'Rota não encontrada' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔒 Modo: ${process.env.NODE_ENV || 'development'}`);
});
