import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getBrazilDate } from '../helpers/getBrazilDate.js';

const { Schema } = mongoose;

const ReceitaSchema = new Schema({
    ReceitaName: { type: String, required: true },
    imageUrl: { type: String, required: true },
    criadoEm: { type: Date, default: getBrazilDate},
    processada: {type: Boolean, default: false},
    receitaDesc: { type: String, required: true },
    reports: [
        {
            userId: {type: String, required: true},
            username: { type: String, required: true },
            explanation: { type: String, required: true },
            criadoEm: { type: Date, default: getBrazilDate},
        }
    ]
});

const Receita = mongoose.model('Receita', ReceitaSchema, 'Receitas');

export default Receita;
