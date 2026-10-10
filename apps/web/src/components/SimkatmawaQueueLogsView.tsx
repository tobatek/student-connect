import React, { useState } from 'react';
import { SimkatmawaSubmissionLog, TenantConfig, UserRole } from '../types';
import {
  FileText,
  Search,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Code2,
  Copy,
  Check,
} from 'lucide-react';

interface SimkatmawaQueueLogsViewProps {
  tenant: TenantConfig;
  activeRole: UserRole;
  logs: SimkatmawaSubmissionLog[];
  onRefreshLogs: () => void;
}

export const SimkatmawaQueueLogsView: React.FC<SimkatmawaQueueLogsViewProps> = ({
  tenant,
  activeRole,
  logs,
  onRefreshLogs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLog, setSelectedLog] = useState<SimkatmawaSubmissionLog | null>(null);
  const [copied, setCopied] = useState(false);

  const filteredLogs = logs.filter(
    (l) =>
      l.record_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.endpoint.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.idempotency_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.simkatmawa_id && l.simkatmawa_id.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleCopyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Riwayat Transaksi & Pelaporan</span>
            <span>·</span>
            <span className="font-semibold text-teal-800">Sinkronisasi Nasional</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-800" />
            Riwayat Transaksi & Pelaporan ke Layanan Nasional
          </h1>
          <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
            Merekam seluruh riwayat pengiriman data capaian mahasiswa ke pangkalan data nasional, termasuk status keberhasilan, waktu pengiriman, dan nomor tanda terima resmi.
          </p>
        </div>

        <button
          onClick={onRefreshLogs}
          className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Segarkan Log</span>
        </button>
      </div>

      {/* Search & Stats */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500">
          Total Tercatat: <strong className="text-slate-900 font-mono">{logs.length}</strong> transaksi API
        </div>

        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Cari judul, endpoint, ID Nasional..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-teal-600"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Waktu & Jenis</th>
                <th className="py-3 px-4">Record & Judul</th>
                <th className="py-3 px-4">Endpoint & HTTP Status</th>
                <th className="py-3 px-4">Durasi & Percobaan</th>
                <th className="py-3 px-4">Hasil / ID Nasional</th>
                <th className="py-3 px-4 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-xs font-sans">
                    Belum ada catatan log pengiriman API.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-slate-900 font-semibold text-[11px]">
                        {new Date(log.started_at).toLocaleTimeString('id-ID')}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(log.started_at).toLocaleDateString('id-ID')}
                      </div>
                      <span className="text-[10px] text-teal-800 uppercase block mt-0.5">
                        {log.record_type}
                      </span>
                    </td>

                    <td className="py-3 px-4 max-w-xs font-sans">
                      <div className="font-semibold text-slate-900 truncate" title={log.record_title}>
                        {log.record_title}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                        Key: {log.idempotency_key}
                      </div>
                    </td>

                    <td className="py-3 px-4 max-w-xs font-mono text-[11px]">
                      <div className="truncate text-slate-600" title={log.endpoint}>
                        {log.endpoint.replace('https://layanan-kemahasiswaan.kemdiktisaintek.go.id', '')}
                      </div>
                      <div className="mt-0.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.http_status >= 200 && log.http_status < 300
                              ? 'bg-emerald-100 text-emerald-800'
                              : log.http_status === 409
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          HTTP {log.http_status}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-[11px] text-slate-600">
                      <div>{log.duration_ms} ms</div>
                      <div className="text-[10px] text-slate-400">Percobaan #{log.attempt}</div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap font-sans">
                      {log.status === 'SUCCESS' ? (
                        <div>
                          <span className="text-emerald-700 font-semibold text-xs flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Sukses
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 block">
                            {log.simkatmawa_id}
                          </span>
                        </div>
                      ) : log.status === 'SKIPPED' ? (
                        <div>
                          <span className="text-amber-700 font-semibold text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Dilewati (Sudah Terdaftar)
                          </span>
                          <span className="text-[10px] text-slate-400 block">Cegah pelaporan ganda</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-red-700 font-semibold text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> Gagal
                          </span>
                          <span className="text-[10px] text-red-600 truncate max-w-[140px] block" title={log.error_message}>
                            {log.error_message}
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap font-sans">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors cursor-pointer"
                      >
                        Inspeksi Payload
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON Payload Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-teal-800" />
                  Inspeksi Payload Request & Response API
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Log ID: {selectedLog.id} · HTTP {selectedLog.http_status}
                </p>
              </div>
              <button onClick={() => setSelectedLog(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Tipe Record</span>
                  <span className="font-bold text-slate-900 block mt-0.5 font-mono">{selectedLog.record_type}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Status HTTP</span>
                  <span className="font-bold text-emerald-700 block mt-0.5 font-mono">{selectedLog.http_status}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Waktu Proses</span>
                  <span className="font-bold text-slate-900 block mt-0.5 font-mono">{selectedLog.duration_ms} ms</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200">
                  <span className="text-slate-400 text-[10px] uppercase font-semibold">Pemicu</span>
                  <span className="font-bold text-slate-900 block mt-0.5 truncate">{selectedLog.triggered_by}</span>
                </div>
              </div>

              {/* Endpoint */}
              <div>
                <span className="font-semibold text-slate-700 block mb-1">Target Endpoint:</span>
                <div className="p-2.5 bg-slate-900 text-teal-400 font-mono rounded text-xs">
                  {selectedLog.endpoint}
                </div>
              </div>

              {/* Request Payload JSON */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">
                    Request Payload (Dikirim ke Portal Pusat):
                  </span>
                  <button
                    onClick={() => handleCopyJson(selectedLog.request_payload)}
                    className="text-[11px] text-teal-800 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>Salin JSON</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 text-slate-200 rounded font-mono text-[11px] overflow-x-auto max-h-52">
                  {JSON.stringify(selectedLog.request_payload, null, 2)}
                </pre>
              </div>

              {/* Response Body JSON */}
              <div>
                <span className="font-semibold text-slate-800 block mb-1">
                  Response Body (Respons Server Nasional):
                </span>
                <pre className="p-3 bg-slate-900 text-emerald-300 rounded font-mono text-[11px] overflow-x-auto max-h-40">
                  {JSON.stringify(selectedLog.response_body || { error: selectedLog.error_message }, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
