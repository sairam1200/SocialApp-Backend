import { DataProtectionKey } from "../../domain/entities/dataProtectionKey.entity";

export interface IDataProtectionKeyRepository {
  getAllAsync(): Promise<DataProtectionKey[]>;
  getByIdAsync(id: string): Promise<DataProtectionKey | null>;
  getByKeyAsync(key: string): Promise<DataProtectionKey | null>;
  getByUserIdAsync(userId: string): Promise<DataProtectionKey[]>;
  getByUserIdAndKeyAsync(userId: string, key: string): Promise<DataProtectionKey | null>;

  createAsync(key: string, value: string, userId: string, expiresIn?: number): Promise<DataProtectionKey>;
  deleteAsync(dataProtectionKey: DataProtectionKey): Promise<void>;
}