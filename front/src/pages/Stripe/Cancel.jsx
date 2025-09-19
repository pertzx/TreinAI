import React from 'react';
import { useNavigate } from 'react-router-dom';

const Cancel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#10151e] flex flex-col items-center justify-center text-white p-4">
      <h1 className="text-2xl font-bold mb-4">Pagamento cancelado</h1>
      <p className="mb-4">Seu pagamento não foi realizado. Você pode tentar novamente.</p>
      <button
        onClick={() => navigate('/dashboard')}
        className="bg-red-600 hover:bg-red-700 py-2 px-6 rounded-lg font-semibold transition"
      >
        Voltar ao Dashboard
      </button>
    </div>
  );
};

export default Cancel;
