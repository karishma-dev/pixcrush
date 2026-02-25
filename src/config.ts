export interface CrushOptions {
  dryRun: boolean;
  quality: number;
  deleteOriginals: boolean;
}

export const DEFAULT_OPTIONS: CrushOptions = {
  dryRun: false,
  quality: 80,
  deleteOriginals: false,
};
