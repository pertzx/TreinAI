import Anuncio from "../models/Anuncios.js";
import dotenv from "dotenv";
import fs from 'fs'
import path from "path";
import User from "../models/User.js";

dotenv.config();

// =======================
const deleteFileIfExists = (filename) => {
    if (!filename) return;
    const filePath = path.join('uploads/midias-anuncio', filename);
    if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (err) { console.warn('Erro removendo arquivo:', filePath, err); }
    }
};

export const criarAnuncio = async (req, res) => {
    try {
        const { link, userId, titulo, descricao, anuncioTipo, country, countryCode, state, city } = req.body;
        const backendUrl = process.env.BASEURL?.replace(/\/+$/, '');
        const uploadedFile = req.file;

        // Function to delete uploaded file if exists
        const deleteUploadedFile = () => {
            if (uploadedFile) {
                const filePath = path.join('uploads/midias-anuncio', uploadedFile.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
        };

        // Verify if professional exists
        const user = await User.findById(userId);
        if (!user) {
            deleteUploadedFile();
            return res.status(404).json({ msg: "user não encontrado" });
        }

        // Check number of existing ads for this professional
        const existingAdsCount = await Anuncio.countDocuments({ userId });
        if (existingAdsCount >= 5) {
            deleteUploadedFile();
            return res.status(400).json({
                msg: "Limite máximo de 5 anúncios atingido. Exclua ou edite um anúncio existente."
            });
        }

        // File size checks
        if (uploadedFile) {
            const fileSize = uploadedFile.size;
            const isVideo = uploadedFile.mimetype.startsWith('video/');
            const isImage = uploadedFile.mimetype.startsWith('image/');
            const MB = 1024 * 1024;

            if (isImage && fileSize > MB) {
                deleteUploadedFile();
                return res.status(400).json({
                    msg: "Imagem deve ser menor que 1MB"
                });
            }

            if (isVideo && fileSize > 35 * MB) {
                deleteUploadedFile();
                return res.status(400).json({
                    msg: "Vídeo deve ser menor que 35MB"
                });
            }
        }

        const midiaUrl = uploadedFile ? `${backendUrl}/uploads/midias-anuncio/${uploadedFile.filename}` : null;

        // Create object with required fields
        const anuncioData = {
            link,
            userId,
            titulo,
            descricao,
            anuncioTipo,
            midiaUrl
        };

        // Only add location fields if they exist and are not null/undefined
        if (country) anuncioData.country = country;
        if (countryCode) anuncioData.countryCode = countryCode;
        if (state) anuncioData.state = state;
        if (city) anuncioData.city = city;

        const novoAnuncio = await Anuncio.create(anuncioData);

        novoAnuncio.save();

        return res.status(201).json({
            msg: "Anúncio criado com sucesso",
            data: novoAnuncio
        });

    } catch (error) {
        if (req.file) {
            const filePath = path.join('uploads/midias-anuncio', req.file.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        console.log('Erro ao criar anúncio:', error);

        return res.status(500).json({
            msg: "Erro ao criar anúncio",
            error: error.msg
        });
    }
}

export const editarAnuncio = async (req, res) => {
    try {
        const { anuncioId, link, userId, titulo, descricao, anuncioTipo, country, countryCode, state, city } = req.body;
        const backendUrl = process.env.BASEURL?.replace(/\/+$/, '');
        const uploadedFile = req.file;

        // valida básicos
        if (!anuncioId || !userId) {
            if (uploadedFile) deleteFileIfExists(uploadedFile.filename);
            return res.status(400).json({ msg: "anuncioId e userId são obrigatórios para editar", success: false });
        }

        const anuncio = await Anuncio.findOne({ anuncioId });
        if (!anuncio) {
            if (uploadedFile) deleteFileIfExists(uploadedFile.filename);
            return res.status(404).json({ msg: "Anúncio não encontrado", success: false });
        }

        // Verifica ownership / permissões (admins podem editar)
        const user = await User.findById(userId);
        if (!user) {
            if (uploadedFile) deleteFileIfExists(uploadedFile.filename);
            return res.status(404).json({ msg: "user não encontrado", success: false });
        }
        if (anuncio.userId !== userId && user.role !== 'admin') {
            if (uploadedFile) deleteFileIfExists(uploadedFile.filename);
            return res.status(403).json({ msg: "Não autorizado a editar este anúncio", success: false });
        }

        // valida upload (se houver)
        const MB = 1024 * 1024;
        if (uploadedFile) {
            const fileSize = uploadedFile.size;
            const isVideo = uploadedFile.mimetype.startsWith('video/');
            const isImage = uploadedFile.mimetype.startsWith('image/');

            // Se o cliente mudou o anuncioTipo, respeitamos; se não enviou anuncioTipo, usamos o existente
            const effectiveTipo = anuncioTipo || anuncio.anuncioTipo;

            if (effectiveTipo === 'imagem' && !isImage) {
                deleteFileIfExists(uploadedFile.filename);
                return res.status(400).json({ msg: "Tipo esperado: imagem", success: false });
            }
            if (effectiveTipo === 'video' && !isVideo) {
                deleteFileIfExists(uploadedFile.filename);
                return res.status(400).json({ msg: "Tipo esperado: vídeo", success: false });
            }

            if (isImage && fileSize > MB * 1) {
                deleteFileIfExists(uploadedFile.filename);
                return res.status(400).json({ msg: "Imagem deve ser menor que 1MB", success: false });
            }
            if (isVideo && fileSize > MB * 35) {
                deleteFileIfExists(uploadedFile.filename);
                return res.status(400).json({ msg: `Vídeo deve ser menor que 35MB`, success: false });
            }
        }

        // Monta o objeto de atualização. **Importante**: só sobrescrevemos midiaUrl se houver upload novo.
        const anuncioData = {};
        if (typeof link !== 'undefined') anuncioData.link = link;
        if (typeof titulo !== 'undefined') anuncioData.titulo = titulo;
        if (typeof descricao !== 'undefined') anuncioData.descricao = descricao;
        if (typeof anuncioTipo !== 'undefined') anuncioData.anuncioTipo = anuncioTipo;

        if (typeof country !== 'undefined') anuncioData.country = country;
        if (typeof countryCode !== 'undefined') anuncioData.countryCode = countryCode;
        if (typeof state !== 'undefined') anuncioData.state = state;
        if (typeof city !== 'undefined') anuncioData.city = city;

        // tratamos midia: se enviou arquivo novo, removemos antigo e guardamos novo midiaUrl
        if (uploadedFile) {
            try {
                // Remove arquivo antigo se houver
                if (anuncio.midiaUrl) {
                    const oldFilename = anuncio.midiaUrl.split('/').pop();
                    deleteFileIfExists(oldFilename);
                }
            } catch (err) {
                console.warn('Erro ao deletar mídia antiga (continua):', err);
            }

            const newMidiaUrl = `${backendUrl}/uploads/midias-anuncio/${uploadedFile.filename}`;
            anuncioData.midiaUrl = newMidiaUrl;
        }
        // Se NÃO houve upload, não tocamos no campo midiaUrl (preserva existente)

        const updated = await Anuncio.findOneAndUpdate({ anuncioId }, anuncioData, { new: true });

        return res.status(200).json({
            msg: "Anúncio editado com sucesso",
            anuncio: updated,
            success: true
        });

    } catch (error) {
        if (req.file) deleteFileIfExists(req.file.filename);
        console.error('Erro ao editar anúncio:', error);
        return res.status(500).json({
            msg: "Erro ao editar anúncio",
            error: error?.message || error,
            success: true
        });
    }
};

export const getAnuncios = async (req, res) => {
    try {
        const { userId, country, state, city } = req.query;

        if (userId) {
            console.log('Buscando anúncios para o userId:', userId);
            // Basic security check - verify if the professional exists
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ msg: "user não encontrado" });
            }
            // Return all ads for the specific professional
            const anuncios = await Anuncio.find({ userId });
            return res.status(200).json({ anuncios });
        }

        // Build location query
        let locationQuery = {};
        let anuncios;

        // Try with all location parameters
        if (country && state && city) {
            anuncios = await Anuncio.find({ country, state, city });
            if (anuncios.length > 0) {
                locationQuery = { country, state, city };
            }
        }

        // If no results, try with country and state
        if ((!anuncios || anuncios.length === 0) && country && state) {
            anuncios = await Anuncio.find({ country, state });
            if (anuncios.length > 0) {
                locationQuery = { country, state };
            }
        }

        // If still no results, try with just country
        if ((!anuncios || anuncios.length === 0) && country) {
            anuncios = await Anuncio.find({ country });
            if (anuncios.length > 0) {
                locationQuery = { country };
            }
        }

        // If no location matches, get all ads
        if (!anuncios || anuncios.length === 0) {
            anuncios = await Anuncio.find();
        }

        const availableAnuncios = [];

        for (const anuncio of anuncios) {
            const user = await User.findById(anuncio.userId);

            if (user &&
                user.saldoDeImpressoes > 0 &&
                anuncio.status === 'ativo') {
                availableAnuncios.push(anuncio);
            }
        }

        return res.status(200).json({ availableAnuncios });

    } catch (error) {
        return res.status(500).json({
            msg: "Erro ao buscar anúncios",
            error: error.msg
        });
    }
};

export const deletarAnuncio = async (req, res) => {
    try {
        const { anuncioId, userId } = req.body;

        const anuncio = await Anuncio.findOne({ anuncioId });
        if (!anuncio) {
            return res.status(404).json({ msg: "Anúncio não encontrado" });
        }

        // Basic security check - verify if the professional owns this ad
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ msg: "user não encontrado" });
        }

        if (anuncio.userId !== userId && user.role !== 'admin') {
            return res.status(403).json({ msg: "Não autorizado a deletar este anúncio" });
        }

        // Delete media file if exists
        if (anuncio.midiaUrl) {
            const filename = anuncio.midiaUrl.split('/').pop();
            const filePath = path.join('uploads/midias-anuncio', filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // Delete from database
        await Anuncio.findOneAndDelete({ anuncioId });

        return res.status(200).json({ msg: "Anúncio deletado com sucesso" });

    } catch (error) {
        return res.status(500).json({
            msg: "Erro ao deletar anúncio",
            error: error.msg
        });
    }
}