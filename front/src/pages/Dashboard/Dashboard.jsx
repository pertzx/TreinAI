import { useEffect, useState } from 'react';
import api from '../../Api';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import Header from './Components/Header';
import AdBanner from './Components/AdBanner';
import MeusTreinos from './Pages/MeusTreinos';
import Historico from './Pages/Historico';
import Perfil from './Pages/Perfil';
import Configuracoes from './Pages/Configuracoes';
import OnboardingQuestionnaireFitness from './Components/OnboardingQuestionnaireFitness';
import BuscarImagens from '../../components/BuscarImagens';
import ChatTreino from './Components/ChatTreino';
import BMIChart from './Components/BMIchart';
import HistoricoChart from './Components/HistoricoChart';
import Encontrar from './Pages/Encontrar';
import TokensChart from './Components/TokensChart';
import Coach from './Pages/Coach.jsx';
import CoachEspecifico from './Pages/CoachEspecifico';
import Chats from '../../components/Chats';
import Footer from './Components/Footer';
import ChatNutriAI from './Components/ChatNutriAi';
import InfoCoachs from '../../components/InfoCoachs.jsx';
import AnunciosDash from './Components/AnunciosDash.jsx';
import Locais from './Components/Locais.jsx';

const Dashboard = ({ needToPay, plano }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tema, setTema] = useState('dark');
  const [showOnboard, setShowOnboard] = useState(false);
  const [treinoIniciado, setTreinoIniciado] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (plano !== 'free') {

    }
  }, [])

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      if (!token) return navigate('/login');

      try {
        const res = await api.get('/dashboard', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data?.user) setUser(res.data.user);
        else navigate('/login');
      } catch (error){
        console.error(error)
        localStorage.removeItem('token');
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();

    // Carregar tema do localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) setTema(savedTheme);
  }, [navigate]);

  // Atualiza o tema com base nas preferências do usuário (quando user muda)
  useEffect(() => {
    if (user?.preferences?.theme) {
      setTema(user.preferences.theme);
    }
  }, [user]);

  // Decide se deve mostrar o onboarding (após user carregado)
  useEffect(() => {
    if (!user) return;

    const loginCount = Number(user.stats?.loginCount ?? 0);

    // Detecta se backend já marcou como completado (vários possíveis campos)
    const onboardCompleted =
      user.onboarding?.completed === true ||
      user.stats?.onboarded === true ||
      user.onboarded === true ||
      user.preferences?.onboardCompleted === true;

    // if (loginCount <= 1 && !onboardCompleted) {
    //   setShowOnboard(true);
    // } else {
    //   setShowOnboard(false);
    // }
  }, [user]);



  const handlePay = async () => {
    try {
      setLoading(true);
      const res = await api.post('/create-checkout-session', {
        plan: user?.planInfos?.planType,
        userId: user?._id
      });
      window.location.href = res?.data?.url;
    } catch (err) {
      console.log(err)
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-white text-center">Carregando...</div>;
  if (!user) return null;

  const themeClasses = tema === 'dark' ? 'bg-[#10151e] text-white' : 'bg-white text-black';

  const db = (
    <section
      className={`w-full flex flex-col md:grid-cols-3 gap-6 mt-6 transition-colors duration-300 ${tema === "dark" ? "bg-gray-900 text-white" : "bg-white text-gray-900"}`}
    >
      {
        user && user.planInfos && user.planInfos.planType && user.planInfos.planType === 'coach' && (
          <Link to={'coach'} className='col-span-3 bg-gradient-to-br from-blue-700 to-blue-400 p-5 border-3 rounded-2xl border-yellow-500 text-yellow-500 font-light text-center'>
            <b className='text-semibold text-2xl drop-shadow-md drop-shadow-blue-600'>Acesse o seu painel coach.</b>
            <p className='drop-shadow-md text-xl drop-shadow-blue-600'>/dashboard/coach</p>
          </Link>
        )
      }
      {/* Card Treino do Dia - agora ocupa 2 colunas em md+ */}
      <div className="w-full">
        <ChatTreino tema={tema} user={user} />
      </div>
      
      {/* NutriAi */}
      <ChatNutriAI user={user} tema={tema} />

      {/* Card Perfil */}
      <div
        className={`flex flex-col gap-2 p-6 rounded-2xl shadow-sm hover:shadow-lg transition-colors duration-300 ${tema === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}
      >
        <h2 className="text-xl font-semibold mb-2">Desempenho</h2>
        <div className="flex flex-col gap-3 items-center xl:items-start justify-center xl:flex-row">
          <div className={`${tema === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} p-3 rounded-2xl`}>
            <BMIChart alturaHistory={user?.perfil?.altura} pesoHistory={user?.perfil?.pesoAtual} targetBMI={22.5} tema={tema} />
          </div>
          <div className={`${tema === 'dark' ? 'bg-gray-700' : 'bg-gray-200'} p-3 rounded-2xl`}>
            <HistoricoChart tema={tema} historico={user?.historico} />
          </div>
        </div>
      </div>

      {/* Card Estatísticas - ficará abaixo do Perfil em telas md+, ou abaixo no mobile */}
      <div
        className={`p-6 rounded-2xl shadow-sm hover:shadow-lg transition-colors duration-300 ${tema === "dark" ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}
      >
        <h2 className="text-xl font-semibold mb-2">Estatísticas</h2>
        <TokensChart user={user} tokens={user?.stats?.tokens} tema={tema} />
      </div>


    </section>
  );

  return (
    <div className={`min-h-screen w-full h-full flex flex-col items-center p-4 ${themeClasses}`}>
      {/* Onboarding full-screen */}

      {showOnboard && (
        <OnboardingQuestionnaireFitness
          user={user}
          setUser={setUser}
          setShowOnboard={setShowOnboard}
        />
      )}

      {user.planInfos.status !== 'ativo' && user.planInfos.planType !== 'free' ? (
        <div className='w-full'>
          <h1 className='mb-2'>Acesse o sistema ao ativar seu plano. Caso prefira, altere para o plano Free e continue usando com limitaçoes.</h1>
          <button
            onClick={handlePay}
            className="bg-green-600 hover:bg-green-700 py-2 px-6 rounded-lg font-semibold transition"
          >
            Ativar Plano
          </button>

          <Configuracoes user={user} setTema={setTema} tema={tema} />
        </div>
      ) : (
        <div className="w-full h-full">
          <Header tema={tema} user={user} />
          <Routes>
            <Route path="meus-treinos" element={<MeusTreinos tema={tema} user={user} setUser={setUser} />} />
            <Route path="historico" element={<Historico historico={user?.historico} tema={tema} />} />
            <Route path="perfil" element={<Perfil user={user} tema={tema} />} />
            <Route path="configuracoes" element={<Configuracoes setTema={setTema} tema={tema} user={user} />} />
            <Route path="encontrar" element={<Encontrar user={user} tema={tema} />} />
            <Route path="coach/*" element={<Coach tema={tema} user={user} />} /> 
            <Route path="coach/u/" element={<CoachEspecifico user={user} />} /> 
            <Route path="/chat" element={<Chats user={user} tema={tema} />} /> 
            <Route path="/infosCoach" element={<InfoCoachs user={user} />} /> 
            <Route path="/anuncios" element={<AnunciosDash user={user} tema={tema} />} /> 
            <Route path="/locais" element={<Locais user={user} tema={tema}/>} /> 
            <Route path="" element={db} />
          </Routes>
          <Footer tema={tema} user={user} />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
