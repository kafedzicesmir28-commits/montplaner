import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import type { HeaderEmployee } from './HeaderRow';
import type { PlannerData } from './plannerTypes';
import { MONTH_KEYS } from './plannerTypes';
import { computeMonthRowTotals, computeYearTotals } from './totalsCalculator';

const MONTH_LABELS_DE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

const ROW_LABELS = [
  'geleistete Stunde',
  'Nacht/h',
  'Sonntag/h',
  'Krankheitstage',
  'bezogene Ferien',
  'Bemerkung',
] as const;

const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCFD6DE' } },
  left: { style: 'thin', color: { argb: 'FFCFD6DE' } },
  bottom: { style: 'thin', color: { argb: 'FFCFD6DE' } },
  right: { style: 'thin', color: { argb: 'FFCFD6DE' } },
};

function fillForRow(rowIdx: number): string {
  if (rowIdx === 0) return 'FFDFEEDD';
  if (rowIdx === 5) return 'FFF4D6D6';
  return 'FFE6EDF7';
}

export async function exportPlannerExcel(params: {
  year: number;
  employees: HeaderEmployee[];
  data: PlannerData;
}): Promise<void> {
  const { year, employees, data } = params;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Montatsplaner', {
    properties: { defaultRowHeight: 18 },
  });

  ws.columns = [
    { width: 10 },
    { width: 14 },
    ...employees.map(() => ({ width: 10 })),
  ];

  let r = 1;
  const headerRow = ws.getRow(r);
  headerRow.getCell(1).value = year;
  headerRow.getCell(2).value = '';
  employees.forEach((e, i) => {
    headerRow.getCell(3 + i).value = e.name;
  });
  for (let c = 1; c <= 2 + employees.length; c++) {
    const cell = headerRow.getCell(c);
    cell.font = { bold: true, size: 11, name: 'Arial' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFE6EE' } };
    cell.border = BORDER as ExcelJS.Borders;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  r += 1;

  for (let mi = 0; mi < 12; mi++) {
    const mk = MONTH_KEYS[mi];
    const monthTitle = MONTH_LABELS_DE[mi];
    const startRow = r;
    const endRow = r + 5;
    ws.mergeCells(startRow, 1, endRow, 1);
    const monthCell = ws.getCell(startRow, 1);
    monthCell.value = monthTitle;
    monthCell.alignment = { vertical: 'middle', horizontal: 'center', textRotation: 90 };
    monthCell.font = { bold: true, size: 11, name: 'Arial' };
    monthCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    monthCell.border = BORDER as ExcelJS.Borders;

    for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
      const row = ws.getRow(r + rowIdx);
      const labelCell = row.getCell(2);
      labelCell.value = ROW_LABELS[rowIdx];
      labelCell.font = { size: 11, name: 'Arial' };
      labelCell.border = BORDER as ExcelJS.Borders;
      labelCell.alignment = { vertical: 'middle', horizontal: 'left' };
      const fg = fillForRow(rowIdx);
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fg } };

      employees.forEach((emp, ci) => {
        const totals = computeMonthRowTotals(data, mk, emp.id);
        const v =
          rowIdx === 0
            ? totals.geleistete
            : rowIdx === 1
              ? totals.nacht
              : rowIdx === 2
                ? totals.sonntag
                : rowIdx === 3
                  ? totals.krank
                  : rowIdx === 4
                    ? totals.ferien
                    : totals.bemerkung;
        const cell = row.getCell(3 + ci);
        cell.value = rowIdx === 5 ? v : typeof v === 'number' ? Number(v.toFixed(1)) : v;
        cell.font = { size: 11, name: 'Arial' };
        cell.border = BORDER as ExcelJS.Borders;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fg } };
        cell.alignment =
          rowIdx === 5
            ? { vertical: 'middle', horizontal: 'left' }
            : { vertical: 'middle', horizontal: 'center' };
      });
    }
    r += 6;
  }

  const totalStart = r;
  ws.mergeCells(totalStart, 1, totalStart + 5, 1);
  const totalTitle = ws.getCell(totalStart, 1);
  totalTitle.value = 'hr Total';
  totalTitle.alignment = { vertical: 'middle', horizontal: 'center', textRotation: 90 };
  totalTitle.font = { bold: true, size: 11, name: 'Arial' };
  totalTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
  totalTitle.border = BORDER as ExcelJS.Borders;

  for (let rowIdx = 0; rowIdx < 6; rowIdx++) {
    const row = ws.getRow(r + rowIdx);
    const labelCell = row.getCell(2);
    labelCell.value = ROW_LABELS[rowIdx];
    labelCell.font = { size: 11, name: 'Arial' };
    labelCell.border = BORDER as ExcelJS.Borders;
    const fg = fillForRow(rowIdx);
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fg } };

    employees.forEach((emp, ci) => {
      const yt = computeYearTotals(data, emp.id);
      const v =
        rowIdx === 0
          ? yt.geleistete
          : rowIdx === 1
            ? yt.nacht
            : rowIdx === 2
              ? yt.sonntag
              : rowIdx === 3
                ? yt.krank
                : rowIdx === 4
                  ? yt.ferien
                  : yt.bemerkung;
      const cell = row.getCell(3 + ci);
      cell.value = rowIdx === 5 ? v : typeof v === 'number' ? Number(v.toFixed(1)) : v;
      cell.font = { size: 11, name: 'Arial' };
      cell.border = BORDER as ExcelJS.Borders;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fg } };
      cell.alignment =
        rowIdx === 5
          ? { vertical: 'middle', horizontal: 'left' }
          : { vertical: 'middle', horizontal: 'center' };
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Montatsplaner_${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportPlannerPdf(elementId: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) return;

  const offscreen = document.createElement('div');
  offscreen.id = 'export-full-table';
  offscreen.style.position = 'absolute';
  offscreen.style.left = '-9999px';
  offscreen.style.top = '0';
  offscreen.style.background = '#ffffff';
  offscreen.style.overflow = 'visible';
  offscreen.style.maxWidth = 'none';
  offscreen.style.width = `${el.scrollWidth || el.clientWidth}px`;
  offscreen.style.padding = '0';

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.overflow = 'visible';
  clone.style.maxHeight = 'none';
  clone.style.maxWidth = 'none';
  clone.style.width = 'max-content';
  clone.style.height = 'auto';

  // Ensure export clone renders full table, not viewport-scrolled shell.
  const topScroll = clone.querySelector(':scope > div:first-child') as HTMLElement | null;
  if (topScroll) topScroll.style.display = 'none';
  const bottomScroll = clone.querySelector(':scope > div:nth-child(2)') as HTMLElement | null;
  if (bottomScroll) {
    bottomScroll.style.overflow = 'visible';
    bottomScroll.style.maxHeight = 'none';
    bottomScroll.style.height = 'auto';
  }
  clone.querySelectorAll<HTMLElement>('*').forEach((node) => {
    const style = node.style;
    if (style.overflowX === 'auto' || style.overflowY === 'auto' || style.overflow === 'auto') {
      style.overflow = 'visible';
    }
    if (style.maxHeight) style.maxHeight = 'none';
  });

  offscreen.appendChild(clone);
  document.body.appendChild(offscreen);
  try {
    const canvas = await html2canvas(clone, {
      scale: 1.8,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: clone.scrollWidth,
      windowHeight: clone.scrollHeight,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = canvas.width;
    const imgH = canvas.height;
    const margin = 6;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;
    // Single-page exact overview: fit both width and height proportionally on one A4 landscape page.
    const scale = Math.min(usableW / imgW, usableH / imgH);
    const renderW = imgW * scale;
    const renderH = imgH * scale;
    const x = margin + (usableW - renderW) / 2;
    const y = margin + (usableH - renderH) / 2;
    pdf.addImage(imgData, 'PNG', x, y, renderW, renderH);

    pdf.save('Montatsplaner.pdf');
  } finally {
    document.body.removeChild(offscreen);
  }
}
