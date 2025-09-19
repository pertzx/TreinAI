import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getBrazilDate } from '../helpers/getBrazilDate.js';

const { Schema } = mongoose;

const ChatSchema = new Schema({
    ChatName: { type: String, required: true },
    ChatId: { type: String, default: uuidv4 },
    criadoEm: { type: Date, default: getBrazilDate },
    ChatDesc: { type: String, required: true },
    pairId: { type: String, default: null },
    membros: [
        {
            userId: { type: String, required: true },
            username: { type: String, required: true },
            membroDesde: { type: Date, default: getBrazilDate },
        },
    ],
    mensagens: [
        {
            userId: { type: String, required: true },
            mensagemId: { type: String, default: uuidv4},
            conteudo: { type: String, required: true },
            vistos: [],
            publicadoEm: {type: Date, default: getBrazilDate}
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
});

// índice único parcial para pairId (só aplica quando pairId existe)
ChatSchema.index(
  { pairId: 1 },
  { unique: true, partialFilterExpression: { pairId: { $exists: true, $ne: null } } }
);

const Chat = mongoose.model('Chat', ChatSchema, 'Chats');

export default Chat;
