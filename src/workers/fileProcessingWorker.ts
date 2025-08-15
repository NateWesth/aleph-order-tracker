import * as XLSX from "xlsx";

interface ParsedItem {
  name: string;
  quantity: number;
  unit?: string;
  notes?: string;
}

interface WorkerMessage {
  type: 'PARSE_FILE';
  file: File;
  fileType: 'excel' | 'csv';
}

interface WorkerResponse {
  type: 'PARSE_SUCCESS' | 'PARSE_ERROR' | 'PARSE_PROGRESS';
  data?: ParsedItem[];
  error?: string;
  progress?: number;
}

const parseExcelFile = async (file: File): Promise<ParsedItem[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        const items: ParsedItem[] = [];
        const totalRows = jsonData.length - 1; // Exclude header
        
        // Process rows in chunks to avoid blocking
        const processChunk = (startIndex: number) => {
          const chunkSize = 50;
          const endIndex = Math.min(startIndex + chunkSize, jsonData.length);
          
          for (let i = startIndex; i < endIndex; i++) {
            const row = jsonData[i];
            if (i > 0 && row.length >= 2 && row[0] && row[1]) { // Skip header row
              items.push({
                name: String(row[0]).trim(),
                quantity: Number(row[1]) || 1,
                unit: row[2] ? String(row[2]).trim() : undefined,
                notes: row[3] ? String(row[3]).trim() : undefined
              });
            }
          }
          
          // Send progress update
          const progress = Math.round((endIndex / totalRows) * 100);
          self.postMessage({
            type: 'PARSE_PROGRESS',
            progress
          } as WorkerResponse);
          
          if (endIndex < jsonData.length) {
            // Process next chunk after a small delay
            setTimeout(() => processChunk(endIndex), 10);
          } else {
            resolve(items);
          }
        };
        
        processChunk(1); // Start from row 1 (skip header)
      } catch (error) {
        reject(new Error('Failed to parse Excel file'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};

const parseCSVFile = async (file: File): Promise<ParsedItem[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        
        const items: ParsedItem[] = [];
        const totalLines = lines.length - 1; // Exclude header
        
        // Process lines in chunks
        const processChunk = (startIndex: number) => {
          const chunkSize = 100;
          const endIndex = Math.min(startIndex + chunkSize, lines.length);
          
          for (let i = startIndex; i < endIndex; i++) {
            if (i > 0) { // Skip header row
              const columns = lines[i].split(',').map(col => col.trim().replace(/"/g, ''));
              if (columns.length >= 2 && columns[0] && columns[1]) {
                items.push({
                  name: columns[0],
                  quantity: Number(columns[1]) || 1,
                  unit: columns[2] || undefined,
                  notes: columns[3] || undefined
                });
              }
            }
          }
          
          // Send progress update
          const progress = Math.round((endIndex / totalLines) * 100);
          self.postMessage({
            type: 'PARSE_PROGRESS',
            progress
          } as WorkerResponse);
          
          if (endIndex < lines.length) {
            // Process next chunk after a small delay
            setTimeout(() => processChunk(endIndex), 10);
          } else {
            resolve(items);
          }
        };
        
        processChunk(1); // Start from row 1 (skip header)
      } catch (error) {
        reject(new Error('Failed to parse CSV file'));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
};

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, file, fileType } = event.data;
  
  if (type === 'PARSE_FILE') {
    try {
      let items: ParsedItem[];
      
      if (fileType === 'csv') {
        items = await parseCSVFile(file);
      } else {
        items = await parseExcelFile(file);
      }
      
      self.postMessage({
        type: 'PARSE_SUCCESS',
        data: items
      } as WorkerResponse);
    } catch (error) {
      self.postMessage({
        type: 'PARSE_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      } as WorkerResponse);
    }
  }
};