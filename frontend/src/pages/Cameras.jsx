import { Input, Segmented, Select, Pagination } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cctv, Wifi, WifiOff, LayoutGrid, Grid2x2, Grid3x3 } from "lucide-react";
import { Loader, NoData, StatCard, useFetch } from "../components/ui";
import CameraPlayer from "../components/CameraPlayer";
import { get } from "../api";

export default function Cameras() {
  const { t } = useTranslation();
  const [group, setGroup] = useState(0);
  const [station, setStation] = useState();
  const [q, setQ] = useState("");
  const [cols, setCols] = useState(3);
  const [page, setPage] = useState(1);
  const [groups, setGroups] = useState([]);
  const [status, setStatus] = useState(null);
  useEffect(() => { get("/api/cameras/groups").then(setGroups); get("/api/cameras/status").then(setStatus); }, []);
  const { data, loading } = useFetch("/api/cameras", { group: group || undefined, station, q });
  const per = cols * cols;
  const items = (data || []).slice((page - 1) * per, page * per);
  const stations = [...new Map((data || []).map((c) => [c.stationId, c.station])).entries()].map(([value, label]) => ({ value, label }));

  return (
    <div className="rv-page">
      <div className="rv-toolbar">
        <h2 className="rv-title">{t("cameras.title")}</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Input.Search allowClear placeholder={t("common.search")} style={{ width: 200 }} onSearch={(v) => { setQ(v); setPage(1); }} />
          <Select allowClear showSearch optionFilterProp="label" placeholder={t("common.station")} style={{ width: 180 }} value={station} onChange={(v) => { setStation(v); setPage(1); }} options={stations} />
          <Segmented value={cols} onChange={(v) => { setCols(v); setPage(1); }} options={[{ value: 2, icon: <Grid2x2 size={15} /> }, { value: 3, icon: <Grid3x3 size={15} /> }, { value: 4, icon: <LayoutGrid size={15} /> }]} />
        </div>
      </div>
      {status && (
        <div className="rv-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 14 }}>
          <StatCard label={t("cameras.total")} value={status.total} icon={Cctv} />
          <StatCard label={t("cameras.online")} value={status.online} icon={Wifi} color="#16a34a" />
          <StatCard label={t("cameras.offline")} value={status.offline} icon={WifiOff} color="#ef4444" />
        </div>
      )}
      <div className="rv-pill-tabs" style={{ marginBottom: 14 }}>
        <button className={`rv-pill ${group === 0 ? "active" : ""}`} onClick={() => { setGroup(0); setPage(1); }}>{t("common.all")}</button>
        {groups.map((g) => <button key={g.id} className={`rv-pill ${group === g.id ? "active" : ""}`} onClick={() => { setGroup(g.id); setPage(1); }}>{g.name} · {g.count}</button>)}
      </div>
      <Loader loading={loading}>
        {items.length ? (
          <>
            <div className="rv-cam-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
              {items.map((c) => <CameraPlayer key={c.id} url={c.streamUrl} online={c.online} name={`${c.name} · ${c.vendor}`} controls />)}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <Pagination current={page} pageSize={per} total={data.length} onChange={setPage} showSizeChanger={false} />
            </div>
          </>
        ) : <div className="rv-card"><NoData /></div>}
      </Loader>
    </div>
  );
}
