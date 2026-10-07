import { Input } from "antd";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, X, SendHorizontal } from "lucide-react";
import api from "../api";

export const assistantBus = new EventTarget();

export default function AiAssistant() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const box = useRef();
  useEffect(() => { box.current?.scrollTo(0, 1e6); }, [msgs, open]);

  const send = async () => {
    const text = q.trim();
    if (!text) return;
    setMsgs((m) => [...m, { me: true, text }]);
    setQ("");
    setBusy(true);
    try {
      const { data } = await api.post("/api/assistant/ask", { question: text, lang: i18n.language });
      setMsgs((m) => [...m, { text: data.answer, action: data.action }]);
    } catch { setMsgs((m) => [...m, { text: t("common.error") }]); }
    setBusy(false);
  };

  return (
    <>
      {open && (
        <div className="rv-ai-panel">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--rv-border)" }}>
            <b style={{ display: "flex", gap: 8, alignItems: "center" }}><Sparkles size={18} color="var(--rv-primary)" /> SilkRail · {t("map.assistant")}</b>
            <X size={18} style={{ cursor: "pointer" }} onClick={() => setOpen(false)} />
          </div>
          <div className="rv-ai-msgs" ref={box}>
            <div className="rv-ai-msg bot">{t("map.assistantHello")}</div>
            {msgs.map((m, i) => (
              <div key={i} className={`rv-ai-msg ${m.me ? "me" : "bot"}`}>
                {m.text}
                {m.action?.type === "openStation" && (
                  <div><a onClick={() => assistantBus.dispatchEvent(new CustomEvent("openStation", { detail: m.action.id }))}>{t("map.open")} →</a></div>
                )}
              </div>
            ))}
            {busy && <div className="rv-ai-msg bot">…</div>}
          </div>
          <div style={{ padding: 10, borderTop: "1px solid var(--rv-border)", display: "flex", gap: 8 }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} onPressEnter={send} placeholder={t("map.askPh")} />
            <button className="rv-dock-btn active" onClick={send} aria-label="send"><SendHorizontal size={16} /></button>
          </div>
        </div>
      )}
      <button className="rv-ai-fab" onClick={() => setOpen((o) => !o)} aria-label="assistant">
        {open ? <X size={24} /> : <Sparkles size={26} />}
      </button>
    </>
  );
}
