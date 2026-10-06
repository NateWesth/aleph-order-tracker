import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const FABRICATION_STAGES = [
  ["stripping", "Stripping"],
  ["awaiting_quote_approval", "Awaiting quote approval"],
  ["de_tiling", "De-tiling"],
  ["sandblasting", "Sandblasting"],
  ["welding", "Welding"],
  ["assembly", "Assembly"],
  ["ready_for_collection", "Ready for collection"],
  ["completed", "Completed"],
] as const;

export const stageLabel = (stage: string) => FABRICATION_STAGES.find(([v]) => v === stage)?.[1] || stage;
export const stageIndex = (stage: string) => FABRICATION_STAGES.findIndex(([v]) => v === stage);

export interface FabProject {
  id: string; project_number: string | null; name: string; client_name: string | null;
  start_date: string; due_date: string | null; stage: string; priority: string;
  assigned_to: string | null; description: string | null; notes: string | null;
  completed_at: string | null; created_at: string;
}
export interface FabMaterial { id: string; material: string; quantity: number; unit: string | null; notes: string | null }
export interface FabPart { id: string; name: string; quantity: number; status: string }
export interface FabTime { id: string; work_date: string; worker_name: string | null; hours: number; note: string | null }
export interface FabFile { id: string; file_name: string; storage_path: string; mime_type: string | null; file_size: number | null; created_at: string; url?: string }

const fmt = (d?: string | null) => d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : "—";

async function toDataUrl(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob); });
    const dims = await new Promise<{ w: number; h: number }>((res) => { const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.onerror = () => res({ w: 1, h: 1 }); i.src = data; });
    return { data, ...dims };
  } catch { return null; }
}

// Logo palette (print-safe RGB)
const CYAN: [number, number, number] = [14, 165, 233];
const VIOLET: [number, number, number] = [124, 58, 237];
const INK: [number, number, number] = [24, 27, 33];
const MUTED: [number, number, number] = [110, 116, 128];

export async function generateFabricationPdf(opts: {
  project: FabProject; materials: FabMaterial[]; parts: FabPart[]; time: FabTime[]; files: FabFile[]; assignee?: string;
}) {
  const { project, materials, parts, time, files } = opts;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 14;
  let y = 0;

  // Header band
  doc.setFillColor(...INK); doc.rect(0, 0, W, 30, "F");
  doc.setFillColor(...CYAN); doc.rect(0, 30, W / 2, 1.4, "F");
  doc.setFillColor(...VIOLET); doc.rect(W / 2, 30, W / 2, 1.4, "F");
  const logo = await toDataUrl("/lovable-uploads/e1088147-889e-43f6-bdf0-271189b88913.png");
  if (logo) { const h = 16, w = Math.min(40, (logo.w / logo.h) * h); doc.addImage(logo.data, "PNG", M, 7, w, h); }
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Fabrication Project", W - M, 13, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text(`${project.project_number || "No project number"}  ·  Printed ${fmt(new Date().toISOString())}`, W - M, 20, { align: "right" });
  y = 40;

  // Title
  doc.setTextColor(...INK); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(project.name, W - M * 2);
  doc.text(titleLines, M, y); y += titleLines.length * 7 + 2;

  // Detail grid
  const details: [string, string][] = [
    ["Client", project.client_name || "—"], ["Stage", stageLabel(project.stage)],
    ["Start date", fmt(project.start_date)], ["Due date", fmt(project.due_date)],
    ["Priority", project.priority], ["Assigned to", opts.assignee || "Unassigned"],
    ["Total hours", `${time.reduce((s, t) => s + Number(t.hours || 0), 0).toFixed(1)} h`], ["Completed", fmt(project.completed_at)],
  ];
  doc.setFillColor(246, 247, 249); doc.roundedRect(M, y, W - M * 2, 34, 2, 2, "F");
  details.forEach(([k, v], i) => {
    const col = i % 4, row = Math.floor(i / 4);
    const x = M + 4 + col * ((W - M * 2 - 8) / 4), yy = y + 8 + row * 15;
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(k.toUpperCase(), x, yy);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(v, 42)[0], x, yy + 5);
  });
  y += 42;

  // Stage tracker
  const current = stageIndex(project.stage);
  const step = (W - M * 2) / FABRICATION_STAGES.length;
  doc.setDrawColor(220, 222, 228); doc.setLineWidth(0.8); doc.line(M + step / 2, y + 3, W - M - step / 2, y + 3);
  FABRICATION_STAGES.forEach(([, label], i) => {
    const cx = M + step * i + step / 2;
    const done = i <= current;
    doc.setFillColor(...(done ? (i === current ? VIOLET : CYAN) : ([220, 222, 228] as [number, number, number])));
    doc.circle(cx, y + 3, 2.6, "F");
    doc.setFontSize(6.5); doc.setFont("helvetica", i === current ? "bold" : "normal");
    doc.setTextColor(...(done ? INK : MUTED));
    doc.text(doc.splitTextToSize(label, step - 2), cx, y + 10, { align: "center" });
  });
  y += 20;

  const section = (title: string) => {
    if (y > 262) { doc.addPage(); y = 18; }
    doc.setFillColor(...CYAN); doc.rect(M, y - 3.5, 1.2, 5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...INK); doc.text(title, M + 3.5, y); y += 4;
  };
  const para = (text: string) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(text, W - M * 2);
    lines.forEach((l: string) => { if (y > 280) { doc.addPage(); y = 18; } doc.text(l, M, y + 3); y += 4.6; });
    y += 4;
  };
  const table = (head: string[], body: (string | number)[][], empty: string) => {
    autoTable(doc, {
      startY: y, head: [head], body: body.length ? body : [[{ content: empty, colSpan: head.length, styles: { textColor: MUTED, fontStyle: "italic" } } as any]],
      margin: { left: M, right: M }, theme: "grid",
      headStyles: { fillColor: INK, textColor: 255, fontSize: 8.5 }, bodyStyles: { fontSize: 9, textColor: INK },
      alternateRowStyles: { fillColor: [248, 249, 251] }, styles: { lineColor: [225, 227, 232], cellPadding: 2 },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  };

  if (project.description) { section("Description"); para(project.description); }
  section("Material list");
  table(["Material", "Qty", "Unit", "Notes"], materials.map((m) => [m.material, m.quantity, m.unit || "", m.notes || ""]), "No materials listed");
  section("Project parts");
  const partStatus: Record<string, string> = { todo: "To do", in_progress: "In progress", done: "Done" };
  table(["Part", "Qty", "Status"], parts.map((p) => [p.name, p.quantity, partStatus[p.status] || p.status]), "No parts listed");
  section("Hours worked");
  const total = time.reduce((s, t) => s + Number(t.hours || 0), 0);
  table(["Date", "Worked by", "Hours", "Note"], [...time.map((t) => [fmt(t.work_date), t.worker_name || "", Number(t.hours).toFixed(1), t.note || ""]), ...(time.length ? [["", "Total", total.toFixed(1), ""]] : [])], "No hours logged");
  if (project.notes) { section("Notes"); para(project.notes); }

  const photos = files.filter((f) => f.mime_type?.startsWith("image/") && f.url);
  const docs = files.filter((f) => !f.mime_type?.startsWith("image/"));
  if (photos.length) {
    section("Photos");
    const cols = 3, gap = 4, cw = (W - M * 2 - gap * (cols - 1)) / cols, ch = cw * 0.72;
    for (let i = 0; i < photos.length; i++) {
      if (i % cols === 0 && i > 0) y += ch + gap + 4;
      if (y + ch > 285) { doc.addPage(); y = 18; }
      const img = await toDataUrl(photos[i].url!);
      const x = M + (i % cols) * (cw + gap);
      doc.setFillColor(240, 241, 244); doc.roundedRect(x, y, cw, ch, 1.5, 1.5, "F");
      if (img) {
        const r = Math.min(cw / img.w, ch / img.h), w = img.w * r, h = img.h * r;
        const fmtType = img.data.startsWith("data:image/png") ? "PNG" : "JPEG";
        try { doc.addImage(img.data, fmtType, x + (cw - w) / 2, y + (ch - h) / 2, w, h); } catch { /* unsupported image */ }
      }
    }
    y += ch + 10;
  }
  if (docs.length) {
    section("Attached documents");
    table(["File", "Uploaded"], docs.map((f) => [f.file_name, fmt(f.created_at)]), "");
  }

  // Sign-off
  if (y > 255) { doc.addPage(); y = 18; }
  y += 6; doc.setDrawColor(...MUTED); doc.setLineWidth(0.3);
  doc.line(M, y + 12, M + 75, y + 12); doc.line(W - M - 75, y + 12, W - M, y + 12);
  doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text("Signed off by", M, y + 17); doc.text("Date", W - M - 75, y + 17);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(`${project.name} · ${project.project_number || ""}`, M, 292);
    doc.text(`Page ${p} of ${pages}`, W - M, 292, { align: "right" });
  }
  doc.save(`${(project.project_number || project.name).replace(/[^\w-]+/g, "_")}.pdf`);
}
