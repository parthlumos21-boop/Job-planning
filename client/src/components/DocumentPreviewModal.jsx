import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  Download,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function DocumentPreviewModal({ file, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Excel state
  const [workbook, setWorkbook] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [sheetData, setSheetData] = useState([]);
  const [filterTerm, setFilterTerm] = useState('');

  const fileName = file?.originalName || file?.storedName || file?.name || 'Document';
  const fileUrl = file?.url || '';
  const fileSizeKb = file?.size ? Math.round(file.size / 1024) : null;

  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const isPdf = ext === 'pdf';
  const isExcel = ['xlsx', 'xls', 'csv'].includes(ext);
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext);

  useEffect(() => {
    if (!fileUrl) {
      setError('File URL is not available.');
      setLoading(false);
      return;
    }

    if (isExcel) {
      loadExcelDocument();
    } else {
      setLoading(false);
    }
  }, [fileUrl, isExcel]);

  const loadExcelDocument = async () => {
    try {
      setLoading(true);
      setError(null);

      // Attempt to fetch file, with fallback to backend directly if Vite served HTML
      let targetUrl = fileUrl;
      let res = await fetch(targetUrl);
      let contentType = (res.headers.get('content-type') || '').toLowerCase();

      if (contentType.includes('text/html') && targetUrl.startsWith('/')) {
        // Fallback directly to backend port 8000 if proxy served index.html
        try {
          const directBackendUrl = `http://127.0.0.1:8000${targetUrl}`;
          const retryRes = await fetch(directBackendUrl);
          if (retryRes.ok) {
            res = retryRes;
            contentType = (res.headers.get('content-type') || '').toLowerCase();
          }
        } catch (e) {
          console.warn('Direct backend fetch attempt failed:', e);
        }
      }

      if (!res.ok) {
        throw new Error(`Failed to fetch spreadsheet (${res.status} ${res.statusText})`);
      }

      if (contentType.includes('text/html')) {
        throw new Error('File not found or served as HTML page. Please verify file exists on server.');
      }

      const buffer = await res.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      setWorkbook(wb);
      const sheetNames = wb.SheetNames || [];
      setSheets(sheetNames);
      if (sheetNames.length > 0) {
        selectSheet(wb, sheetNames[0]);
      } else {
        setSheetData([]);
      }
    } catch (err) {
      console.error('Error loading excel spreadsheet:', err);
      const msg = err.message || '';
      if (msg.includes('could not find <table>') || msg.includes('Invalid HTML')) {
        setError('This spreadsheet file appears to be corrupted or an HTML document.');
      } else {
        setError(msg || 'Unable to parse spreadsheet.');
      }
    } finally {
      setLoading(false);
    }
  };

  const selectSheet = (wb, name) => {
    setActiveSheet(name);
    try {
      const ws = wb.Sheets[name];
      if (!ws) {
        setSheetData([]);
        return;
      }
      // header: 1 converts sheet to 2D array of rows
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      // Remove trailing completely empty rows
      const trimmedRows = rawRows.filter(row => Array.isArray(row) && row.some(cell => String(cell || '').trim() !== ''));
      setSheetData(trimmedRows);
    } catch (err) {
      console.error('Failed to parse sheet:', err);
      setSheetData([]);
    }
  };

  const handleSheetChange = (sheetName) => {
    if (workbook) {
      selectSheet(workbook, sheetName);
    }
  };

  // Filter rows if user types in search box
  const filteredRows = React.useMemo(() => {
    if (!filterTerm.trim()) return sheetData;
    const term = filterTerm.toLowerCase();
    return sheetData.filter((row, idx) => {
      if (idx === 0) return true; // keep header row
      return row.some(cell => String(cell || '').toLowerCase().includes(term));
    });
  }, [sheetData, filterTerm]);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 truncate pr-4">
            <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30 shrink-0">
              {isExcel ? <FileSpreadsheet size={18} /> : isPdf ? <FileText size={18} /> : isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white truncate max-w-md">
                  {fileName}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50 uppercase">
                  {isExcel ? 'Excel' : isPdf ? 'PDF' : isImage ? 'Image' : ext.toUpperCase() || 'File'}
                </span>
                {fileSizeKb && (
                  <span className="text-[11px] text-slate-400 font-medium">
                    ({fileSizeKb} KB)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                In-modal document preview
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {fileUrl && (
              <a
                href={fileUrl}
                download={fileName}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
                title="Download original file"
              >
                <Download size={14} />
                <span className="hidden sm:inline">Download</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <X size={15} />
              <span>Close Preview</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 bg-slate-50 overflow-hidden flex flex-col relative">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 size={32} className="animate-spin text-blue-600" />
              <p className="text-xs font-semibold">Loading document preview...</p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl">
                <AlertCircle size={32} />
              </div>
              <p className="text-xs font-bold text-rose-700">{error}</p>
              <p className="text-xs text-slate-500 max-w-sm">
                You can still download the document directly to view it on your machine.
              </p>
              {fileUrl && (
                <a
                  href={fileUrl}
                  download={fileName}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Download size={14} />
                  Download File
                </a>
              )}
            </div>
          ) : isPdf ? (
            /* PDF In-Modal Viewer */
            <div className="w-full h-full p-2 bg-slate-200">
              <iframe
                src={`${fileUrl}#toolbar=1`}
                title={fileName}
                className="w-full h-full bg-white rounded-xl border border-slate-300 shadow-inner"
              />
            </div>
          ) : isExcel ? (
            /* Excel Spreadsheet Viewer */
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Sheet Controls Bar */}
              <div className="px-4 py-2 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                {/* Sheet Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto max-w-full pb-1 sm:pb-0">
                  <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Sheets:</span>
                  {sheets.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => handleSheetChange(name)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all shrink-0 ${
                        activeSheet === name
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>

                {/* Filter / Search within Sheet */}
                <div className="relative w-48 sm:w-64">
                  <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={filterTerm}
                    onChange={e => setFilterTerm(e.target.value)}
                    placeholder="Search in sheet..."
                    className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Excel Table Grid */}
              <div className="flex-1 overflow-auto bg-white p-3">
                {filteredRows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No data found in this sheet.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs inline-block min-w-full align-middle">
                    <table className="min-w-full border-collapse text-xs">
                      <tbody>
                        {filteredRows.map((row, rowIdx) => {
                          const isHeader = rowIdx === 0;
                          return (
                            <tr
                              key={rowIdx}
                              className={isHeader ? 'bg-slate-100/90 font-bold text-slate-900 border-b border-slate-300' : 'hover:bg-blue-50/40 border-b border-slate-100'}
                            >
                              {/* Row Index Number */}
                              <td className="px-2.5 py-1.5 text-[10px] font-mono text-slate-400 bg-slate-50 border-r border-slate-200 select-none text-right w-10">
                                {isHeader ? '#' : rowIdx}
                              </td>

                              {/* Cells */}
                              {row.map((cell, cellIdx) => (
                                <td
                                  key={cellIdx}
                                  className={`px-3 py-1.5 border-r border-slate-100 whitespace-nowrap text-slate-800 ${
                                    isHeader ? 'font-bold bg-slate-100/80 text-slate-800' : 'font-normal'
                                  }`}
                                >
                                  {cell !== null && cell !== undefined ? String(cell) : ''}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Sheet Stats Footer */}
              <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
                <span>
                  Showing <strong>{filteredRows.length}</strong> row{filteredRows.length === 1 ? '' : 's'} on sheet: <strong className="text-slate-800">{activeSheet}</strong>
                </span>
                <span className="text-slate-400">
                  Tip: Use the search box above to quickly find entries
                </span>
              </div>
            </div>
          ) : isImage ? (
            /* Image Viewer */
            <div className="flex-1 flex items-center justify-center p-4 bg-slate-900/90 overflow-auto">
              <img
                src={fileUrl}
                alt={fileName}
                className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl border border-slate-700"
              />
            </div>
          ) : (
            /* Fallback generic document */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <FileText size={48} className="text-slate-400" />
              <p className="text-xs font-bold text-slate-700">Preview not supported for .{ext} files</p>
              <p className="text-xs text-slate-500 max-w-sm">
                This file format cannot be rendered directly in the browser. You can download it to view on your device.
              </p>
              {fileUrl && (
                <a
                  href={fileUrl}
                  download={fileName}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Download size={14} />
                  Download {fileName}
                </a>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
