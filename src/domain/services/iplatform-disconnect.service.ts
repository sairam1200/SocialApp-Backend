export interface IPlatformDisconnectService {
  disconnectPlatformAsync(userId: string, platform: string): Promise<void>;
}

