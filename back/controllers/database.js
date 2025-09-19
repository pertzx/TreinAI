import User from "../models/User.js";

// controllers/historicoController.js (exemplo)
export const publicarNoHistorico = async (req, res) => {
  const { email, treino } = req.body;

  if (!email) return res.status(400).json({ msg: '!email' });
  if (!treino) return res.status(400).json({ msg: '!treino' });
  // garantimos que o treino contenha o treinoId, pois sua lógica depende disso
  if (!treino.treinoId) return res.status(400).json({ msg: '!treino.treinoId' });

  try {
    // normaliza e protege alguns campos do treino
    const treinoToSave = {
      ...treino,
      dataExecucao: treino.dataExecucao ? new Date(treino.dataExecucao) : new Date(),
      duracao: typeof treino.duracao === 'number' ? treino.duracao : Number(treino.duracao) || 0,
    };

    // operação atômica: push no array historico e retorna o documento atualizado
    const updatedUser = await User.findOneAndUpdate(
      { email },
      { $push: { historico: treinoToSave } },
      { new: true, runValidators: true } // new:true retorna doc atualizado
    ).select('-senha -password'); // remova campos sensíveis (ajuste de acordo com seu schema)

    if (!updatedUser) {
      return res.status(404).json({ msg: 'Não conseguimos encontrar o seu usuário.' });
    }

    return res.status(200).json({ msg: 'Tudo ok!', user: updatedUser });
  } catch (error) {
    console.error('Erro publicarNoHistorico:', error);
    // não envie stack trace em produção; aqui envio mensagem simples
    return res.status(500).json({ msg: 'erro', error: error.message || error });
  }
};
