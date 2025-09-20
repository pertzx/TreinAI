import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getBrazilDate } from '../helpers/getBrazilDate.js';

const { Schema } = mongoose;

const supportSchema = new Schema({
  supportId: { type: String, required: true, unique: true, index: true, default: () => uuidv4() },
  userId: { type: String, required: true },
  userEmail: { type: String, required: true },
  assunto: { type: String, required: true },
  descricao: { type: String, required: true },
  resposta: { type: String, default: null },
  criadoEm: { type: Date, default: getBrazilDate },
  respondidoEm: { type: Date, default: null },
  privado: { type: Boolean, default: true  }, // se true, só o usuário e admins podem ver. se false, visível a todos os usuários (ex: dúvidas comuns)
})

const Support = mongoose.model('Support', supportSchema, 'Supports');

export default Support;