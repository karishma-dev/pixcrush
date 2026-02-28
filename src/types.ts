export interface ScanResult {
  imageFiles: string[];
  codeFiles: string[];
}

export interface CrushOptions {
  dryRun: boolean;
  quality: number;
  deleteOriginals: boolean;
}

export interface ConversionResult {
  originalPath: string;
  newPath: string;
  originalSize: number;
  newSize: number;
  skipped: boolean;
  error?: string;
}

export interface TrackerResult {
  usedImages: string[];
  unusedImages: string[];
  warnings: string[];
  parseFailureFiles: string[];
}

export interface CodeUpdateResult {
  updatedFilesCount: number;
  parseFailureFiles: string[];
}
