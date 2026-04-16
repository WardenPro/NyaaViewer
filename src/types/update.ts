export interface AutoUpdateStatusEvent {
  type: string;
  version?: string;
  percent?: number;
  message?: string;
}
