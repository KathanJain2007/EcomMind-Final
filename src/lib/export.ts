import * as XLSX from 'xlsx'
import { downloadCSV } from './format'

export { downloadCSV }

/**
 * Downloads tabular data as an Excel (.xlsx) spreadsheet
 */
export function downloadXLSX(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: Array<Array<string | number>>
) {
  const wsData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Auto-fit column widths
  const colWidths = headers.map((h, i) => {
    let maxLen = h.length
    for (let r = 0; r < Math.min(rows.length, 100); r++) {
      const val = rows[r]?.[i]
      if (val !== undefined && val !== null) {
        maxLen = Math.max(maxLen, String(val).length)
      }
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 45) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/[:\\/?*[\]]/g, '').slice(0, 31))

  const cleanName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  XLSX.writeFile(wb, cleanName)
}

export interface PDFSummaryCard {
  label: string
  value: string | number
}

/**
 * Generates an executive, print-ready PDF view using dynamic document window
 */
export function exportToPDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  summaryCards?: PDFSummaryCard[],
  businessDetails?: { storeName?: string; gstin?: string; sellerName?: string }
) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow popups to generate and download PDF reports.')
    return
  }

  const generatedDate = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <title>${title} — EcomMind Business Report</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 1.5cm;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #1e293b;
          margin: 0;
          padding: 24px;
          line-height: 1.4;
          font-size: 11px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #7965f2;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .brand-logo {
          width: 32px;
          height: 32px;
          background: #7965f2;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 16px;
        }
        .brand-title {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }
        .brand-subtitle {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0;
        }
        .meta-info {
          text-align: right;
          font-size: 10px;
          color: #64748b;
        }
        .report-title-section {
          margin-bottom: 18px;
        }
        .report-title {
          font-size: 16px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 4px 0;
        }
        .report-subtitle {
          font-size: 11px;
          color: #64748b;
          margin: 0;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .summary-card {
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 8px;
          padding: 10px 14px;
        }
        .summary-label {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #64748b;
          font-weight: 600;
        }
        .summary-value {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          margin-top: 3px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }
        th {
          background: #f1f5f9;
          color: #475569;
          text-align: left;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 8px 10px;
          border-bottom: 1px solid #cbd5e1;
        }
        td {
          padding: 7px 10px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 10.5px;
        }
        tr:nth-child(even) td {
          background: #f8fafc;
        }
        .footer {
          margin-top: 30px;
          padding-top: 12px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          color: #94a3b8;
        }
        @media print {
          body {
            padding: 0;
          }
          .no-print {
            display: none;
          }
        }
        .print-btn {
          background: #7965f2;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 16px;
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 16px; display: flex; justify-content: flex-end; gap: 8px;">
        <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
      </div>

      <div class="header">
        <div class="brand">
          <div class="brand-logo">E</div>
          <div>
            <h1 class="brand-title">EcomMind</h1>
            <p class="brand-subtitle">Autonomous Economy Platform</p>
          </div>
        </div>
        <div class="meta-info">
          <div><strong>Store:</strong> ${businessDetails?.storeName || 'UrbanNest Living'}</div>
          ${businessDetails?.gstin ? `<div><strong>GSTIN:</strong> ${businessDetails.gstin}</div>` : ''}
          <div><strong>Generated:</strong> ${generatedDate}</div>
          <div><strong>Status:</strong> Verified Records</div>
        </div>
      </div>

      <div class="report-title-section">
        <h2 class="report-title">${title}</h2>
        <p class="report-subtitle">${subtitle}</p>
      </div>

      ${
        summaryCards && summaryCards.length > 0
          ? `
        <div class="summary-grid">
          ${summaryCards
            .map(
              (c) => `
            <div class="summary-card">
              <div class="summary-label">${c.label}</div>
              <div class="summary-value">${c.value}</div>
            </div>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }

      <table>
        <thead>
          <tr>
            ${headers.map((h) => `<th>${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              ${r.map((cell) => `<td>${cell !== null && cell !== undefined ? cell : '—'}</td>`).join('')}
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>

      <div class="footer">
        <div>Generated by EcomMind Autonomous Business Intelligence Suite</div>
        <div>Page 1 of 1 · Confidential Business Record</div>
      </div>

      <script>
        // Auto prompt print after render
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 400);
        };
      </script>
    </body>
    </html>
  `

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}
