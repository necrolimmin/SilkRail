import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { VideoOff } from "lucide-react";

export default function CameraPlayer({ url, online = true, name, controls = false, autoPlay = true }) {
  const ref = useRef();
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v || !url || !online) return;
    setFailed(false);
    let hls;
    if (v.canPlayType("application/vnd.apple.mpegurl")) {
      v.src = url;
    } else if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 10 });
      hls.loadSource(url);
      hls.attachMedia(v);
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) setFailed(true); });
    } else setFailed(true);
    return () => hls?.destroy();
  }, [url, online]);

  return (
    <div className="rv-cam">
      {online && !failed ? (
        <video ref={ref} muted autoPlay={autoPlay} playsInline controls={controls} />
      ) : (
        <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#94a3b8", textAlign: "center" }}>
          <div><VideoOff size={32} /><div style={{ fontSize: 12, marginTop: 6 }}>{t("cameras.noStream")}</div></div>
        </div>
      )}
      <div className="cap">
        <span>{name}</span>
        {online && !failed ? <span className="rv-live">LIVE</span> : <span style={{ opacity: .7 }}>{t("common.offline")}</span>}
      </div>
    </div>
  );
}
