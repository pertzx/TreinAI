import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getBrazilDate } from '../helpers/getBrazilDate.js';
import validator from 'validator';

const { Schema } = mongoose;

const UserSchema = new Schema({
  username: { 
    type: String, 
    required: true, 
    trim: true,
    minlength: 2,
    maxlength: 50,
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9\s\-_]+$/.test(v);
      },
      message: 'Username contém caracteres inválidos'
    }
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    validate: {
      validator: validator.isEmail,
      message: 'Email inválido'
    }
  },
  password: { type: String, required: true },
  avatar: { type: String, default: null },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  isCoach: { type: Boolean, default: false },
  saldoDeImpressoes: { type: Number, default: 0 },

  planInfos: {
    status: { type: String, enum: ['ativo', 'inativo'], default: 'inativo' },
    planType: { type: String, enum: ['free', 'pro', 'max', 'coach'], default: 'free' },
    expirationDate: { type: Date, default: null },
    subscriptionId: { type: String, default: null },
    stripeCustomerId: { type: String, default: null },
    lastStripeEventTimestamp: { type: Number, default: null },
    nextPaymentValue: { type: String, default: null }, // coloquei como string porque o valor pode nao ser inteiro. mas é so converter pra Number/String em Back/Front.
    nextPaymentDate: { type: Date, default: null }
  },

  preferences: {
    theme: { type: String, enum: ['light', 'dark'], default: 'dark' },
    language: { type: String, enum: ['pt', 'en'], default: 'pt' },
    notifications: { type: Boolean, default: true },
    onboardCompleted: { type: Boolean, default: false },
  },

  perfil: {
    objetivo: {
      type: String,
      default: 'saude'
    },
    pesoAtual: [
      {
        id: { type: String, default: () => uuidv4() },
        valor: { 
          type: Number, 
          default: 65,
          min: 20,
          max: 500
        },
        publicadoEm: { type: Date, default: getBrazilDate }
      }
    ],
    altura: [
      {
        id: { type: String, default: () => uuidv4() },
        valor: { 
          type: Number, 
          default: 174,
          min: 50,
          max: 300
        },
        publicadoEm: { type: Date, default: getBrazilDate }
      }
    ],
    nivelExperiencia: { type: String, enum: ['iniciante', 'intermediario', 'avancado'], default: 'iniciante' },
    idade: { 
      type: Number, 
      default: null,
      min: 13,
      max: 120
    },
    genero: { type: String, enum: ['masculino', 'feminino', 'outro'], default: 'outro' },
    country: { type: String, default: null },
    state: { type: String, default: null },
    city: { type: String, default: null },
  },

  meusTreinos: [
    {
      treinoId: { type: String, default: () => uuidv4() },
      treinoName: { type: String, required: true },
      ordem: { type: Number, required: true },
      descricao: { type: String, default: '' },
      exercicios: [
        {
          exercicioId: { type: String, default: () => uuidv4() },
          ordem: { type: Number, required: true },
          musculo: { type: String, required: true },
          nome: { type: String, required: true },
          instrucoes: { type: String, required: true },
          series: { type: Number, required: true },
          repeticoes: { type: Number, required: true },
          pse: { type: Number, default: 0 },
        }
      ],
      criadoEm: { type: Date, default: getBrazilDate },
    }
  ],

  historico: [
    {
      treinoId: { type: String },
      treinoName: { type: String, required: true },
      dataExecucao: { type: Date, required: false, default: getBrazilDate },
      duracao: { type: Number, default: 0 },
      exerciciosFeitos: [
        {
          exercicioId: { type: String },
          nome: String,
          seriesConcluidas: Number,
          repeticoesPorSerie: Number,
        }
      ]
    }
  ],

  stats: {
    loginCount: { type: Number, default: 0 },
    lastLogin: { type: Date, default: null },
    ipHistory: [{ 
      type: String,
      validate: {
        validator: function(v) {
          return validator.isIP(v) || validator.isFQDN(v);
        },
        message: 'IP inválido'
      }
    }],
    tokens: [
      {
        valor: { type: Number, default: 0 },
        data: { type: Date, default: getBrazilDate },
      }
    ],
    deviceHistory: [{ type: String }],
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastFailedLogin: { type: Date, default: null },
    onboarded: { type: Boolean, default: false },
  },

  onboarding: {
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completed: { type: Boolean, default: false },
  },

  coachId: { type: String, default: null },
  coachsId: {
    ['personal-trainner']: { type: String, default: null },
    ['fisioterapeuta']: { type: String, default: null },
    ['nutricionista']: { type: String, default: null },
  },

  nutriInfos: {
    criadoEm: { type: Date, default: getBrazilDate },
    atualizadoEm: { type: Date, default: getBrazilDate },
    restricoes: { type: String, default: null },
    planoNutricional: [
      {
        horaDoDia: { type: String, required: true }, // inicio da manha, manha, inicio da tarde, tarde, inicio da noite,noite
        conteudo: { type: String, required: true },
      }
    ]
  }

}, { timestamps: true });

// Índices para performance e segurança
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ 'stats.lockedUntil': 1 });

// Middleware para hash de senha antes de salvar
UserSchema.pre('save', async function(next) {
    // Se a senha foi modificada e não está hasheada
    if (this.isModified('password') && !this.password.startsWith('$2b$')) {
        const bcrypt = await import('bcrypt');
        this.password = await bcrypt.default.hash(this.password, 10);
    }
    next();
});

// Método para remover dados sensíveis
UserSchema.methods.toSafeObject = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.stats?.tokens;
    delete obj.stats?.ipHistory;
    delete obj.stats?.deviceHistory;
    return obj;
};

const User = mongoose.model('User', UserSchema, 'users');

export default User;
