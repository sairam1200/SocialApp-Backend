export interface EmailValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
  mxMethod?: 'mx' | 'a' | 'aaaa' | 'none' | 'timeout' | 'trusted';
}

export interface IEmailValidationService {
  validate(email: string): Promise<EmailValidationResult>;
}
