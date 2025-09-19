import Exercicio from "../models/Exercicio.js";
import User from "../models/User.js";

export const procurarExercicio = async (req, res) => {
    const { exercicioName, email } = req.query;

    if (!exercicioName || !email) {
        const missing = [];
        if (!exercicioName) missing.push('exercicioName');
        if (!email) missing.push('email');
        return res.status(400).json({ ok: false, msg: 'Missing params', missing });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ ok: false, msg: 'User not found' });

        // case-insensitive exact match (helps with accents/case)
        const exercicio = await Exercicio.findOne({ exercicioName: new RegExp(`^${exercicioName}$`, 'i') });

        if (!exercicio) return res.status(200).json({ ok: true, found: false, msg: 'Exercicio nao encontrado' });

        return res.status(200).json({ ok: true, found: true, exercicio });
    } catch (error) {
        console.error('procurarExercicio error:', error);
        return res.status(500).json({ ok: false, msg: 'Erro ao buscar o exercicio', error: error.message });
    }
};

export const adicionarExercicio = async (req, res) => {
    const { exercicioName, imageUrl, email, forceUpdate = false } = req.body;

    if (!exercicioName || !email || !imageUrl) {
        const missing = [];
        if (!exercicioName) missing.push('exercicioName');
        if (!email) missing.push('email');
        if (!imageUrl) missing.push('imageUrl');
        return res.status(400).json({ ok: false, msg: 'Missing params', missing });
    }

    // basic URL validation
    try {
        /* eslint-disable no-new */
        new URL(imageUrl);
    } catch (err) {
        return res.status(400).json({ ok: false, msg: 'Invalid imageUrl' });
    }

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ ok: false, msg: 'User not found' });

        // check if exists (case-insensitive)
        const existing = await Exercicio.findOne({ exercicioName: new RegExp(`^${exercicioName}$`, 'i') });

        if (existing && !forceUpdate) {
            // If exists, return the existing resource (avoid duplicates). Client can request update via forceUpdate.
            return res.status(200).json({ ok: true, msg: 'Exercicio já existe', exercicio: existing });
        }

        if (existing && forceUpdate) {
            existing.imageUrl = imageUrl;
            await existing.save();
            return res.status(200).json({ ok: true, msg: 'Exercicio atualizado', exercicio: existing });
        }

        const newExercicio = await Exercicio.create({
            exercicioName,
            imageUrl,
        });

        return res.status(201).json({ ok: true, msg: 'Exercicio criado', exercicio: newExercicio });
    } catch (error) {
        console.error('adicionarExercicio error:', error);
        return res.status(500).json({ ok: false, msg: 'Erro ao adicionar o exercicio', error: error.message });
    }
};

export const adicionarReport = async (req, res) => {
    const { exercicioName, explanation, email } = req.body;

    if (!exercicioName) return res.status(400).json({ ok: false, msg: '!exercicioName' });
    if (!explanation) return res.status(400).json({ ok: false, msg: '!explanation' });
    if (!email) return res.status(400).json({ ok: false, msg: '!email' });

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ ok: false, msg: 'Não conseguimos encontrar o seu usuario.' });

        // busca case-insensitive pelo exercício
        const exercicio = await Exercicio.findOne({ exercicioName: new RegExp(`^${exercicioName}$`, 'i') });
        if (!exercicio) {
            return res.status(404).json({ ok: false, msg: 'Exercicio nao encontrado' });
        }

        // define início e fim do dia atual (baseado no timezone do servidor)
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);

        // verifica se já existe um report do mesmo usuário nesse exercício no mesmo dia
        const alreadyReportedToday = (exercicio.reports || []).some(r => {
            const sameUser = String(r.userId) === String(user._id);
            const createdAt = r.criadoEm ? new Date(r.criadoEm) : null;
            const sameDay = createdAt && createdAt >= startOfDay && createdAt <= endOfDay;
            return sameUser && sameDay;
        });

        if (alreadyReportedToday) {
            return res.status(429).json({ ok: false, msg: 'Você já reportou este exercício hoje. Tente novamente amanhã.' });
        }

        const report = {
            userId: String(user._id),
            username: user.username || user.email || 'unknown',
            explanation,
        };

        // adiciona e salva
        exercicio.reports.push(report);
        await exercicio.save();

        const addedReport = exercicio.reports[exercicio.reports.length - 1];

        return res.status(201).json({ ok: true, msg: 'Report adicionado', report: addedReport, exercicio });
    } catch (error) {
        console.error('adicionarReport error:', error);
        return res.status(500).json({ ok: false, msg: 'Erro ao adicionar report', error: error.message });
    }
};
