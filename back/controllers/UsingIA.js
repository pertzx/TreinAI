import OpenAI from "openai";
import User from "../models/User.js";
import { v4 as uuidv4 } from "uuid";
import { getBrazilDate } from "../helpers/getBrazilDate.js";
import Profissional from "../models/Profissional.js";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

function tolerantParseJsonFromText(text) {
  if (!text || typeof text !== 'string') return null;
  // procura primeiro '{' e último '}', tenta JSON.parse
  const begin = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (begin === -1 || end === -1 || end < begin) return null;
  const jsonText = text.slice(begin, end + 1);
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    re
  }
}

/* -------------------------------------------------------------------------- */
/* criarTreinoIA                                                               */
/* -------------------------------------------------------------------------- */
export const criarTreinoIA = async (req, res) => {
  try {
    const { email, nome, profissionalId } = req.body || {};

    if (!email) return res.status(400).json({ msg: '!email', success: false });
    if (!nome) return res.status(400).json({ msg: 'Nao passou o nome do treino: !nome', success: false });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'Email invalido. Nao conseguimos achar o seu usuario.', success: false });

    // Define ordem (último treino + 1)
    const ordem = (user.meusTreinos && user.meusTreinos.length) ? (user.meusTreinos.length + 1) : 1;
    const treinoId = uuidv4();

    if (!openai) {
      console.error('OpenAI client não configurado.');
      return res.status(500).json({ msg: 'OpenAI client não configurado.', success: false });
    }

    // System prompt que força JSON com success:true/false
    const systemPrompt = `
Você é um gerador estrito de JSON. Sempre responda com APENAS um objeto JSON válido (sem texto livre antes/depois).
Formato obrigatório:
- Se conseguir gerar um treino válido:
{
  "success": true,
  "treinoGerado": {
    "treinoName": "string (obrigatório)",
    "descricao": "string",
    "exercicios": [
      {
        "ordem": number,
        "musculo": "string",
        "nome": "string (obrigatório)",
        "instrucoes": "string",
        "series": number,
        "repeticoes": number,
        "pse": number
      }
    ]
  }
}

- Se NÃO conseguir gerar (por qualquer motivo), retorne:
{
  "success": false,
  "reason": "string curta explicando por que não foi possível (ex.: 'nome ambíguo')"
}

Use tipos coerentes (strings para texto, numbers para números). Não inclua comentários, HTML, ou qualquer texto adicional — apenas JSON puro.
`;

    const userContent = `Nome do treino: ${String(nome).trim()}`;

    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.2
    });

    // contabiliza tokens (se disponível)
    try {
      const token = Number(resp?.usage?.total_tokens || 0);
      user.stats = user.stats || {};
      if (!Array.isArray(user.stats.tokens)) user.stats.tokens = [];

      const nowBrazil = getBrazilDate();
      const brazilDateKey = (d) => {
        if (!d) return null;
        try {
          return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        } catch (err) {
          return null;
        }
      };
      const todayKey = brazilDateKey(nowBrazil);

      const idxSameDay = user.stats.tokens.findIndex(entry => {
        const entryKey = brazilDateKey(entry?.data);
        return entryKey && todayKey && entryKey === todayKey;
      });

      if (idxSameDay !== -1) {
        const prev = Number(user.stats.tokens[idxSameDay].valor || 0);
        user.stats.tokens[idxSameDay].valor = prev + token;
        user.stats.tokens[idxSameDay].data = nowBrazil;
      } else {
        user.stats.tokens.push({ valor: token, data: nowBrazil });
      }
    } catch (err) {
      console.warn('Não foi possível atualizar user.stats.tokens:', err);
    }

    const text = resp?.choices?.[0]?.message?.content || null;
    if (!text) return res.status(500).json({ msg: 'Resposta vazia da IA', success: false });

    const parsed = tolerantParseJsonFromText(text);

    // Se a IA explicitamente retornou sucesso false -> retorne 200 com success:false para o front tratar
    if (parsed && parsed.success === false) {
      return res.status(200).json({
        msg: parsed.reason || 'IA não conseguiu gerar o treino.',
        success: false,
        raw: parsed
      });
    }

    // Verifica parsed.treinoGerado e parsed.success === true
    if (!parsed || parsed.success !== true || !parsed.treinoGerado) {
      // Se quiser fazer fallback automático, coloque a lógica aqui (atualmente vamos informar erro)
      return res.status(500).json({ msg: 'Não conseguimos gerar um treino válido da IA', success: false, raw: parsed || text });
    }

    // Adiciona treino com treinoId e ordem
    const novoTreino = {
      treinoId,
      ordem,
      ...parsed.treinoGerado
    };

    user.meusTreinos = user.meusTreinos || [];
    user.meusTreinos.push(novoTreino);

    // Se houver profissionalId, atualiza o profissional.alunos.ultimoUpdate (não obrigatório)
    try {
      if (profissionalId) {
        const profissional = await Profissional.findOne({
          $or: [
            { profissionalId: profissionalId },
            { userId: profissionalId }
          ]
        });

        if (profissional) {
          const aluno = (profissional.alunos || []).find(a => String(a.userId) === String(user._id));
          if (aluno) {
            aluno.ultimoUpdate = getBrazilDate();
            await profissional.save();
          }
        } else {
          console.log('Não encontrei o profissional com o profissionalId repassado.');
        }
      }
    } catch (err) {
      console.warn('Falha ao atualizar profissional ao gerar treino:', err);
    }

    await user.save();

    return res.json({
      msg: 'Treino gerado com sucesso!',
      success: true,
      treino: novoTreino
    });

  } catch (error) {
    console.error('criarTreinoIA error:', error);
    return res.status(500).json({ msg: 'Erro interno', error: error?.message || String(error), success: false });
  }
};

/* -------------------------------------------------------------------------- */
/* criarExercicioIA                                                            */
/* -------------------------------------------------------------------------- */
export const criarExercicioIA = async (req, res) => {
  try {
    const { email, treinoId, nome, profissionalId } = req.body || {};

    if (!email) return res.status(400).json({ msg: '!email', success: false });
    if (!treinoId) return res.status(400).json({ msg: '!treinoId', success: false });
    if (!nome) return res.status(400).json({ msg: 'Nao passou o nome do exercicio: !nome', success: false });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: 'Email invalido. Nao conseguimos achar o seu usuario.', success: false });

    const treino = (user.meusTreinos || []).find(t => String(t.treinoId) === String(treinoId));
    if (!treino) return res.status(404).json({ msg: 'Treino nao encontrado para o treinoId repassado!', success: false });

    if (!openai) {
      console.error('OpenAI client não configurado.');
      return res.status(500).json({ msg: 'OpenAI client não configurado.', success: false });
    }

    const systemPrompt = `
Você é um gerador estrito de JSON. Sempre responda com APENAS um objeto JSON válido (sem texto livre antes/depois).
Formato obrigatório:
- Se encontrar/gerar um exercício válido:
{
  "success": true,
  "exercicioGerado": {
    "musculo": "string (obrigatório)",
    "nome": "string (obrigatório)",
    "instrucoes": "string",
    "series": number,
    "repeticoes": number,
    "pse": number
  }
}

- Se NÃO conseguir gerar/existir:
{
  "success": false,
  "reason": "string curta explicando por que não foi possível"
}

Retorne apenas JSON puro. Use tipos corretos.
`;

    const userContent = `Nome do exercício: ${String(nome).trim()}`;

    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.2
    });

    // Atualiza tokens (tolerante)
    try {
      const token = Number(resp?.usage?.total_tokens || 0);
      user.stats = user.stats || {};
      if (!Array.isArray(user.stats.tokens)) user.stats.tokens = [];

      const nowBrazil = getBrazilDate();
      const brazilDateKey = (d) => {
        if (!d) return null;
        try {
          return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        } catch (err) {
          return null;
        }
      };
      const todayKey = brazilDateKey(nowBrazil);

      const idxSameDay = user.stats.tokens.findIndex(entry => {
        const entryKey = brazilDateKey(entry?.data);
        return entryKey && todayKey && entryKey === todayKey;
      });

      if (idxSameDay !== -1) {
        const prev = Number(user.stats.tokens[idxSameDay].valor || 0);
        user.stats.tokens[idxSameDay].valor = prev + token;
        user.stats.tokens[idxSameDay].data = nowBrazil;
      } else {
        user.stats.tokens.push({ valor: token, data: nowBrazil });
      }
    } catch (err) {
      console.warn('Falha ao atualizar user.stats.tokens em criarExercicioIA:', err);
    }

    const text = resp?.choices?.[0]?.message?.content || null;
    if (!text) return res.status(500).json({ msg: 'Resposta vazia da IA', success: false });

    const parsed = tolerantParseJsonFromText(text);

    if (parsed && parsed.success === false) {
      return res.status(200).json({
        msg: parsed.reason || 'Exercicio nao encontrado pela IA',
        success: false,
        raw: parsed
      });
    }

    if (!parsed || parsed.success !== true || !parsed.exercicioGerado) {
      return res.status(500).json({ msg: 'Não conseguimos gerar um exercício válido da IA', success: false, raw: parsed || text });
    }

    // Adiciona exercício ao treino
    treino.exercicios = treino.exercicios || [];
    const novoEx = {
      ...parsed.exercicioGerado,
      ordem: (treino.exercicios.length ? treino.exercicios.length + 1 : 1),
      exercicioId: uuidv4()
    };
    treino.exercicios.push(novoEx);

    // Atualiza profissional se necessário (marca ultimoUpdate)
    try {
      if (profissionalId) {
        const profissional = await Profissional.findOne({
          $or: [
            { profissionalId: profissionalId },
            { userId: profissionalId }
          ]
        });

        if (profissional) {
          const aluno = (profissional.alunos || []).find(a => String(a.userId) === String(user._id));
          if (aluno) {
            aluno.ultimoUpdate = getBrazilDate();
            await profissional.save();
          }
        } else {
          console.log('Não encontrei o profissional com o profissionalId repassado.');
        }
      }
    } catch (err) {
      console.warn('Falha ao atualizar profissional ao gerar exercício:', err);
    }

    await user.save();

    return res.json({
      msg: 'Exercicio gerado com sucesso!',
      success: true,
      treinoAtualizado: treino,
      user
    });

  } catch (error) {
    console.error('criarExercicioIA error:', error);
    return res.status(500).json({ msg: 'Erro interno', error: error?.message || String(error), success: false });
  }
};

export const conversar = async (req, res) => {
    try {
        const { email, input, historico } = req.body;

        if (!email) return res.json({ msg: '!email' });
        if (!input) return res.json({ msg: '!input' });
        if (!historico) return res.json({ msg: 'historico' });

        const user = await User.findOne({ email });
        if (!user) return res.json({ msg: 'Não conseguimos encontrar o seu usuario.' });

        if (!openai) throw new Error('OpenAI client não configurado.');

        const systemPrompt = `Você é um personal trainner e esta conversando com o seu cliente, voce é formal e nunca falará besteiras, mas é humano entao pode brincar com o seu cliente caso o usuario passe dos limites perguntando alguma coisa MUITO fora de contexto voce ira mandar ele voltar ao foco do treino pois ele pode estar tentando se safar do treino.
         responda sempre de forma descoontraida utilizando emojis caso necessario, mas caso o assunto for serio responda da mesma maneira seria. Voce nao pode gerar nenhum tipo de mensagem longa, como gerar um treino porque outro assistente ja tem esse trabalho, toda vez q alguem pedir algo relacionado a gerar voce explica que voce so pode conversar e explicar as coisas mas nao pode gerar nada.
         Caso o cliente pergunte sobre alguma coisa que voce pode ter mandado anteriormente analise o historico e responda o cliente.`;

        const messages = [
            { role: 'system', content: systemPrompt },
            ...historico.map(h => ({
                role: h.role === 'ia' ? 'assistant' : 'user',
                content: h.content
            })),
            { role: 'user', content: input }
        ];

        const resp = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages,
            temperature: 0.2
        });

        // --- Atualiza user.stats.tokens (mesma lógica) ---
        try {
            const token = Number(resp?.usage?.total_tokens || 0);

            user.stats = user.stats || {};
            if (!Array.isArray(user.stats.tokens)) user.stats.tokens = [];

            const nowBrazil = getBrazilDate();
            const brazilDateKey = (d) => {
                if (!d) return null;
                try {
                    return new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                } catch (err) {
                    return null;
                }
            };
            const todayKey = brazilDateKey(nowBrazil);

            const idxSameDay = user.stats.tokens.findIndex(entry => {
                const entryKey = brazilDateKey(entry?.data);
                return entryKey && todayKey && entryKey === todayKey;
            });

            if (idxSameDay !== -1) {
                const prev = Number(user.stats.tokens[idxSameDay].valor || 0);
                user.stats.tokens[idxSameDay].valor = prev + token;
                user.stats.tokens[idxSameDay].data = nowBrazil;
            } else {
                user.stats.tokens.push({ valor: token, data: nowBrazil });
            }

            // salva alteração de tokens
            await user.save();
        } catch (err) {
            console.warn('Falha ao atualizar user.stats.tokens em conversar:', err);
            // não interrompe o retorno ao cliente
        }
        // --- fim atualização tokens ---

        const text = resp?.choices?.[0]?.message?.content || null;
        if (!text) return res.status(500).json({ msg: 'Resposta vazia da IA' });

        return res.json({
            msg: 'Tudo certo!',
            res: text
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ msg: 'Erro interno', error: error.message });
    }
};

