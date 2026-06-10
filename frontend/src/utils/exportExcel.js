import * as XLSX from 'xlsx';

export function downloadExcel(rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Auto-fit column widths based on content
  const colWidths = rows[0].map((_, ci) =>
    Math.min(
      60,
      Math.max(10, ...rows.map(r => String(r[ci] ?? '').length))
    )
  );
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pincodes');
  XLSX.writeFile(wb, filename);
}
