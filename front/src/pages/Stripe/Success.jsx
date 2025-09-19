import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../Api';

const Success = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const updateSubscription = async () => {
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');

        if (!token || !sessionId) return;

        // Consulta a sessão para confirmar status do pagamento
        const res = await api.get(`/session-status?session_id=${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.data.status === 'paid' || res.data.status === 'active') {
          console.warn('Pagamento realizado com sucesso! Seu plano foi ativado.');
        } else {
          console.warn('Pagamento não confirmado. Entre em contato com o suporte.');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    updateSubscription();
  }, []);

  if (loading) return <div className="text-white p-4">Carregando...</div>;

  return (
    <div className="min-h-screen bg-[#10151e] flex flex-col items-center justify-center text-white p-4">
      <h1 className="text-2xl font-bold mb-4">Pagamento concluído!</h1>
      <p className="mb-4">Obrigado por assinar o seu plano.</p>
      <button
        onClick={() => navigate('/dashboard')}
        className="bg-blue-600 hover:bg-blue-700 py-2 px-6 rounded-lg font-semibold transition"
      >
        Voltar ao Dashboard
      </button>
    </div>
  );
};

export default Success;
