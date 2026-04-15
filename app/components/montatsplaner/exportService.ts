import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import montatsplanerStyles from './montatsplaner.module.css';
import type { HeaderEmployee } from './HeaderRow';
import type { PlannerData } from './plannerTypes';
import { MONTH_KEYS } from './plannerTypes';
import { computeMonthRowTotals } from './totalsCalculator';

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
const NUMERIC_ROW_INDEXES = [0, 1, 2, 3, 4] as const;

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
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet('Montatsplaner', {
    properties: { defaultRowHeight: 18 },
  });
  const monthMetricRowsByIndex = new Map<number, number[]>();

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
      if (rowIdx < ROW_LABELS.length) {
        const existing = monthMetricRowsByIndex.get(rowIdx) ?? [];
        existing.push(r + rowIdx);
        monthMetricRowsByIndex.set(rowIdx, existing);
      }
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

    employees.forEach((_, ci) => {
      const cell = row.getCell(3 + ci);
      const col = cell.address.replace(/\d+/g, '');
      const monthRowsForMetric = monthMetricRowsByIndex.get(rowIdx) ?? [];
      if (NUMERIC_ROW_INDEXES.includes(rowIdx as (typeof NUMERIC_ROW_INDEXES)[number])) {
        const refs = monthRowsForMetric.map((rowNo) => `${col}${rowNo}`);
        cell.value =
          refs.length > 0
            ? { formula: `SUM(${refs.join(',')})` }
            : 0;
      } else {
        const refs = monthRowsForMetric.map((rowNo) => `${col}${rowNo}`);
        cell.value =
          refs.length > 0
            ? { formula: `TEXTJOIN(" | ",TRUE,${refs.join(',')})` }
            : '';
      }
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

export async function exportPlannerPdf(elementId: string, companyName?: string): Promise<void> {
  const el = document.getElementById(elementId) as HTMLElement | null;
  if (!el) return;

  const children = Array.from(el.children) as HTMLElement[];
  const topScroll = children[0] ?? null;
  const bottomScroll = children[1] ?? null;

  const snap = {
    el: {
      overflow: el.style.overflow,
      maxHeight: el.style.maxHeight,
      height: el.style.height,
    },
    top: topScroll
      ? {
          display: topScroll.style.display,
        }
      : null,
    bottom: bottomScroll
      ? {
          overflow: bottomScroll.style.overflow,
          overflowX: bottomScroll.style.overflowX,
          overflowY: bottomScroll.style.overflowY,
          maxHeight: bottomScroll.style.maxHeight,
          height: bottomScroll.style.height,
          scrollLeft: bottomScroll.scrollLeft,
          scrollTop: bottomScroll.scrollTop,
        }
      : null,
  };

  try {
    // Capture the live DOM. Clones parked at left:-9999px often produce a blank canvas with html2canvas.
    el.style.overflow = 'visible';
    el.style.maxHeight = 'none';
    el.style.height = 'auto';

    if (topScroll) topScroll.style.display = 'none';
    if (bottomScroll) {
      bottomScroll.style.overflow = 'visible';
      bottomScroll.style.maxHeight = 'none';
      bottomScroll.style.height = 'auto';
      bottomScroll.scrollLeft = 0;
      bottomScroll.scrollTop = 0;
    }

    el.classList.add(montatsplanerStyles.pdfExportCapture);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    await new Promise((r) => setTimeout(r, 50));

    const w = Math.max(el.scrollWidth, el.offsetWidth, 1);
    const h = Math.max(el.scrollHeight, el.offsetHeight, 1);

    // Let html2canvas derive crop from the cloned element; explicit width/height can mismatch bounds and yield a blank image.
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: w,
      windowHeight: h,
      scrollX: 0,
      scrollY: -window.scrollY,
    });

    if (canvas.width < 2 || canvas.height < 2) {
      throw new Error('PDF export: capture produced an empty canvas. Try again or resize the planner.');
    }

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = canvas.width;
    const imgH = canvas.height;
    const margin = 6;
    const headerMm = companyName?.trim() ? 8 : 0;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2 - headerMm;

    // Fit full table **width** to the page; stack extra height pages. Avoids squashing columns like single-page fit.
    const mmPerPx = usableW / imgW;
    let srcY = 0;
    let pageIdx = 0;

    while (srcY < imgH - 0.01) {
      if (pageIdx > 0) {
        pdf.addPage('a4', 'landscape');
      }
      if (companyName?.trim()) {
        pdf.setFontSize(11);
        pdf.setTextColor(70, 70, 70);
        pdf.text(`Firma: ${companyName}`, pageW / 2, margin + 4, { align: 'center' });
      }
      const remainingPx = imgH - srcY;
      const sliceHmm = Math.min(usableH, remainingPx * mmPerPx);
      const slicePx = Math.min(sliceHmm / mmPerPx, remainingPx);

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = imgW;
      sliceCanvas.height = Math.max(1, Math.ceil(slicePx));
      const ctx = sliceCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('PDF export: could not create canvas context.');
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, srcY, imgW, slicePx, 0, 0, imgW, slicePx);

      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
      const drawHmm = slicePx * mmPerPx;
      pdf.addImage(imgData, 'JPEG', margin, margin + headerMm, usableW, drawHmm);

      srcY += slicePx;
      pageIdx++;
    }

    pdf.save('Montatsplaner.pdf');
  } finally {
    el.classList.remove(montatsplanerStyles.pdfExportCapture);
    el.style.overflow = snap.el.overflow;
    el.style.maxHeight = snap.el.maxHeight;
    el.style.height = snap.el.height;
    if (topScroll && snap.top) {
      topScroll.style.display = snap.top.display;
    }
    if (bottomScroll && snap.bottom) {
      bottomScroll.style.overflow = snap.bottom.overflow;
      bottomScroll.style.overflowX = snap.bottom.overflowX;
      bottomScroll.style.overflowY = snap.bottom.overflowY;
      bottomScroll.style.maxHeight = snap.bottom.maxHeight;
      bottomScroll.style.height = snap.bottom.height;
      bottomScroll.scrollLeft = snap.bottom.scrollLeft;
      bottomScroll.scrollTop = snap.bottom.scrollTop;
    }
  }
}
