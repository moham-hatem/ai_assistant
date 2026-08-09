export function canSubmitLogin(busy: boolean, email: string, password: string): boolean {
  return !busy && email.trim().length > 0 && password.length > 0;
}
