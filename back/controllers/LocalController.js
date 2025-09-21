import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Local from "../models/Local.js";
import { getBrazilDate } from "../helpers/getBrazilDate.js";

// __dirname compatível ESM
const __filename = typeof fileURLToPath === "function" ? fileURLToPath(import.meta.url) : "";
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

// pasta onde multer salva imagens de locais (ajuste se necessário)
const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "image-local");

// --- helpers ---
const buildImageUrl = (req, filename) => {
  if (!filename) return null;
  const host = req.get && req.get("host") ? req.get("host") : (req.headers && req.headers.host) || "localhost";
  const protocol = req.protocol || "http";
  return `${protocol}://${host}/uploads/image-local/${filename}`;
};

const tryDeleteOldImage = (imageUrl) => {
  try {
    if (!imageUrl || typeof imageUrl !== "string") return;
    const parsed = imageUrl.split("/").pop();
    if (!parsed) return;
    const filename = parsed.split("?")[0].split("#")[0];
    const candidatePath = path.join(UPLOAD_DIR, filename);
    if (candidatePath.startsWith(UPLOAD_DIR) && fs.existsSync(candidatePath)) {
      fs.unlinkSync(candidatePath);
    }
  } catch (err) {
    console.warn("tryDeleteOldImage error:", err && (err.message || err));
  }
};

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// =======================
// GET /locais  (getLocais)
// query: userId, country, state, city, localType, q, page, limit, sort
// =======================
export const getLocais = async (req, res) => {
  try {
    const {
      userId,
      country,
      state,
      city,
      localType,
      q,
      page = 1,
      limit = 20,
      sort = '-criadoEm'
    } = req.query || {};

    const filter = {};

    if (userId) {
      // busca por user (aceita userId ou ObjectId)
      filter.userId = String(userId);
    }

    // se vier localType (ex.: 'academia', 'clinica-de-fisioterapia', etc.) -> aplicamos filtro
    if (localType) filter.localType = String(localType).trim();

    // apenas aplicar filtros de país/estado/cidade se foram enviados
    if (country) filter.country = new RegExp(`^${escapeRegex(String(country).trim())}$`, "i");
    if (state) filter.state = new RegExp(`^${escapeRegex(String(state).trim())}$`, "i");
    if (city) filter.city = new RegExp(`^${escapeRegex(String(city).trim())}$`, "i");

    // busca livre em nome/descrição
    if (q && String(q).trim()) {
      const regex = new RegExp(escapeRegex(String(q).trim()), "i");
      filter.$or = [{ localName: regex }, { localDescricao: regex }];
    }

    // se não foi informado userId, só retornamos locais ativos
    if (!userId) {
      filter.status = 'ativo';
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * perPage;

    // execução paralela: total + itens
    const [total, items] = await Promise.all([
      Local.countDocuments(filter),
      Local.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(perPage)
        .lean()
    ]);

    return res.status(200).json({
      success: true,
      msg: "Lista de locais",
      data: {
        total,
        page: pageNum,
        perPage,
        items
      }
    });
  } catch (error) {
    console.error("Erro em getLocais:", error);
    return res.status(500).json({ success: false, msg: "Erro ao buscar locais.", error: error.message || String(error) });
  }
};


// =======================
// POST /editar-local  (editarLocal)
// body: localId (ou _id), localName, localDescricao, country, countryCode, state, city, lat, lng, removeImage
// optional file: req.file (multer single 'image')
// =======================
export const editarLocal = async (req, res) => {
  try {
    const {
      localId,
      link,
      localName,
      localDescricao,
      country,
      countryCode,
      state,
      city,
      lat,
      lng,
    } = req.body || {};

    if (!localId) {
      return res.status(400).json({ success: false, msg: "Parâmetro localId obrigatório." });
    }

    // procura tolerante: localId, _id, localId field
    const queryOr = [
      { localId: localId },
    ];
    // se for um ObjectId válido, já coberto pela _id; se não, a query acima ainda funciona
    const local = await Local.findOne({ $or: queryOr });

    if (!local) {
      return res.status(404).json({ success: false, msg: "Local não encontrado." });
    }

    // atualizar campos se vierem
    if (link !== undefined) local.link = String(link || "");
    if (localName !== undefined) local.localName = String(localName || "");
    if (localDescricao !== undefined) local.localDescricao = String(localDescricao || "");
    if (country !== undefined) local.country = country ? String(country).trim() : null;
    if (countryCode !== undefined) local.countryCode = countryCode ? String(countryCode).trim().toUpperCase() : null;
    if (state !== undefined) local.state = state ? String(state).trim() : null;
    if (city !== undefined) local.city = city ? String(city).trim() : null;

    // lat/lng parsing
    const parseNum = (v) => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const latNum = parseNum(lat);
    const lngNum = parseNum(lng);
    if (latNum !== undefined && lngNum !== undefined) {
      local.location = { type: "Point", coordinates: [lngNum, latNum] };
    } else if ((lat !== undefined && lat === "") || (lng !== undefined && lng === "")) {
      // limpar geolocalização se veio string vazia
      local.location = undefined;
    }

    if (req.file && req.file.filename) {
      // apagar antiga se existir
      if (local.imageUrl) tryDeleteOldImage(local.imageUrl);
      local.imageUrl = buildImageUrl(req, req.file.filename);
    }

    local.atualizadoEm = new Date(getBrazilDate());

    const saved = await local.save();

    return res.status(200).json({
      success: true,
      msg: "Local atualizado com sucesso.",
      local: saved
    });
  } catch (error) {
    console.error("Erro em editarLocal:", error);
    return res.status(500).json({ success: false, msg: "Erro ao editar local.", error: error.message || String(error) });
  }
};
