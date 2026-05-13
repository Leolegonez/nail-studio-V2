import { useState, useRef, useCallback } from "react";

// 🔑 AQUÍ PON TU API KEY DE GEMINI (obtenla gratis en https://aistudio.google.com/app/apikey)
const GEMINI_API_KEY = "AIzaSyA7MIHAkaNGTsE2zANeYUgrRwoZeTVdPk4";

// ─── ESTILOS GLOBALES ────────────────────────────────────────────────────────
const styleTag = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=DM+Mono:wght@300;400&display=swap');
  @keyframes fadeUp   { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse    { 0%,100% { opacity:0.3; transform:scale(0.8); } 50% { opacity:1; transform:scale(1); } }
  @keyframes shimmer  { 0% { background-position:-200% center; } 100% { background-position:200% center; } }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  body { margin:0; background:#12001e; }
  textarea::placeholder { color:rgba(240,223,240,0.3); }
  .upload-label { display:block; cursor:pointer; }
  .upload-label input[type=file] { display:none; }
`;

// ─── DATOS ───────────────────────────────────────────────────────────────────
const TONES = [
  { value: "elegante",    emoji: "✨", label: "Elegante"  },
  { value: "divertido",   emoji: "🎉", label: "Divertido" },
  { value: "romantico",   emoji: "🌸", label: "Romántico" },
  { value: "minimalista", emoji: "🤍", label: "Minimal"   },
];

const PLATFORMS = [
  { value: "instagram", emoji: "📸", label: "Instagram" },
  { value: "tiktok",    emoji: "🎵", label: "TikTok"    },
  { value: "ambos",     emoji: "✨", label: "Ambos"     },
];

// ─── UTILIDADES ──────────────────────────────────────────────────────────────
function parseResult(text) {
  const captionMatch  = text.match(/CAPTION[:\s]*([\s\S]*?)(?=HASHTAGS|HORA|$)/i);
  const hashtagsMatch = text.match(/HASHTAGS[:\s]*([\s\S]*?)(?=HORA|CAPTION|$)/i);
  const horaMatch     = text.match(/HORA[:\s]*([\s\S]*?)(?=CAPTION|HASHTAGS|$)/i);
  return {
    caption:  captionMatch  ? captionMatch[1].trim()  : text,
    hashtags: hashtagsMatch ? hashtagsMatch[1].trim() : "",
    hora:     horaMatch     ? horaMatch[1].trim()     : "",
  };
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve({
      base64:    e.target.result.split(",")[1],
      mediaType: file.type || "image/jpeg",
    });
    reader.onerror = () => reject(new Error("No se pudo leer la imagen"));
    reader.readAsDataURL(file);
  });
}

// ─── MICRO-COMPONENTES ───────────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
        color: "rgba(200,80,160,0.65)", marginBottom: 10,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function ChipButton({ active, onClick, children, accent = "#c850a0" }) {
  return (
    <button onClick={onClick} style={{
      padding: "8px 14px", borderRadius: 20, fontSize: 12,
      cursor: "pointer", transition: "all 0.2s", fontFamily: "'DM Mono',monospace",
      border:      active ? `1px solid ${accent}cc`          : "1px solid rgba(255,255,255,0.1)",
      background:  active ? `${accent}28`                    : "rgba(255,255,255,0.03)",
      color:       active ? "#f5c0e0"                        : "rgba(240,223,240,0.45)",
    }}>
      {children}
    </button>
  );
}

function ResultBlock({ title, children, borderColor = "rgba(200,80,160,0.2)" }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: `1px solid ${borderColor}`,
      borderRadius: 16, padding: 16, marginBottom: 12,
    }}>
      <div style={{
        fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase",
        color: "rgba(240,223,240,0.3)", marginBottom: 10,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function CopyButton({ text, label, copiedKey, copied, onCopy }) {
  const done = copied === copiedKey;
  return (
    <button onClick={() => onCopy(text, copiedKey)} style={{
      marginTop: 12, width: "100%", padding: "10px",
      background: done ? "rgba(80,200,120,0.15)"        : "rgba(200,80,160,0.1)",
      border:     done ? "1px solid rgba(80,200,120,0.4)" : "1px solid rgba(200,80,160,0.25)",
      borderRadius: 10,
      color:      done ? "#80f0a0"                       : "#f5c0e0",
      fontSize: 11, cursor: "pointer", fontFamily: "'DM Mono',monospace",
      letterSpacing: "0.08em", transition: "all 0.3s",
    }}>
      {done ? "✓ copiado" : label}
    </button>
  );
}

function Dots() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "20px 0 8px" }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "linear-gradient(135deg,#c850a0,#8050c8)",
          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }}/>
      ))}
    </div>
  );
}

function Divider({ label }) {
  const line = { flex: 1, height: 1, background: "rgba(200,80,160,0.2)" };
  return (
    <div style={{
      fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase",
      color: "#c850a0", marginBottom: 14,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <div style={line}/>{label}<div style={line}/>
    </div>
  );
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function NailAgent() {
  const [imageURL, setImageURL] = useState(null);
  const [imgData,  setImgData]  = useState(null);
  const [imgReady, setImgReady] = useState(false);
  const [tone,     setTone]     = useState("elegante");
  const [platform, setPlatform] = useState("instagram");
  const [extra,    setExtra]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [copied,   setCopied]   = useState("");
  const prevURL  = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    if (prevURL.current) URL.revokeObjectURL(prevURL.current);
    const url = URL.createObjectURL(file);
    prevURL.current = url;
    setImageURL(url);
    setResult(null);
    setError(null);
    setImgReady(false);
    try {
      const data = await readFileAsBase64(file);
      setImgData(data);
      setImgReady(true);
    } catch {
      setError("No se pudo leer la imagen. Prueba con otra foto.");
    }
  }, []);

  const generate = async () => {
    if (!imgReady || !imgData) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const systemPrompt = `Eres un agente experto en marketing para nail art y belleza estética.
Analizas fotos de uñas y creas contenido viral en español para redes sociales.
Tono requerido: ${tone}. Plataforma: ${platform}.
Responde ÚNICAMENTE con este formato exacto, sin texto adicional antes ni después:

CAPTION:
[caption, máximo 120 palabras, con emojis y llamada a la acción al final]

HASHTAGS:
[25 hashtags separados por espacio, empezando con #, mezcla español e inglés]

HORA:
[una línea con la mejor hora, ej: "19:00 — Mayor actividad tras el trabajo"]`;

    const userMsg = `Analiza esta foto de uñas y genera el contenido completo.${extra ? `\nDetalle extra: ${extra}` : ""}`;

    try {
      // Llamada a Gemini con imagen en base64
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: systemPrompt + "\n\n" + userMsg },
                  {
                    inlineData: {
                      mimeType: imgData.mediaType,
                      data: imgData.base64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1000,
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error?.message || `Error ${response.status}`;
        throw new Error(errorMsg);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("La IA no devolvió contenido. Intenta de nuevo.");

      setResult(parseResult(text));
    } catch (err) {
      console.error("Error Gemini:", err);
      setError(err.message || "Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text, key) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(""), 2500);
    } else {
      setError("No se pudo copiar automáticamente. Mantén pulsado el texto para copiar.");
    }
  };

  const reset = () => {
    if (prevURL.current) { URL.revokeObjectURL(prevURL.current); prevURL.current = null; }
    setImageURL(null);
    setImgData(null);
    setImgReady(false);
    setResult(null);
    setError(null);
    setExtra("");
  };

  const tags = result?.hashtags
    ? result.hashtags.split(/\s+/).filter(t => t.startsWith("#")).slice(0, 25)
    : [];

  const canGenerate = imgReady && !loading;
  const btnLabel = loading      ? "⏳ Generando copy…"
                 : !imageURL    ? "Sube una foto primero"
                 : !imgReady    ? "Cargando imagen…"
                 :                "✨ Generar Contenido";

  return (
    <>
      <style>{styleTag}</style>
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg,#12001e 0%,#1e0030 50%,#0e0818 100%)",
        fontFamily: "'DM Mono',monospace",
        color: "#f0dff0",
        maxWidth: 480,
        margin: "0 auto",
        paddingBottom: 80,
      }}>
        {/* HEADER */}
        <div style={{
          padding: "36px 20px 24px", textAlign: "center",
          borderBottom: "1px solid rgba(200,80,160,0.15)",
        }}>
          <div style={{
            fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase",
            color: "rgba(240,223,240,0.35)", marginBottom: 10,
          }}>
            AI Secretaria · Módulo Marketing
          </div>
          <h1 style={{
            margin: 0, fontFamily: "'Playfair Display',serif",
            fontSize: 28, fontWeight: 600,
            background: "linear-gradient(135deg,#f5c0e0 0%,#e0a8f5 50%,#a8c8f5 100%)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "shimmer 4s linear infinite", lineHeight: 1.2,
          }}>
            Nail Content<br/>
            <span style={{ fontStyle: "italic", fontWeight: 400 }}>Studio</span>
          </h1>
          <p style={{
            margin: "10px 0 0", fontSize: 11,
            color: "rgba(240,223,240,0.3)", letterSpacing: "0.08em",
          }}>
            sube foto → copy listo en segundos
          </p>
        </div>

        <div style={{ padding: "24px 16px 0" }}>
          {/* PASO 1: FOTO */}
          <Section label="01 · Foto de las uñas">
            <label className="upload-label">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                onChange={e => handleFile(e.target.files[0])}
              />
              <div style={{
                border: imageURL
                  ? "2px solid rgba(200,80,160,0.5)"
                  : "2px dashed rgba(200,80,160,0.3)",
                borderRadius: 18, overflow: "hidden", cursor: "pointer",
                background: "rgba(200,80,160,0.05)",
                minHeight: imageURL ? "auto" : 140,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                transition: "all 0.3s", position: "relative",
              }}>
                {imageURL ? (
                  <>
                    <img src={imageURL} alt="preview" style={{
                      width: "100%", maxHeight: 220, objectFit: "cover", display: "block",
                    }}/>
                    {!imgReady && (
                      <div style={{
                        position: "absolute", inset: 0,
                        background: "rgba(18,0,30,0.65)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, color: "rgba(240,223,240,0.6)",
                      }}>
                        Cargando imagen…
                      </div>
                    )}
                    <div style={{
                      position: "absolute", bottom: 10, right: 10,
                      background: "rgba(0,0,0,0.55)", borderRadius: 20,
                      padding: "4px 12px", fontSize: 10, color: "#f0dff0",
                      backdropFilter: "blur(8px)",
                    }}>
                      cambiar foto
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>💅</div>
                    <div style={{
                      fontSize: 13, color: "rgba(240,223,240,0.45)",
                      textAlign: "center", padding: "0 20px", lineHeight: 1.6,
                    }}>
                      Toca para subir<br/>
                      <span style={{ fontSize: 11, color: "rgba(240,223,240,0.25)" }}>
                        Cámara o galería · JPG / PNG
                      </span>
                    </div>
                  </>
                )}
              </div>
            </label>
          </Section>

          {/* PASO 2: TONO */}
          <Section label="02 · Tono">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {TONES.map(t => (
                <ChipButton key={t.value} active={tone === t.value} onClick={() => setTone(t.value)}>
                  {t.emoji} {t.label}
                </ChipButton>
              ))}
            </div>
          </Section>

          {/* PASO 3: PLATAFORMA */}
          <Section label="03 · Plataforma">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PLATFORMS.map(p => (
                <ChipButton key={p.value} active={platform === p.value} onClick={() => setPlatform(p.value)} accent="#8050c8">
                  {p.emoji} {p.label}
                </ChipButton>
              ))}
            </div>
          </Section>

          {/* PASO 4: EXTRA */}
          <Section label="04 · Detalle extra (opcional)">
            <textarea
              value={extra}
              onChange={e => setExtra(e.target.value)}
              placeholder="Ej: gel francés, promo 2x1, clienta VIP…"
              rows={2}
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(200,80,160,0.2)", borderRadius: 12,
                padding: "12px 14px", color: "#f0dff0", fontSize: 13,
                outline: "none", resize: "none",
                fontFamily: "'DM Mono',monospace", lineHeight: 1.6,
              }}
            />
          </Section>

          {/* BOTÓN GENERAR */}
          <button
            onClick={generate}
            disabled={!canGenerate}
            style={{
              width: "100%", padding: "18px",
              background: canGenerate
                ? "linear-gradient(135deg,#c850a0,#8050c8)"
                : "rgba(200,80,160,0.1)",
              border: "none", borderRadius: 16,
              color: canGenerate ? "#fff" : "rgba(240,223,240,0.25)",
              fontSize: 15, fontWeight: 600,
              cursor: canGenerate ? "pointer" : "not-allowed",
              fontFamily: "'DM Mono',monospace", letterSpacing: "0.06em",
              transition: "all 0.3s",
              boxShadow: canGenerate ? "0 8px 32px rgba(200,80,160,0.3)" : "none",
            }}
          >
            {btnLabel}
          </button>

          {loading && <Dots/>}

          {/* ERROR */}
          {error && (
            <div style={{
              marginTop: 16, padding: 14,
              background: "rgba(200,60,60,0.08)",
              border: "1px solid rgba(200,60,60,0.3)",
              borderRadius: 12, color: "#f5a0a0",
              fontSize: 12, lineHeight: 1.5,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* RESULTADO */}
          {result && (
            <div style={{ marginTop: 24, animation: "fadeUp 0.5s ease" }}>
              <Divider label="contenido listo"/>
              <ResultBlock title="Caption">
                <div style={{ fontSize: 14, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
                  {result.caption}
                </div>
                <CopyButton text={result.caption} label="copiar caption" copiedKey="caption" copied={copied} onCopy={handleCopy}/>
              </ResultBlock>
              {tags.length > 0 && (
                <ResultBlock title={`Hashtags (${tags.length})`} borderColor="rgba(168,120,245,0.25)">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {tags.map((t, i) => (
                      <span key={i} style={{
                        background: "rgba(168,120,245,0.12)",
                        border: "1px solid rgba(168,120,245,0.25)",
                        borderRadius: 20, padding: "4px 10px",
                        fontSize: 11, color: "#d4b4f0",
                      }}>{t}</span>
                    ))}
                  </div>
                  <CopyButton text={tags.join(" ")} label="copiar hashtags" copiedKey="tags" copied={copied} onCopy={handleCopy}/>
                </ResultBlock>
              )}
              {result.hora && (
                <ResultBlock title="Mejor hora para publicar" borderColor="rgba(168,200,245,0.2)">
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ fontSize: 22, lineHeight: 1 }}>⏰</span>
                    <div style={{ fontSize: 13, color: "#c8d8f5", lineHeight: 1.5 }}>
                      {result.hora}
                    </div>
                  </div>
                </ResultBlock>
              )}
              <button onClick={reset} style={{
                width: "100%", padding: "14px", marginTop: 4,
                background: "transparent",
                border: "1px solid rgba(200,80,160,0.18)",
                borderRadius: 14, color: "rgba(240,223,240,0.35)",
                fontSize: 12, cursor: "pointer",
                fontFamily: "'DM Mono',monospace", letterSpacing: "0.08em",
              }}>
                ↩ nueva foto
              </button>
            </div>
          )}

          {!result && !loading && (
            <div style={{ marginTop: 28, paddingBottom: 8 }}>
              <div style={{
                fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase",
                color: "rgba(200,80,160,0.35)", marginBottom: 12, textAlign: "center",
              }}>
                Consejos
              </div>
              {[
                { icon: "💡", text: "Buena luz natural = mejor análisis de la IA" },
                { icon: "🕕", text: "Publica entre 18:00–20:00 para más alcance" },
                { icon: "✍️", text: "Añade detalle extra para copys únicos" },
              ].map((tip, i, arr) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                  borderBottom: i < arr.length-1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                }}>
                  <span style={{ fontSize: 18 }}>{tip.icon}</span>
                  <span style={{ fontSize: 12, color: "rgba(240,223,240,0.38)", lineHeight: 1.4 }}>
                    {tip.text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
