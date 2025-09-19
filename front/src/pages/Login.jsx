import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../Api";
import Logo from "../components/Logo";

function Login({ plano, setLogado, logado }) {
  const [mode, setMode] = useState("signup"); // login ou signup
  const [error, setError] = useState(false);
  const [msg, setMsg] = useState(null);
  const navigate = useNavigate();

  // Evitar redirecionamento dentro do render
  useEffect(() => {
    if (logado) {
      navigate("/dashboard");
    }
  }, [logado, navigate]);

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // limpar estados anteriores
    setError(false);
    setMsg(null);

    const form = new FormData(e.currentTarget);
    const data = Object.fromEntries(form.entries());

    // Validação básica
    if (!data.email || !data.password) {
      setError(true);
      setMsg("Preencha e-mail e senha.");
      return;
    }

    if (mode === "signup") {
      if (data.password !== data.confirm) {
        setError(true);
        setMsg("As senhas não conferem.");
        return;
      }
    }

    try {
      const endpoint = mode === "signup" ? "/signup" : "/login";
      const payload =
        mode === "signup"
          ? { email: data.email, password: data.password, username: data.name, plano }
          : { email: data.email, password: data.password };

      // axios lança em caso de 4xx/5xx, então lidamos via try/catch
      const response = await api.post(endpoint, payload);

      // sucesso esperado: token presente
      if (response && response.data && response.data.token) {
        localStorage.setItem("token", response.data.token);
        setLogado(true);
        setMsg(response.data.msg ?? null);
        // redirecionar para dashboard
        navigate("/dashboard");
        return;
      }

      // se não tiver token, tratar como falha e pegar mensagem do body
      const serverMsg = response?.data?.msg ?? "Falha no login (resposta inesperada).";
      setError(true);
      setMsg(serverMsg);
    } catch (err) {
      // err pode ser AxiosError; normalizamos pra string
      const serverMsg = err?.response?.data?.msg
        || err?.message
        || "Erro de rede / servidor. Tente novamente.";
      console.warn("Login error:", err);
      setError(true);
      setMsg(String(serverMsg));
    }
  };

  return (
    <div className="min-h-screen bg-[#10151e] flex items-center justify-center px-4">
      <div
        className={`w-full max-w-md bg-[#1a1f2b] text-slate-200 rounded-2xl shadow-xl border border-slate-800 p-6 md:p-8 relative transition-all duration-300 ${error ? "animate-shake border-red-500" : ""
          }`}
      >
        {window.history.state && window.history.state.idx > 0 && (
          <div
            onClick={() => {
              navigate(-1);
            }}
            className="absolute left-4 top-4 text-slate-400 hover:text-white text-sm flex items-center gap-1"
          >
            ← Voltar
          </div>
        )}

        <div className="flex items-center gap-2 mb-10 mt-6 select-none">
          <Logo scale={1} />
          <div>
            <h1 className="text-lg font-semibold leading-tight">TreinAI</h1>
            <p className="text-xs text-slate-400">Seu coach digital pessoal</p>
          </div>
        </div>

        <div className="grid grid-cols-2 mb-6 rounded-lg overflow-hidden border border-slate-800">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`py-2.5 text-sm font-medium transition ${mode === "login"
              ? "bg-blue-600 text-white"
              : "bg-transparent text-slate-300 hover:bg-white/5"
              }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`py-2.5 text-sm font-medium transition ${mode === "signup"
              ? "bg-blue-600 text-white"
              : "bg-transparent text-slate-300 hover:bg-white/5"
              }`}
          >
            Criar conta
          </button>
        </div>

        {/* Mensagens de erro / sucesso: garantir que msg seja string */}
        {error && msg ? (
          <div className="text-yellow-300 text-sm mb-4">{String(msg)}</div>
        ) : error && !msg ? (
          <p className="text-red-500 text-sm mb-4">
            Erro ao {mode === "login" ? "entrar" : "criar conta"}. Verifique os
            dados e tente novamente.
          </p>
        ) : (
          // se não houver erro, mostrar espaço em branco (ou uma instrução)
          <div className="h-4 mb-4" />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label htmlFor="name" className="block text-sm mb-1 text-slate-300">
                Nome
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Seu nome"
                className="w-full rounded-lg bg-[#0f1420] border border-slate-700 text-slate-200 px-3 py-2 focus:ring-2 focus:ring-blue-600"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm mb-1 text-slate-300">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="voce@email.com"
              className="w-full rounded-lg bg-[#0f1420] border border-slate-700 text-slate-200 px-3 py-2 focus:ring-2 focus:ring-blue-600"
              autoComplete="email"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm mb-1 text-slate-300">
                Senha
              </label>
              {mode === "login" && (
                <a href="/recuperar" className="text-xs text-slate-400 hover:text-slate-200">
                  Esqueci minha senha
                </a>
              )}
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              placeholder="••••••••"
              className="w-full rounded-lg bg-[#0f1420] border border-slate-700 text-slate-200 px-3 py-2 focus:ring-2 focus:ring-blue-600"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>

          {mode === "signup" && (
            <div>
              <label htmlFor="confirm" className="block text-sm mb-1 text-slate-300">
                Confirmar senha
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                placeholder="••••••••"
                className="w-full rounded-lg bg-[#0f1420] border border-slate-700 text-slate-200 px-3 py-2 focus:ring-2 focus:ring-blue-600"
                autoComplete="new-password"
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 font-semibold transition"
          >
            {mode === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;
