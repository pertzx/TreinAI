import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { getBrazilDate } from '../helpers/getBrazilDate.js';

const { Schema } = mongoose;

const ExercicioSchema = new Schema({
    exercicioName: { type: String, required: true },
    imageUrl: { type: String, required: true },
    criadoEm: { type: Date, default: getBrazilDate },
    reports: [
        {
            userId: {type: String, required: true},
            username: { type: String, required: true },
            explanation: { type: String, required: true },
            criadoEm: { type: Date, default: getBrazilDate },
        }
    ]
});

const Exercicio = mongoose.model('Exercicio', ExercicioSchema, 'exercicios');

export default Exercicio;
