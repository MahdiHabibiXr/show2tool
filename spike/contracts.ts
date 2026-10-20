export type Task = { id: string; tenant: string; title: string; version: number };
export type Fault = 'none' | 'ignore-filter' | 'wrong-tenant' | 'login-html' | 'drop-after-write' | 'repeat-cursor';
export type Fixture = {
  origin: string;
  readState(): { tasks: Task[]; writes: number };
  setFault(fault: Fault): void;
  expire(): void;
  close(): Promise<void>;
};
