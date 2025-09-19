import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getBrazilDate } from '../helpers/getBrazilDate.js';

const { Schema } = mongoose;

const anuncioSchema = new Schema({
  anuncioId: { type: String, required: true, unique: true, index: true, default: () => uuidv4() },
  link: { type: String, required: true },
  userId: { type: String, required: true },
  titulo: { type: String, default: null },
  descricao: { type: String, required: true},
  criadoEm: { type: Date, default: getBrazilDate },
  anuncioTipo: { type: String, enum: ['imagem', 'video'], required: true },
  midiaUrl: { type: String, required: true },
  status: { type: String, enum: ['ativo', 'inativo'], required: true, default: 'ativo' },
  
  estatisticas: {
    impressoes: { type: Number, default: 0 },
    cliques: { type: Number, default: 0 },
  },
  
  // localização humana (país/estado/cidade) — strings simples
  country: { type: String, default: null },
  countryCode: { type: String, default: null },
  state: { type: String, default: null },
  city: { type: String, default: null },

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
if (!anuncioSchema._indexes || !anuncioSchema._indexes.find(i => i[0] && i[0].location)) {
  anuncioSchema.index({ location: '2dsphere' });
}

const Anuncio = mongoose.model('anuncio', anuncioSchema, 'Anuncios');

export default Anuncio