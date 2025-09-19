import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getBrazilDate } from '../helpers/getBrazilDate.js';

const { Schema } = mongoose;

const LocalSchema = new Schema({
  localName: { type: String, required: true },
  status: { type: String, required: true },
  subscriptionId: { type: String, required: true },
  link: { type: String, required: true },
  localType: { type: String, enum: ['clinica-de-fisioterapia', 'academia', 'consultorio-de-nutricionista', 'loja', 'outros'], required: true },
  estatisticas: {
    impressoes: { type: Number, default: 0 },
    cliques: { type: Number, default: 0 },
  },
  localId: { type: String, default: () => uuidv4() },
  userId: { type: String, required: true },
  localDescricao: { type: String, required: true, default: 'Local dedicado.' },
  imageUrl: { type: String, default: null },
  criadoEm: { type: Date, default: getBrazilDate },
  atualizadoEm: { type: Date, default: null },

  // localização humana (país/estado/cidade) — strings simples
  country: { type: String, required: true },
  countryCode: { type: String, required: true },
  state: { type: String, required: true },
  city: { type: String, required: true },

  // localização geoespacial opcional — somente presente se houver coords válidas
  location: {
    type: {
      type: String,
      enum: ['Point'],
      // **Não** definir default aqui que insira { type: 'Point' } sem coordinates.
    },
    coordinates: {
      type: [Number], // [lng, lat]
    }
  },
  avaliacoes: [
    {
      userId: { type: String, required: true },
      username: { type: String, required: true },
      aceito: { type: Boolean, default: false },
      estrelas: { type: Number, enum: [0, 1, 2, 3, 4, 5], required: true},
      mensagem: { type: String, default: null },
    }
  ],
  reports: [
    {
      userId: { type: String, required: true },
      username: { type: String, required: true },
      explanation: { type: String, required: true },
      criadoEm: { type: Date, default: getBrazilDate },
    }
  ]
}, {
  timestamps: true,
  versionKey: false
});

// Create 2dsphere index only if not already present
// Avoid calling schema.index(...) twice in different files.
if (!LocalSchema._indexes || !LocalSchema._indexes.find(i => i[0] && i[0].location)) {
  LocalSchema.index({ location: '2dsphere' });
}

const Local = mongoose.model('Local', LocalSchema, 'Locais');

export default Local;
