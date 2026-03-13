/**
 * Export call transcript as CSV or PDF — Deepak Fertilisers.
 */

import type { TranscriptItem } from '../types';

function downloadBlob(blob: Blob, filename: string, mimeType: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportTranscriptCSV(transcripts: TranscriptItem[]): void {
  const header = 'speaker,text,time';
  const rows = transcripts.map((t) => {
    const speaker = t.source === 'user' ? 'Farmer' : 'Agent (Deepak)';
    const text = (t.text ?? '').replace(/"/g, '""');
    const time = t.timestamp instanceof Date ? t.timestamp.toISOString() : String(t.timestamp);
    return `"${speaker}","${text}","${time}"`;
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, 'Deepak-Fertilisers-Transcript.csv', 'text/csv');
}

export async function exportTranscriptPDF(transcripts: TranscriptItem[]): Promise<void> {
  try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 15;
    const lineHeight = 7;
    let y = margin;
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;

    doc.setFontSize(14);
    doc.text('Deepak Fertilisers — Call Transcript', margin, y);
    y += lineHeight * 1.5;
    doc.setFontSize(10);

    for (const t of transcripts) {
      const speaker = t.source === 'user' ? 'Farmer' : 'Agent (Deepak)';
      const text = (t.text ?? '').trim();
      const time = t.timestamp instanceof Date ? t.timestamp.toLocaleString() : String(t.timestamp);
      const line = `${speaker}: ${text}`;
      const lines = doc.splitTextToSize(line, maxWidth);
      if (y + lines.length * lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.setFont('helvetica', 'bold');
      doc.text(speaker, margin, y);
      y += lineHeight;
      doc.setFont('helvetica', 'normal');
      for (const ln of lines) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(ln, margin, y);
        y += lineHeight;
      }
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(time, margin, y);
      y += lineHeight * 0.8;
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      y += lineHeight * 0.5;
    }

    doc.save('Deepak-Fertilisers-Transcript.pdf');
  } catch (e) {
    console.error('PDF export failed:', e);
    window.alert('PDF export failed. Install jspdf: npm install jspdf');
  }
}
