import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { FaTimes, FaDownload, FaShareAlt, FaCamera } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import HistoricoChart from "./HistoricoChart";
import Logo from "../../../components/Logo"; // opcional: seu componente de logo

/* -------------------- Helpers -------------------- */
function formatSeconds(s) {
    if (s === null || s === undefined) return "";
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
}
function themeClass(tema, lightClass, darkClass) {
    return tema === "light" ? lightClass : darkClass;
}
const hasValue = (v) => v !== null && v !== undefined;

/* -------------------- SummaryOverlay (single-screen capture friendly) -------------------- */
const SummaryOverlay = ({ open, onClose, registro, userHistorico = [], tema = "dark" }) => {
    const [copied, setCopied] = useState(false);
    const [compare, setCompare] = useState(null);
    const [processingImage, setProcessingImage] = useState(false);
    const [sharing, setSharing] = useState(false);
    const overlayRef = useRef(null);
    const navigate = useNavigate();

    // camera / foto local
    const fileInputRef = useRef(null);
    const [localPhotoFile, setLocalPhotoFile] = useState(null);
    const [compositeBlobUrl, setCompositeBlobUrl] = useState(null);
    const [compositeBlob, setCompositeBlob] = useState(null);
    const [takingPhotoProcessing, setTakingPhotoProcessing] = useState(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!registro || !userHistorico || !userHistorico.length) { setCompare(null); return; }
        const prev = [...userHistorico].reverse().find(r => String(r.treinoId) === String(registro.treinoId));
        if (!prev) { setCompare(null); return; }
        const comp = (registro.exerciciosFeitos || []).map((ex, idx) => {
            const prevEx = (prev.exerciciosFeitos && prev.exerciciosFeitos[idx]) || null;
            const prevSum = prevEx ? (prevEx.tempoTotalExercicio || prevEx.sum || 0) : 0;
            const curSum = (ex.tempoTotalExercicio || ex.sum || 0) || 0;
            const diff = curSum - prevSum;
            return { nome: ex.nome, current: curSum, previous: prevSum, diff };
        });
        setCompare(comp);
    }, [registro, userHistorico]);

    useEffect(() => {
        return () => {
            if (compositeBlobUrl) try { URL.revokeObjectURL(compositeBlobUrl); } catch (e) { }
        };
    }, [compositeBlobUrl]);

    if (!open || !registro) return null;

    const total = registro?.duracao;
    const isLight = tema === "light";

    /* -------------------- CSV / PDF -------------------- */
    const exportCSV = () => {
        const rows = [];
        rows.push(["Treino", registro.treinoName || ""]);
        rows.push(["TreinoId", registro.treinoId || ""]);
        rows.push(["DataExecucao", registro.dataExecucao ? new Date(registro.dataExecucao).toISOString() : new Date().toISOString()]);
        rows.push(["TempoTotalSegundos", String(registro.duracao || 0)]);
        rows.push([]);
        rows.push(["Exercicio", "Set", "DuracaoSegundos", "DuracaoFormatada"]);

        (registro.exerciciosFeitos || []).forEach((ex) => {
            (ex.sets || []).forEach((s) => {
                const dur = s.durationSeconds;
                rows.push([ex.nome || "", String(s.setNumber), String(hasValue(dur) ? dur : ""), formatSeconds(dur)]);
            });
            const sum = ex.tempoTotalExercicio || ex.sum || (ex.sets || []).reduce((a, b) => a + (b.durationSeconds || 0), 0);
            rows.push([ex.nome + " - TOTAL", "", String(sum), formatSeconds(sum)]);
            rows.push([]);
        });

        const csvContent = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        const bom = "\uFEFF";
        const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const safeName = (registro.treinoName || "treino").replace(/[^a-z0-9_\-]/gi, "_").toLowerCase();
        const timeSuffix = new Date().toISOString().replace(/[:.]/g, "-");
        a.download = `${safeName}_${timeSuffix}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportPDF = () => {
        const content = `
      <html><head><title>Resumo - ${registro.treinoName}</title>
      <style>body{font-family:Inter,Arial,Helvetica,sans-serif;padding:20px;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:12px}ul{margin:6px 0;padding-left:18px}</style>
      </head><body>
      <h1>Resumo - ${registro.treinoName}</h1>
      <p>Tempo total: ${hasValue(total) ? formatSeconds(total) : "-"}</p>
      ${registro.exerciciosFeitos.map(ex => `
        <h2>${ex.nome} — ${hasValue(ex.tempoTotalExercicio) ? formatSeconds(ex.tempoTotalExercicio) : "-"}</h2>
        <ul>${(ex.sets || []).map(s => `<li>Set ${s.setNumber}: ${hasValue(s.durationSeconds) ? formatSeconds(s.durationSeconds) : "-"}</li>`).join('')}</ul>
      `).join('')}
      </body></html>
    `;
        const w = window.open("", "_blank");
        w.document.write(content);
        w.document.close();
        w.print();
    };

    /* -------------------- SVG logo improvements -------------------- */
    const getAppLogoDataUrl = (size = 240) => {
        // SVG com ícone (halter/dumbbell), gradiente e texto. mais legível e com bordas suaves.
        const svg = `
      <svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${Math.round(size / 3)}' viewBox='0 0 240 64'>
  <defs>
    <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
      <stop offset='0' stop-color='#06b6d4'/>
      <stop offset='1' stop-color='#7c3aed'/>
    </linearGradient>
    <filter id='f' x='-20%' y='-20%' width='140%' height='140%'>
      <feDropShadow dx='0' dy='2' stdDeviation='4' flood-color='#000' flood-opacity='0.18' />
    </filter>
  </defs>

  <rect width='240' height='64' rx='12' fill='white' opacity='0.02' />

  <!-- novo ícone estilo Logo: quadrado azul com quadrado interno branco -->
  <!-- posicionamento: mantém mesma margem da versão anterior (translate(12,12) equivalente) -->
  <g transform='translate(12,12)'>
    <!-- outer square (fundo azul) -->
    <rect x='0' y='0' width='40' height='40' rx='8' fill='#2563EB' filter='url(#f)' />
    <!-- inner hole (quadrado branco centralizado) -->
    <rect x='10' y='10' width='20' height='20' rx='5' fill='white' />
  </g>

  <!-- texto do banner -->
  <text x='68' y='34' font-family='Inter, Arial, Helvetica, sans-serif' font-weight='700' font-size='18' fill='url(#g)'>TreinAI</text>
  <text x='68' y='50' font-family='Inter, Arial, Helvetica, sans-serif' font-weight='500' font-size='10' fill='#94a3b8'>Muito além do Personal Trainner IA.</text>
</svg>

    `;
        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    };

    /* -------------------- camera composite (mantive e melhorei) -------------------- */
    const createCompositeFromFile = async (file) => {
        if (!file) throw new Error("No file");
        const dataUrl = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onerror = () => rej(new Error("FileReader failed"));
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(file);
        });

        const img = await new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = (e) => rej(e);
            i.src = dataUrl;
        });

        const maxWidth = 2000;
        const scale = img.width > maxWidth ? (maxWidth / img.width) : 1;
        const cw = Math.round(img.width * scale);
        const ch = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");

        // draw base image
        ctx.drawImage(img, 0, 0, cw, ch);

        // sticker bottom-left
        const padding = Math.round(Math.max(12, cw * 0.02));
        const stickerWidth = Math.round(Math.min(cw * 0.7, 900));
        const stickerHeight = Math.round(Math.max(80, ch * 0.12));
        const stickerX = padding;
        const stickerY = ch - stickerHeight - padding;

        // background with blur-ish look using semi-transparent rounded rect
        ctx.fillStyle = "rgba(0,0,0,0.56)";
        const r = 14;
        roundRect(ctx, stickerX, stickerY, stickerWidth, stickerHeight, r, true, false);

        // text
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "top";
        const titleFontSize = Math.round(Math.max(16, cw * 0.025));
        ctx.font = `700 ${titleFontSize}px Inter, Arial, Helvetica, sans-serif`;
        ctx.fillText(registro.treinoName || "Treino", stickerX + padding, stickerY + padding);

        const smallFontSize = Math.round(Math.max(12, cw * 0.018));
        ctx.font = `${smallFontSize}px Inter, Arial, Helvetica, sans-serif`;
        const line1 = `Tempo: ${hasValue(total) ? formatSeconds(total) : "-"}`;
        const dateStr = registro.dataExecucao ? (new Date(registro.dataExecucao).toLocaleString()) : new Date().toLocaleString();
        ctx.fillText(line1, stickerX + padding, stickerY + padding + titleFontSize + 6);
        ctx.fillText(dateStr, stickerX + padding, stickerY + padding + titleFontSize + 6 + smallFontSize + 4);

        // draw improved logo top-right
        const logoUrl = getAppLogoDataUrl();
        const logoW = Math.round(Math.min(220, cw * 0.18));
        const logoH = Math.round((64 / 240) * logoW);
        const logoX = cw - logoW - padding;
        const logoY = padding;

        await new Promise((resolve) => {
            const logoImg = new Image();
            logoImg.onload = () => {
                ctx.fillStyle = "rgba(255,255,255,0.06)";
                roundRect(ctx, logoX - 8, logoY - 6, logoW + 16, logoH + 12, 10, true, false);
                ctx.drawImage(logoImg, logoX, logoY, logoW, logoH);
                resolve();
            };
            logoImg.onerror = () => {
                ctx.fillStyle = "#fff";
                ctx.font = `700 ${Math.round(Math.max(14, cw * 0.02))}px Inter, Arial, Helvetica, sans-serif`;
                ctx.fillText("TREINAI", logoX, logoY + (logoH / 2));
                resolve();
            };
            logoImg.src = logoUrl;
        });

        return await new Promise((resolve) => {
            canvas.toBlob((b) => resolve(b), "image/png", 0.95);
        });
    };

    function roundRect(ctx, x, y, w, h, r, fill, stroke) {
        if (r < 0) r = 0;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    const triggerTakePhoto = () => {
        if (fileInputRef.current) {
            fileInputRef.current.value = null;
            fileInputRef.current.click();
        }
    };

    const onPhotoSelected = async (e) => {
        const f = e.target.files?.[0] || null;
        if (!f) return;
        setLocalPhotoFile(f);
        setTakingPhotoProcessing(true);
        try {
            const blob = await createCompositeFromFile(f);
            if (!blob) throw new Error("Failed to compose");
            const url = URL.createObjectURL(blob);
            if (compositeBlobUrl) try { URL.revokeObjectURL(compositeBlobUrl); } catch (e) { }
            setCompositeBlobUrl(url);
            setCompositeBlob(blob);
        } catch (err) {
            console.error("Erro ao compor imagem:", err);
            alert("Não foi possível processar a foto. Tente novamente.");
            setCompositeBlob(null);
            if (compositeBlobUrl) try { URL.revokeObjectURL(compositeBlobUrl); } catch (e) { }
            setCompositeBlobUrl(null);
        } finally {
            setTakingPhotoProcessing(false);
        }
    };

    /* -------------------- robust html-to-image capture -------------------- */
    const loadHtmlToImage = async () => {
        try {
            const mod = await import("html-to-image");
            return mod?.default || mod;
        } catch (err) {
            if (window.htmlToImage) return window.htmlToImage;
            const src = "https://unpkg.com/html-to-image@1.10.11/dist/html-to-image.min.js";
            return new Promise((resolve, reject) => {
                const existing = document.querySelector(`script[src=\"${src}\"]`);
                if (existing) {
                    existing.addEventListener("load", () => resolve(window.htmlToImage || window.htmlToImage));
                    existing.addEventListener("error", (e) => reject(e));
                    return;
                }
                const s = document.createElement("script");
                s.src = src;
                s.async = true;
                s.onload = () => resolve(window.htmlToImage || window.htmlToImage);
                s.onerror = (e) => reject(e);
                document.body.appendChild(s);
            });
        }
    };

    const fetchToDataURL = async (url) => {
        try {
            const res = await fetch(url, { mode: "cors" });
            if (!res.ok) throw new Error(`fetch falhou: ${res.status}`);
            const blob = await res.blob();
            return await new Promise((resolve, reject) => {
                const fr = new FileReader();
                fr.onerror = reject;
                fr.onload = () => resolve(fr.result);
                fr.readAsDataURL(blob);
            });
        } catch (err) {
            console.warn("fetchToDataURL falhou para", url, err);
            throw err;
        }
    };

    const dataURLToBlob = (dataURL) => {
        const parts = dataURL.split(',');
        const match = parts[0].match(/:(.*?);/);
        const mime = match ? match[1] : 'image/png';
        const bstr = atob(parts[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
        return new Blob([u8arr], { type: mime });
    };

    const captureAsBlob = async () => {
        if (!overlayRef.current) throw new Error("Overlay ref not available");
        const htmlToImage = await loadHtmlToImage();
        if (!htmlToImage) throw new Error("html-to-image not available");

        const node = overlayRef.current;
        const pixelRatio = Math.min(Math.max(1, window.devicePixelRatio || 1), 2);
        const options = {
            backgroundColor: tema === "light" ? "#ffffff" : "#0f172a",
            pixelRatio,
            cacheBust: true,
            useCORS: true,
            filter: (n) => {
                // remove elements explicitamente marcados para pular captura
                if (n && n.getAttribute && n.getAttribute('data-skip-capture') !== null) return false;
                return true;
            }
        };

        // clone and inline images/backgrounds
        const clone = node.cloneNode(true);

        // remove preview elements explicitly (double safety)
        try { const skipEls = Array.from(clone.querySelectorAll('[data-skip-capture]')); skipEls.forEach(el => el.parentNode && el.parentNode.removeChild(el)); } catch (e) { }

        // inline computed background-images using getComputedStyle
        const elements = Array.from(clone.querySelectorAll('*'));
        await Promise.all(elements.map(async (el) => {
            try {
                const cs = window.getComputedStyle(el);
                const bg = cs && cs.backgroundImage;
                if (bg && bg !== 'none' && bg.includes('url(')) {
                    const m = /url\(["']?(.*?)["']?\)/.exec(bg);
                    if (m && m[1]) {
                        const url = m[1];
                        if (!url.startsWith('data:') && !url.startsWith('blob:')) {
                            try {
                                const dataUrl = await fetchToDataURL(url);
                                el.style.backgroundImage = `url("${dataUrl}")`;
                            } catch (err) { console.warn('Falha ao inline background-image:', url, err); }
                        }
                    }
                }
            } catch (e) { }

            // inline <img> src
            if (el.tagName && el.tagName.toLowerCase() === 'img') {
                const img = el;
                const src = img.getAttribute('src');
                if (src && !src.startsWith('data:') && !src.startsWith('blob:') && !src.startsWith('about:')) {
                    try {
                        img.setAttribute('crossorigin', 'anonymous');
                        const dataUrl = await fetchToDataURL(src);
                        img.setAttribute('src', dataUrl);
                    } catch (err) {
                        console.warn('Não foi possível injetar dataURL para imagem:', src, err);
                    }
                }
            }
        }));

        // attach clone off-screen to DOM so html-to-image can render it
        // clone.style.position = 'fixed';
        // clone.style.left = '-9999px';
        // clone.style.top = '0';
        // clone.style.opacity = '1';
        document.body.appendChild(clone);

        try {
            if (document?.fonts && typeof document.fonts.ready?.then === 'function') {
                try { await document.fonts.ready; } catch (e) { }
            }
            await new Promise(r => setTimeout(r, 180));

            const toBlobFn = htmlToImage.toBlob || htmlToImage.toPng || htmlToImage.toJpeg;
            if (!toBlobFn) throw new Error('html-to-image não expõe toBlob / toPng / toJpeg');

            // prefer toBlob (binary) when available
            if (htmlToImage.toBlob) {
                const blob = await htmlToImage.toBlob(clone, options);
                if (!blob) throw new Error('Failed to generate blob');
                return blob;
            }

            // fallback: dataURL -> blob
            const dataUrl = await htmlToImage.toPng(clone, options);
            return dataURLToBlob(dataUrl);
        } catch (err) {
            console.warn('Capture via clone falhou, tentando fallback direto no node:', err);
            try {
                const blob = await htmlToImage.toBlob(node, options);
                if (!blob) throw new Error('Fallback também falhou');
                return blob;
            } catch (err2) {
                console.error('Fallback direto também falhou:', err2);
                throw err2;
            }
        } finally {
            if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
        }
    };

    const copyImageToClipboard = async (blob) => {
        if (!navigator.clipboard || !window.ClipboardItem) throw new Error('Clipboard API or ClipboardItem not available');
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
    };

    /* -------------------- Download / Share handlers -------------------- */
    const downloadImage = async () => {
        setProcessingImage(true);
        try {
            const blob = await captureAsBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeName = (registro.treinoName || 'resumo').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
            a.download = `${safeName}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('downloadImage error:', err);
            alert('Erro ao gerar a imagem. Veja console para mais detalhes.');
        } finally {
            setProcessingImage(false);
        }
    };

    const shareImage = async () => {
        setSharing(true);
        try {
            const blob = await captureAsBlob();
            const safeName = (registro.treinoName || 'resumo').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
            const file = new File([blob], `${safeName}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], title: `Resumo ${registro.treinoName}`, text: `Resumo do treino ${registro.treinoName} — ${hasValue(total) ? formatSeconds(total) : '-'}'` });
                    setSharing(false);
                    return;
                } catch (err) { /* continue to fallback */ }
            }

            try {
                await copyImageToClipboard(blob);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
                setSharing(false);
                return;
            } catch (err) { /* fallback to download */ }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('shareImage error:', err);
            alert('Não foi possível gerar/compartilhar a imagem. Veja console para detalhes.');
        } finally {
            setSharing(false);
        }
    };

    const downloadTrainingImage = async () => {
        if (!compositeBlob) return alert('Nenhuma imagem para baixar. Tire uma foto primeiro.');
        const a = document.createElement('a');
        const url = compositeBlobUrl || URL.createObjectURL(compositeBlob);
        a.href = url;
        const safeName = (registro.treinoName || 'treino').replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
        a.download = `${safeName}_${new Date().toISOString().replace(/[:.]/g, '-')}_treino.png`;
        a.click();
        if (!compositeBlobUrl) URL.revokeObjectURL(url);
    };

    const clearPhotoPreview = () => {
        if (compositeBlobUrl) try { URL.revokeObjectURL(compositeBlobUrl); } catch (e) { }
        setCompositeBlobUrl(null);
        setCompositeBlob(null);
        setLocalPhotoFile(null);
        if (fileInputRef.current) fileInputRef.current.value = null;
    };

    const goToPerfil = () => navigate("/dashboard/perfil");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className={`absolute inset-0 ${isLight ? "bg-black/50" : "bg-black/80"} backdrop-blur-sm`} onClick={() => onClose && onClose()} />

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={`relative z-10 w-full max-w-5xl mx-0 md:mx-0 ${themeClass(tema, "bg-white text-gray-900", "bg-gray-900 text-white")} rounded-2xl shadow-2xl overflow-auto ring-1 ring-black/10`}
                style={{ maxHeight: 'calc(100vh - 32px)' }}
            >
                <div className="p-4 md:p-6" ref={overlayRef}>
                    <div className="flex items-start justify-between gap-4 md:gap-6">
                        <div>
                            <div className="inline-flex items-center px-3 py-1 rounded-full bg-gradient-to-r from-green-400 to-blue-500 text-white text-sm font-semibold">Resumo</div>
                            <h2 className="text-xl md:text-2xl font-extrabold mt-3">{registro.treinoName}</h2>
                            <p className="text-xs md:text-sm text-gray-400 mt-1">Ótimo trabalho — aqui está um resumo do seu treino.</p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <div className="text-xs text-gray-400">Tempo total</div>
                                <div className="text-lg md:text-2xl font-semibold">{hasValue(total) ? formatSeconds(total) : "-"}</div>
                                <div className="text-xs text-gray-400">{registro.dataExecucao ? new Date(registro.dataExecucao).toLocaleString() : ""}</div>
                            </div>

                            {/* logo visível no canto superior direito — será capturada junto com o summary */}
                            <img src={getAppLogoDataUrl(240)} alt="logo" style={{ width: 120, height: 32, objectFit: 'contain' }} />

                            <button onClick={() => onClose && onClose()} aria-label="Fechar" className={`p-2 rounded-md hover:opacity-90 ${themeClass(tema, "bg-gray-100 text-gray-700", "bg-gray-800 text-gray-200")}`}>
                                <FaTimes />
                            </button>
                        </div>
                    </div>

                    {/* exercises list */}
                    <div className="mt-5 space-y-4">
                        {(registro.exerciciosFeitos || []).map((ex, i) => (
                            <div key={i} className={`p-3 md:p-4 rounded-xl border ${isLight ? "bg-gray-50" : "bg-gray-800"} ${isLight ? "border-gray-100" : "border-gray-800"} shadow-sm`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-md md:text-lg font-semibold">{ex.nome}</div>
                                        {ex.observacao && <div className="text-xs text-gray-400 mt-1">{ex.observacao}</div>}
                                    </div>

                                    <div className="flex-shrink-0 text-right ml-3">
                                        {hasValue(ex.tempoTotalExercicio) ? (
                                            <>
                                                <div className="text-xs text-gray-400">Tempo</div>
                                                <div className="text-md md:text-lg font-semibold">{formatSeconds(ex.tempoTotalExercicio)}</div>
                                            </>
                                        ) : (
                                            <div className="text-xs text-gray-400 italic">Sem tempo registrado</div>
                                        )}

                                        {compare && compare[i] && (
                                            <div className="mt-2 text-xs">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${compare[i].diff > 0 ? 'bg-red-600 text-white' : compare[i].diff < 0 ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-800'}`}>
                                                    {compare[i].diff > 0 ? `+${formatSeconds(compare[i].diff)} slower` : compare[i].diff < 0 ? `-${formatSeconds(Math.abs(compare[i].diff))} faster` : '±0'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-400">
                                    {(ex.sets || []).map((s, j) => (
                                        <div key={j} className="flex items-center justify-between p-2 rounded bg-transparent border border-transparent">
                                            <div>Set {s.setNumber}</div>
                                            <div className="font-medium">{hasValue(s.durationSeconds) ? formatSeconds(s.durationSeconds) : '-'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* aside (stacked under exercises) */}
                    <div className="mt-5">
                        <div className={`rounded-xl p-3 mb-4 ${themeClass(tema, 'bg-white', 'bg-gray-800')} shadow-sm border ${isLight ? 'border-gray-100' : 'border-gray-800'}`}>
                            <div className="text-sm font-medium mb-2">Comparativo</div>
                            {userHistorico && userHistorico.length ? (
                                <div className="w-full h-40 md:h-44 overflow-hidden">
                                    <HistoricoChart historico={userHistorico} tema={tema} summary={true} />
                                </div>
                            ) : (
                                <div className="text-xs text-gray-400">Sem treino anterior para comparação.</div>
                            )}
                        </div>

                        <div className={`rounded-xl p-3 mb-4 ${themeClass(tema, 'bg-white', 'bg-gray-800')} shadow-sm border ${isLight ? 'border-gray-100' : 'border-gray-800'}`}>
                            <div className="text-sm font-medium mb-2">Exportar / Compartilhar</div>
                            <div className="flex flex-col gap-2">
                                <button onClick={exportCSV} className="w-full px-3 py-2 rounded-md bg-blue-600 text-white flex items-center justify-center gap-2 text-sm"><FaDownload /> Exportar CSV</button>
                                <button onClick={exportPDF} className="w-full px-3 py-2 rounded-md bg-gray-100 text-red-500 font-medium text-sm">Exportar PDF</button>

                                <div className="flex gap-2">
                                    <button onClick={triggerTakePhoto} className="flex-1 px-3 py-2 rounded-md flex items-center justify-center gap-2 text-sm bg-green-600 text-white">
                                        <FaCamera /> Tirar foto
                                    </button>

                                    <button onClick={downloadImage} disabled={processingImage} className={`px-3 py-2 rounded-md flex items-center justify-center gap-2 text-sm ${processingImage ? 'bg-gray-300 text-gray-700' : 'bg-gray-200 text-gray-800'}`}>
                                        <FaDownload /> {processingImage ? 'Gerando...' : 'Salvar imagem (resumo)'}
                                    </button>
                                </div>

                                <button onClick={shareImage} disabled={sharing} className="w-full px-3 py-2 rounded-md bg-blue-600 text-white flex items-center justify-center gap-2 text-sm">
                                    <FaShareAlt /> {sharing ? 'Compartilhando...' : copied ? 'Copiado' : 'Compartilhar imagem'}
                                </button>
                            </div>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={onPhotoSelected}
                                style={{ display: "none" }}
                            />

                            {compositeBlobUrl && (
                                <div className="mt-3" data-skip-capture>
                                    <div className="text-xs text-gray-400 mb-2">Pré-visualização rápida (não salva no resumo geral):</div>
                                    <div className="flex items-center gap-3">
                                        <img src={compositeBlobUrl} alt="preview treino" className="w-44 h-28 object-cover rounded border" />
                                        <div className="flex flex-col gap-2">
                                            <button onClick={downloadTrainingImage} className="px-3 py-1 rounded bg-blue-600 text-white text-sm flex items-center gap-2">
                                                <FaDownload /> Baixar imagem de treino
                                            </button>
                                            <button onClick={clearPhotoPreview} className="px-3 py-1 rounded border text-sm">Refazer foto</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={`rounded-xl p-3 ${themeClass(tema, 'bg-white', 'bg-gray-800')} shadow-sm border ${isLight ? 'border-gray-100' : 'border-gray-800'}`}>
                            <div className="text-sm font-medium">Notas rápidas</div>
                            <div className="text-xs text-gray-400 mt-2">Use o campo abaixo no app principal para salvar observações sobre a sessão.</div>

                            <div className="mt-3">
                                <button onClick={goToPerfil} className="w-full px-3 py-2 rounded-md bg-yellow-500 text-black font-semibold hover:bg-yellow-600">Atualizar minhas informações</button>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default SummaryOverlay;
