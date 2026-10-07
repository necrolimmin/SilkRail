import { App, Button, Modal, Table, Tag, Upload } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileDown, FileUp } from "lucide-react";
import api from "../../api";

/** Excel round-trip for one section of a station: download a pre-filled template, upload it back (admin only). */
export function ExcelTools({ st, kind, onImported }) {
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(null); // "down" | "up"
  const [errors, setErrors] = useState(null);

  const download = async () => {
    setBusy("down");
    try {
      const r = await api.get(`/api/stations/${st.id}/template/${kind}`, { params: { lang: i18n.language }, responseType: "blob" });
      const cd = r.headers["content-disposition"] || "";
      const name = decodeURIComponent((cd.match(/filename\*=UTF-8''([^;]+)/) || [])[1] || `${st.name}_${kind}.xlsx`);
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { message.error(t("common.error")); } finally { setBusy(null); }
  };

  const upload = async ({ file }) => {
    if (!/\.xlsx$/i.test(file.name)) { message.error(t("records.err.bad_file")); return; }
    const fd = new FormData();
    fd.append("file", file);
    setBusy("up");
    try {
      const { data } = await api.post(`/api/stations/${st.id}/template/${kind}`, fd);
      message.success(t("records.imported", { n: data.imported }));
      onImported?.();
    } catch (e) {
      const d = e.response?.data?.detail || {};
      if (d.code === "invalid") setErrors(d.errors);
      else if (d.code === "wrong_station") message.error(t("records.err.wrong_station", { esr: d.fileEsr }));
      else message.error(t(`records.err.${d.code}`, { defaultValue: t("common.error") }));
    } finally { setBusy(null); }
  };

  return (
    <>
      <Button icon={<FileDown size={15} />} loading={busy === "down"} onClick={download}>{t("records.download")}</Button>
      <Upload accept=".xlsx" showUploadList={false} customRequest={upload} disabled={!!busy}>
        <Button icon={<FileUp size={15} />} loading={busy === "up"}>{t("records.upload")}</Button>
      </Upload>
      <Modal open={!!errors} onCancel={() => setErrors(null)} footer={null} width={720} title={t("records.errTitle")}>
        <p className="rv-muted" style={{ marginTop: 0 }}>{t("records.errHint")}</p>
        <Table size="small" rowKey={(r) => `${r.row}-${r.col}-${r.code}`} pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={errors || []}
          columns={[
            { title: t("records.row"), dataIndex: "row", width: 70 },
            { title: t("records.col"), render: (r) => <span><Tag>{r.col}</Tag>{t(`records.fields.${r.field}`)}</span> },
            { title: t("records.problem"), render: (r) => t(`records.err.${r.code}`) },
            { title: t("records.value"), dataIndex: "value", render: (v) => (v ? <code>{v}</code> : "—") },
          ]} />
      </Modal>
    </>
  );
}
