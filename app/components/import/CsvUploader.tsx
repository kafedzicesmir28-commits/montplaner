'use client';

type CsvUploaderProps = {
  selectedTypeLabel: string;
  uploading: boolean;
  importing: boolean;
  onFileChange: (file: File | null) => void;
  onUpload: () => void;
  onImport: () => void;
  onDownloadTemplate: () => void;
  importDisabled: boolean;
};

export default function CsvUploader({
  selectedTypeLabel,
  uploading,
  importing,
  onFileChange,
  onUpload,
  onImport,
  onDownloadTemplate,
  importDisabled,
}: CsvUploaderProps) {
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
      <div>
        <label htmlFor="csv-file" className="mb-1 block text-sm font-medium text-gray-700">
          CSV file ({selectedTypeLabel})
        </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={onUpload}
        disabled={uploading || importing}
        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? 'Parsing...' : 'Upload CSV'}
      </button>
      <button
        type="button"
        onClick={onImport}
        disabled={importDisabled}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
      >
        {importing ? 'Importing...' : 'Import Data'}
      </button>
      <button
        type="button"
        onClick={onDownloadTemplate}
        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        Download CSV Template
      </button>
    </div>
  );
}
