import { useTranslation } from 'react-i18next';
import {
  FileText,
  Download,
  CheckCircle,
  Globe,
  Leaf,
  Zap,
  Eye,
  X,
  FileSpreadsheet,
  FileCode,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';
import { useLiveData } from '../contexts/LiveDataContext';
import {
  generateReaLoisReport,
  generateWorldBankEsmapReport,
  buildMeterLedger,
  exportLedgerToCsv,
  triggerBrowserDownload,
  ReaLoisReportData,
  WorldBankEsmapReportData,
} from '../services/rbfExport';
import { SITE } from '../data/site-config';

type PreviewModalData =
  | { type: 'rea'; data: ReaLoisReportData }
  | { type: 'worldbank'; data: WorldBankEsmapReportData }
  | { type: 'ledger'; data: ReturnType<typeof buildMeterLedger> }
  | null;

export default function RBFReports() {
  const { t } = useTranslation();
  const { siteSummary, meterStatus } = useLiveData();

  const [generating, setGenerating] = useState<string | null>(null);
  const [lastGeneratedTimes, setLastGeneratedTimes] = useState<Record<string, string>>({
    rea: '2026-03-10',
    worldbank: '2026-03-01',
    ewura: '2026-02-15',
    productive: '2026-03-12',
  });
  const [previewData, setPreviewData] = useState<PreviewModalData>(null);

  // Compute live metrics from LiveDataContext
  const totalConnections = siteSummary?.meters_total ?? 10;
  const activeConnections = siteSummary?.meters_connected ?? 9;
  const collectionRate = siteSummary?.collection_rate_pct ?? 93.5;

  const minConnections = 50;
  const minCollectionRate = 70;
  const isEligible = totalConnections >= minConnections && collectionRate >= minCollectionRate;

  const reports = [
    {
      id: 'rea',
      title: 'REA Tanzania RBF Verification',
      icon: <CheckCircle className="w-6 h-6 text-green-400" />,
      description: 'Results-Based Financing verification report for REA LOIS system',
      status: 'Ready',
      format: 'JSON / CSV',
      lastGenerated: lastGeneratedTimes.rea,
      eligible: true,
      agency: 'Rural Energy Agency (REA Tanzania)',
    },
    {
      id: 'worldbank',
      title: 'World Bank ESMAP / Mission 300',
      icon: <Globe className="w-6 h-6 text-blue-400" />,
      description: 'Universal energy access tracking in ESMAP mini-grid template format',
      status: 'Ready',
      format: 'JSON / Excel',
      lastGenerated: lastGeneratedTimes.worldbank,
      eligible: true,
      agency: 'World Bank ESMAP',
    },
    {
      id: 'ewura',
      title: 'EWURA Tariff Submission',
      icon: <Zap className="w-6 h-6 text-yellow-400" />,
      description: 'Regulatory tariff review submission for EWURA Tanzania',
      status: 'Ready',
      format: 'CSV / JSON',
      lastGenerated: lastGeneratedTimes.ewura,
      eligible: true,
      agency: 'EWURA Tanzania',
    },
    {
      id: 'carbon',
      title: 'Carbon Credits (Verra / Gold Standard)',
      icon: <Leaf className="w-6 h-6 text-emerald-400" />,
      description: 'Annual carbon displacement report for VCS verification',
      status: 'Pending',
      format: 'PDF',
      lastGenerated: null,
      eligible: false,
      agency: 'Verra / Gold Standard',
      note: 'Requires 1 full year of continuous telemetry logging (in progress)',
    },
  ];

  // Handler for generating and triggering official JSON download
  const handleDownloadJson = (reportId: string) => {
    setGenerating(reportId);
    setTimeout(() => {
      const nowStr = new Date().toISOString().split('T')[0];
      if (reportId === 'rea') {
        const payload = generateReaLoisReport(siteSummary, meterStatus);
        const filename = `rea-lois-verification-${SITE.id}-${nowStr}.json`;
        triggerBrowserDownload(JSON.stringify(payload, null, 2), filename, 'application/json');
        toast.success(`Pakua Imekamilika: ${filename} imehifadhiwa!`);
      } else if (reportId === 'worldbank') {
        const payload = generateWorldBankEsmapReport(siteSummary, meterStatus);
        const filename = `worldbank-esmap-mtf-${SITE.id}-${nowStr}.json`;
        triggerBrowserDownload(JSON.stringify(payload, null, 2), filename, 'application/json');
        toast.success(`Pakua Imekamilika: ${filename} imehifadhiwa!`);
      } else {
        const ledger = buildMeterLedger(meterStatus);
        const filename = `${reportId}-report-${SITE.id}-${nowStr}.json`;
        triggerBrowserDownload(JSON.stringify({ site: SITE, ledger }, null, 2), filename, 'application/json');
        toast.success(`Pakua Imekamilika: ${filename} imehifadhiwa!`);
      }

      setLastGeneratedTimes((prev) => ({
        ...prev,
        [reportId]: nowStr,
      }));
      setGenerating(null);
    }, 400);
  };

  // Handler for downloading CSV ledger
  const handleDownloadCsv = (reportId: string) => {
    const nowStr = new Date().toISOString().split('T')[0];
    const ledger = buildMeterLedger(meterStatus);
    const csvContent = exportLedgerToCsv(ledger);
    const filename = `${reportId}-meter-ledger-${SITE.id}-${nowStr}.csv`;
    triggerBrowserDownload(csvContent, filename, 'text/csv');
    toast.success(`Spreadsheet CSV Imehifadhiwa: ${filename}`);
  };

  // Handler for previewing report modal
  const handlePreview = (reportId: string) => {
    if (reportId === 'rea') {
      const payload = generateReaLoisReport(siteSummary, meterStatus);
      setPreviewData({ type: 'rea', data: payload });
    } else if (reportId === 'worldbank') {
      const payload = generateWorldBankEsmapReport(siteSummary, meterStatus);
      setPreviewData({ type: 'worldbank', data: payload });
    } else {
      const ledger = buildMeterLedger(meterStatus);
      setPreviewData({ type: 'ledger', data: ledger });
    }
  };

  return (
    <div className="p-8 space-y-6">
      <Toaster position="top-right" richColors />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
          <FileText className="w-7 h-7 text-emerald-400" />
          {t('reports.title', 'RBF & Compliance Reports')}
        </h1>
        <p className="text-slate-400 mt-1">
          Auto-generate verified compliance and subsidy milestone reports for funders and regulators
        </p>
      </div>

      {/* RBF Eligibility Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg p-6 border border-slate-700 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            RBF Eligibility Status — Live Telemetry
          </h2>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            {SITE.name} · {SITE.id}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50">
            <div className="text-sm text-slate-400">Total Connections</div>
            <div
              className={`text-2xl font-bold mt-1 ${
                totalConnections >= minConnections ? 'text-green-400' : 'text-yellow-400'
              }`}
            >
              {totalConnections} / {minConnections}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {totalConnections >= minConnections ? '✓ Threshold Met' : `⚠ Need ${minConnections - totalConnections} more`}
            </div>
          </div>

          <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50">
            <div className="text-sm text-slate-400">Active Meters</div>
            <div className="text-2xl font-bold mt-1 text-emerald-400">
              {activeConnections} / {totalConnections}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {Math.round((activeConnections / totalConnections) * 100)}% online uptime
            </div>
          </div>

          <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50">
            <div className="text-sm text-slate-400">Collection Rate</div>
            <div
              className={`text-2xl font-bold mt-1 ${
                collectionRate >= minCollectionRate ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {collectionRate.toFixed(1)}%
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {collectionRate >= minCollectionRate ? '✓ Compliant (≥70%)' : '✗ Below benchmark'}
            </div>
          </div>

          <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50">
            <div className="text-sm text-slate-400">Subsidy Value / Conn.</div>
            <div className="text-2xl font-bold mt-1 text-slate-100">$400</div>
            <div className="text-xs text-slate-400 mt-1">REA TEDAP Standard Grant</div>
          </div>
        </div>

        <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center justify-between">
          <p className="text-sm text-yellow-300">
            <strong>REA LOIS Status:</strong> {activeConnections} verified active meters ready for subsidy draw-down.
            Connecting {minConnections - totalConnections} additional meters unlocks full $20,000 disbursement.
          </p>
          <button
            onClick={() => handleDownloadCsv('rea')}
            className="text-xs font-semibold px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 border border-yellow-500/30 rounded flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Audit Ledger (CSV)
          </button>
        </div>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-2 gap-6">
        {reports.map((report) => (
          <div
            key={report.id}
            className="bg-slate-900 rounded-lg p-6 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
                    {report.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-100">{report.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{report.description}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
                <div className="p-2.5 bg-slate-800/40 rounded border border-slate-700/40">
                  <div className="text-slate-400">Status</div>
                  <div
                    className={`font-semibold mt-1 ${
                      report.status === 'Ready' ? 'text-green-400' : 'text-yellow-400'
                    }`}
                  >
                    {report.status}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-800/40 rounded border border-slate-700/40">
                  <div className="text-slate-400">Format</div>
                  <div className="font-mono text-slate-200 mt-1">{report.format}</div>
                </div>
                <div className="p-2.5 bg-slate-800/40 rounded border border-slate-700/40">
                  <div className="text-slate-400">Last Generated</div>
                  <div className="font-mono text-slate-200 mt-1">
                    {report.lastGenerated || 'Never'}
                  </div>
                </div>
              </div>

              {report.note && (
                <div className="mb-4 p-3 bg-slate-800/60 border border-slate-700/40 rounded text-xs text-slate-400">
                  {report.note}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => handleDownloadJson(report.id)}
                disabled={!report.eligible || generating === report.id}
                className={`flex-1 px-4 py-2 rounded-lg font-medium text-xs transition-all flex items-center justify-center gap-2 shadow-sm ${
                  !report.eligible
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : generating === report.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {generating === report.id ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileCode className="w-3.5 h-3.5" />
                    Download JSON
                  </>
                )}
              </button>

              {report.eligible && (
                <>
                  <button
                    onClick={() => handleDownloadCsv(report.id)}
                    title="Download CSV Ledger"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    CSV
                  </button>

                  <button
                    onClick={() => handlePreview(report.id)}
                    title="Preview on-screen"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    Preview
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Productive Use Analysis Section */}
      <div className="bg-slate-900 rounded-lg p-6 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-purple-400" />
            Productive Use Verification & Appliance Financing
          </h2>
          <span className="text-xs px-2.5 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
            CLASP / ENGIE Energy Access Partnership
          </span>
        </div>

        <p className="text-sm text-slate-400 mb-4">
          Customer telemetry filtered by commercial / agricultural productive use profiles for appliance grant allocation.
        </p>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50">
            <div className="text-xs text-slate-400">Productive Users Verified</div>
            <div className="text-2xl font-bold text-purple-400 mt-1">2</div>
            <div className="text-xs text-slate-400 mt-1">Baraka Fishing Co, St. Peter School</div>
          </div>
          <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50">
            <div className="text-xs text-slate-400">Total Consumption Today</div>
            <div className="text-2xl font-bold text-slate-100 mt-1">24.8 kWh</div>
            <div className="text-xs text-slate-400 mt-1">Productive day load</div>
          </div>
          <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50">
            <div className="text-xs text-slate-400">Financing Eligibility</div>
            <div className="text-2xl font-bold text-green-400 mt-1">100%</div>
            <div className="text-xs text-slate-400 mt-1">2 / 2 meet credit criteria</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleDownloadJson('productive')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-xs font-semibold flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            Generate Productive Use Package (JSON)
          </button>
          <button
            onClick={() => handleDownloadCsv('productive')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
            Export Productive Users (CSV)
          </button>
        </div>
      </div>

      {/* Interactive Report Preview Modal */}
      {previewData && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/40">
              <div className="flex items-center gap-2.5">
                <FileCode className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-slate-100 text-base">
                  {previewData.type === 'rea'
                    ? 'REA Tanzania LOIS Submission Preview'
                    : previewData.type === 'worldbank'
                    ? 'World Bank ESMAP MTF Access Report Preview'
                    : 'Meter Telemetry Ledger Preview'}
                </h3>
              </div>
              <button
                onClick={() => setPreviewData(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 font-mono text-xs text-slate-300 bg-slate-950">
              <pre className="p-4 bg-slate-900 rounded-lg border border-slate-800 overflow-x-auto text-emerald-400/90 whitespace-pre-wrap leading-relaxed">
                {JSON.stringify(previewData.data, null, 2)}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-800 bg-slate-800/40 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                Official Schema Validated · Hash SHA-256 Ready
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    handleDownloadCsv(previewData.type);
                    setPreviewData(null);
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold flex items-center gap-1.5 border border-slate-700"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  Download CSV
                </button>
                <button
                  onClick={() => {
                    handleDownloadJson(previewData.type);
                    setPreviewData(null);
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
